import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { positionTrackingCampaigns } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import {
  collectCampaignRankings,
  type CampaignCollectReport,
} from "@/server/talordata/collect";

/**
 * 포지션 추적 캠페인의 주기 수집 스케줄.
 *
 * collect_schedule / next_run_at 컬럼은 0008 마이그레이션으로 추가된다.
 * drizzle 스키마(src/db/schema)는 다른 워커 소유이므로 이 모듈은 두 컬럼을
 * raw SQL 로만 접근하고, 마이그레이션 미적용 상태(no such column)에서는
 * 가짜 값 대신 "미적용" 상태를 정직하게 돌려준다.
 *
 * next_run_at 은 다른 감사 컬럼(created_at 등)과 같은 밀리초 epoch 정수다.
 */

export type CollectSchedule = "off" | "daily" | "weekly";
export const COLLECT_SCHEDULES: readonly CollectSchedule[] = ["off", "daily", "weekly"];

const INTERVAL_MS: Record<Exclude<CollectSchedule, "off">, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export const POSITION_TRACKING_DUE_JOB_NAME = "position-tracking-collect-due";

function isMissingColumnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /no such column|no column named|does not exist/i.test(error.message)
  );
}

export interface CampaignScheduleState {
  campaignId: string;
  schedule: CollectSchedule;
  /** 밀리초 epoch. schedule 이 off 이거나 미설정이면 null */
  nextRunAt: number | null;
  /** false 이면 0008 마이그레이션이 아직 적용되지 않은 상태다 */
  migrated: boolean;
}

function toCollectSchedule(value: unknown): CollectSchedule {
  return value === "daily" || value === "weekly" ? value : "off";
}

/** 캠페인 소유권 확인 (drizzle 스키마의 기존 컬럼만 사용). 없으면 404. */
async function requireOwnedCampaign(auth: AuthContext, campaignId: string) {
  const [campaign] = await db
    .select({
      id: positionTrackingCampaigns.id,
      workspaceId: positionTrackingCampaigns.workspaceId,
      domain: positionTrackingCampaigns.domain,
      createdBy: positionTrackingCampaigns.createdBy,
    })
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  return campaign;
}

/** 캠페인의 현재 스케줄을 읽는다. 마이그레이션 미적용 시 migrated=false. */
export async function getCampaignSchedule(
  auth: AuthContext,
  campaignId: string
): Promise<CampaignScheduleState> {
  await requireOwnedCampaign(auth, campaignId);
  try {
    const row = await db.get<{ collect_schedule: unknown; next_run_at: unknown }>(sql`
      SELECT collect_schedule, next_run_at
      FROM position_tracking_campaigns
      WHERE id = ${campaignId}
      LIMIT 1
    `);
    return {
      campaignId,
      schedule: toCollectSchedule(row?.collect_schedule),
      nextRunAt: typeof row?.next_run_at === "number" ? row.next_run_at : null,
      migrated: true,
    };
  } catch (error) {
    if (isMissingColumnError(error)) {
      return { campaignId, schedule: "off", nextRunAt: null, migrated: false };
    }
    throw error;
  }
}

/** 스케줄을 설정하고 다음 실행 시각을 다시 계산한다. */
export async function setCampaignSchedule(
  auth: AuthContext,
  campaignId: string,
  schedule: CollectSchedule
): Promise<CampaignScheduleState> {
  await requireOwnedCampaign(auth, campaignId);
  const nextRunAt =
    schedule === "off" ? null : Date.now() + INTERVAL_MS[schedule];
  try {
    await db.run(sql`
      UPDATE position_tracking_campaigns
      SET collect_schedule = ${schedule},
          next_run_at = ${nextRunAt},
          updated_at = ${Date.now()}
      WHERE id = ${campaignId}
    `);
  } catch (error) {
    if (isMissingColumnError(error)) {
      throw new ApiError(
        "INTERNAL",
        "주기 수집 컬럼이 아직 없습니다. 0008 마이그레이션(npm run db:migrate) 적용 후 이용해 주세요."
      );
    }
    throw error;
  }
  return { campaignId, schedule, nextRunAt, migrated: true };
}

interface DueCampaignRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  domain: string;
  collect_schedule: unknown;
  next_run_at: unknown;
}

/** 실행 시각이 지난 캠페인을 전체 워크스페이스에서 찾는다 (크론 컨텍스트). */
async function listDueCampaigns(nowMs: number, limit: number): Promise<DueCampaignRow[] | null> {
  try {
    const rows = await db.all<DueCampaignRow>(sql`
      SELECT id, workspace_id, created_by, domain, collect_schedule, next_run_at
      FROM position_tracking_campaigns
      WHERE deleted_at IS NULL
        AND collect_schedule != 'off'
        AND next_run_at IS NOT NULL
        AND next_run_at <= ${nowMs}
      ORDER BY next_run_at ASC
      LIMIT ${limit}
    `);
    return rows;
  } catch (error) {
    if (isMissingColumnError(error)) return null;
    throw error;
  }
}

/** 크론 실행용 합성 인증 컨텍스트. collectCampaignRankings 는 workspaceId/userId 만 사용한다. */
function buildCronAuth(campaign: { workspace_id: string; created_by: string | null }): AuthContext {
  return {
    userId: campaign.created_by ?? "system-cron",
    email: "cron@localhost",
    name: "주기 수집 스케줄러",
    workspaceId: campaign.workspace_id,
    workspaceName: "",
    workspacePlan: "pro",
    role: "editor",
    sessionId: "cron",
    ip: null,
    userAgent: null,
  };
}

/**
 * 다음 실행 시각 전진. 수집 자체는 이미 끝난 뒤 호출하므로, 여기서의 실패가
 * 수집 결과를 가리지 않도록 예외를 삼키는 best-effort 로 둔다.
 */
async function advanceNextRun(campaignId: string, schedule: CollectSchedule, fromMs: number) {
  if (schedule === "off") return;
  try {
    await db.run(sql`
      UPDATE position_tracking_campaigns
      SET next_run_at = ${fromMs + INTERVAL_MS[schedule]}
      WHERE id = ${campaignId}
    `);
  } catch (error) {
    console.error("[position-tracking] failed to advance next_run_at", error);
  }
}

export interface DueCollectResult {
  campaignId: string;
  domain: string;
  schedule: CollectSchedule;
  ok: boolean;
  report?: CampaignCollectReport;
  error?: string;
}

export interface DueCollectSummary {
  /** false 이면 0008 마이그레이션 미적용이라 확인 자체를 못 한 상태 */
  migrated: boolean;
  checked: number;
  collected: number;
  failed: number;
  results: DueCollectResult[];
  ranAt: string;
}

/**
 * 실행 시각이 지난 모든 캠페인의 순위를 수집한다.
 * /api/cron/run-due 같은 주기 실행기가 정적으로 import 해 호출할 수 있는
 * 단일 진입점이다. 수집 성공/실패와 무관하게 다음 실행 시각은 항상 전진시켜
 * 실패 캠페인이 매 실행마다 재시도되는 것을 막는다.
 */
export async function collectDueCampaigns(options?: {
  now?: Date;
  limit?: number;
}): Promise<DueCollectSummary> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 10;
  const dueRows = await listDueCampaigns(now.getTime(), limit);

  if (dueRows === null) {
    return { migrated: false, checked: 0, collected: 0, failed: 0, results: [], ranAt: now.toISOString() };
  }

  const results: DueCollectResult[] = [];
  for (const row of dueRows) {
    const schedule = toCollectSchedule(row.collect_schedule);
    try {
      const report = await collectCampaignRankings(buildCronAuth(row), row.id);
      await advanceNextRun(row.id, schedule, now.getTime());
      results.push({ campaignId: row.id, domain: row.domain, schedule, ok: true, report });
    } catch (error) {
      await advanceNextRun(row.id, schedule, now.getTime());
      results.push({
        campaignId: row.id,
        domain: row.domain,
        schedule,
        ok: false,
        error: error instanceof ApiError ? error.message : "수집에 실패했습니다.",
      });
      // 사용량 한도 같은 공급사 오류는 나머지 캠페인도 실패하므로 중단한다.
      if (error instanceof ApiError && (error.code === "RATE_LIMITED" || error.code === "INTERNAL")) {
        break;
      }
    }
  }

  return {
    migrated: true,
    checked: dueRows.length,
    collected: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
    ranAt: now.toISOString(),
  };
}

export interface DueRunForCampaign {
  skipped: boolean;
  reason?: "schedule_off" | "not_due" | "not_migrated";
  nextRunAt: number | null;
  report?: CampaignCollectReport;
}

/**
 * 단일 캠페인의 due 여부를 확인하고, 실행 시각이 지났을 때만 수집한다.
 * 수동 수집은 기존 /api/serp/collect-campaign 을 쓰고, 이 경로는 스케줄 실행 전용이다.
 */
export async function collectCampaignIfDue(
  auth: AuthContext,
  campaignId: string
): Promise<DueRunForCampaign> {
  const state = await getCampaignSchedule(auth, campaignId);
  if (!state.migrated) {
    return { skipped: true, reason: "not_migrated", nextRunAt: null };
  }
  if (state.schedule === "off") {
    return { skipped: true, reason: "schedule_off", nextRunAt: null };
  }
  const nowMs = Date.now();
  if (state.nextRunAt !== null && state.nextRunAt > nowMs) {
    return { skipped: true, reason: "not_due", nextRunAt: state.nextRunAt };
  }

  const report = await collectCampaignRankings(auth, campaignId);
  await advanceNextRun(campaignId, state.schedule, nowMs);
  return {
    skipped: false,
    nextRunAt: nowMs + INTERVAL_MS[state.schedule],
    report,
  };
}

/* ------------------------------------------------------------------ */
/* registerDueJob 연동 (런타임 가드)                                   */
/* ------------------------------------------------------------------ */

/**
 * src/server/providers/scheduler.ts 는 다른 워커 소유이며 아직 없을 수 있다.
 * 아래 등록 절차는 어떤 단계든 실패해도 예외를 삼키고 registered=false 를
 * 돌려준다. 스케줄러 모듈이 없어도 collect-due 라우트와 collectDueCampaigns()
 * 정적 import 만으로 주기 수집은 동작한다.
 */

export interface DueJobRegistration {
  registered: boolean;
  via?: "global-registry" | "module-import";
  reason?: string;
}

interface DueJobDescriptor {
  name: string;
  description: string;
  handler: typeof collectDueCampaigns;
}

const DUE_JOB: DueJobDescriptor = {
  name: POSITION_TRACKING_DUE_JOB_NAME,
  description: "포지션 추적 캠페인 주기 수집 (collect_schedule 이 due 인 캠페인)",
  handler: collectDueCampaigns,
};

type RegisterDueJobFn = (...args: unknown[]) => unknown;

function tryCallRegister(registerDueJob: RegisterDueJobFn): boolean {
  // 시그니처가 확정되지 않았으므로 두 가지 호출 형태를 모두 시도한다.
  try {
    registerDueJob(DUE_JOB);
    return true;
  } catch {
    // 객체 형태가 아니면 (name, handler) 형태로 재시도
  }
  try {
    registerDueJob(DUE_JOB.name, DUE_JOB.handler);
    return true;
  } catch {
    return false;
  }
}

let registrationSucceeded = false;

export async function registerPositionTrackingDueJob(): Promise<DueJobRegistration> {
  if (registrationSucceeded) {
    return { registered: true, via: "module-import" };
  }

  // 1) 전역 레지스트리: 스케줄러가 import 없이 호출 가능한 등록점을 열어둔 경우.
  const globalRegistry = (
    globalThis as { __semforgeDueJobRegistry?: { registerDueJob?: RegisterDueJobFn } }
  ).__semforgeDueJobRegistry;
  if (globalRegistry && typeof globalRegistry.registerDueJob === "function") {
    if (tryCallRegister(globalRegistry.registerDueJob)) {
      registrationSucceeded = true;
      return { registered: true, via: "global-registry" };
    }
  }

  // 2) 모듈 import: 파일이 실제로 있을 때만 시도한다.
  //    webpackIgnore 로 번들 대상에서 제외해, 파일이 없어도 빌드가 깨지지 않게 한다.
  //    Node 런타임이 TS 를 직접 로드하지 못하거나 모듈의 내부 alias 해석이
  //    실패하면 catch 로 흡수한다 — 이 경우 주기 실행기(/api/cron/run-due)가
  //    collectDueCampaigns 를 정적 import 하거나 collect-due 라우트를 호출하는
  //    방식으로 연결하면 된다.
  const schedulerPath = path.join(process.cwd(), "src", "server", "providers", "scheduler.ts");
  if (!fs.existsSync(schedulerPath)) {
    return { registered: false, reason: "scheduler module not present" };
  }
  try {
    const moduleUrl = pathToFileURL(schedulerPath).href;
    const mod = (await import(/* webpackIgnore: true */ moduleUrl)) as {
      registerDueJob?: RegisterDueJobFn;
    };
    if (typeof mod.registerDueJob !== "function") {
      return { registered: false, reason: "registerDueJob export not found" };
    }
    if (!tryCallRegister(mod.registerDueJob)) {
      return { registered: false, reason: "registerDueJob signature mismatch" };
    }
    registrationSucceeded = true;
    return { registered: true, via: "module-import" };
  } catch (error) {
    return {
      registered: false,
      reason: error instanceof Error ? error.message : "scheduler import failed",
    };
  }
}
