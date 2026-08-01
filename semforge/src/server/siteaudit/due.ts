import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteAuditCampaigns, users } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import {
  listDueScheduleRows,
  markScheduleRun,
  registerDueJob,
  type DueJobOutcome,
} from "@/server/providers/scheduler";
import {
  enqueueSiteAuditRun,
  executeSiteAuditRun,
  recoverSiteAuditRuns,
} from "@/server/siteaudit/run";
import { computeSiteAuditNextRunAt } from "@/server/siteaudit/schedule";

/**
 * 사이트 진단 스케줄 크롤 due job.
 *
 * 외부 cron/launchd 가 GET /api/cron/run-due 를 주기 호출하면
 * providers/scheduler 레지스트리에 등록된 이 핸들러가
 * next_run_at 이 지난 캠페인을 찾아 실제 크롤(runSiteAuditCampaign)을 실행하고
 * 다음 실행 시각을 밀어 놓는다.
 *
 * 레지스트리는 globalThis 기반이라, 이 모듈이 한 번이라도 import 된 프로세스에서는
 * 등록이 유지된다. run/schedule 라우트가 이 모듈을 import 해 등록을 보장한다.
 * (providers/scheduler.ts 는 다른 워커 소유 — 여기서는 등록 코드만 연결한다)
 */

export const SITE_AUDIT_DUE_JOB = "site_audit";

/** cron 실행에는 세션이 없으므로 캠페인 소유 워크스페이스 기준 시스템 컨텍스트를 만든다. */
function systemAuth(campaign: {
  workspaceId: string;
  createdBy: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
}): AuthContext {
  return {
    userId: campaign.createdBy ?? "due-scheduler",
    email: campaign.ownerEmail ?? "due-scheduler@system.local",
    name: campaign.ownerName ?? "스케줄 크롤",
    workspaceId: campaign.workspaceId,
    workspaceName: "",
    workspacePlan: "free",
    role: "owner",
    sessionId: "due-scheduler",
    ip: null,
    userAgent: null,
  };
}

async function runDueSiteAudits(context: {
  now: Date;
  limit: number;
}): Promise<Partial<DueJobOutcome>> {
  const dueRows = listDueScheduleRows({
    table: "site_audit_campaigns",
    now: context.now,
    limit: context.limit,
  });

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  // 이전 응답의 after() 작업이 프로세스 종료 등으로 시작되지 못한 경우 먼저 회수한다.
  const recovery = await recoverSiteAuditRuns({ now: context.now, limit: context.limit });
  processed += recovery.recovered;
  failed += recovery.failed;
  errors.push(...recovery.errors);

  // 연쇄 크롤이 서버/대상 사이트에 부하를 주지 않도록 순차 실행한다.
  for (const due of dueRows) {
    const [campaign] = await db
      .select({
        id: siteAuditCampaigns.id,
        name: siteAuditCampaigns.name,
        workspaceId: siteAuditCampaigns.workspaceId,
        schedule: siteAuditCampaigns.schedule,
        createdBy: siteAuditCampaigns.createdBy,
        deletedAt: siteAuditCampaigns.deletedAt,
      })
      .from(siteAuditCampaigns)
      .where(and(eq(siteAuditCampaigns.id, due.id), isNull(siteAuditCampaigns.deletedAt)))
      .limit(1);

    // 삭제됐거나 스케줄이 꺼진 행은 재스캔 대상에서 제외한다.
    if (!campaign || campaign.schedule === "off") {
      markScheduleRun({ table: "site_audit_campaigns", id: due.id, nextRunAt: null });
      continue;
    }

    const [owner] = campaign.createdBy
      ? await db
          .select({ email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, campaign.createdBy))
          .limit(1)
      : [];
    const auth = systemAuth({
      ...campaign,
      ownerEmail: owner?.email,
      ownerName: owner?.name,
    });
    const nextRunAt = computeSiteAuditNextRunAt(
      campaign.schedule as "daily" | "weekly" | "monthly",
      context.now
    );
    try {
      const run = await enqueueSiteAuditRun(auth, campaign.id);
      const result = await executeSiteAuditRun(auth, run.id);
      if (result.status === "completed") processed += 1;
      else {
        failed += 1;
        errors.push(`${campaign.name}: ${result.message}`);
      }
    } catch (error) {
      failed += 1;
      errors.push(
        `${campaign.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // 성공/실패와 무관하게 다음 실행 시각을 밀어, 실패한 캠페인이
      // 매 호출마다 즉시 재실행되는 루프를 막는다.
      markScheduleRun({ table: "site_audit_campaigns", id: campaign.id, nextRunAt });
    }
  }

  return { scanned: dueRows.length, processed, failed, errors };
}

let registered = false;

/** due job 등록 (멱등). providers/scheduler 미존재/변경 시 경고만 남기고 스킵한다. */
export function ensureSiteAuditDueJob(): void {
  if (registered) return;
  try {
    registerDueJob(SITE_AUDIT_DUE_JOB, runDueSiteAudits);
    registered = true;
  } catch (error) {
    console.warn(
      "[siteaudit] due job 등록에 실패했습니다. 스케줄 크롤이 비활성입니다.",
      error
    );
  }
}

ensureSiteAuditDueJob();
