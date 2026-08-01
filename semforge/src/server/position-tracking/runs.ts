import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  appNotifications,
  folders,
  positionTrackingCampaigns,
  positionTrackingObservations,
  positionTrackingRunItems,
  positionTrackingRuns,
  positionTrackingSubscriptions,
  positionTrackingVisibilityHistory,
  trackedKeywords,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { MAX_TRACKING_KEYWORDS, type SetupKeyword } from "@/lib/position-tracking/keywords";
import { defaultTrackingLocation, getTrackingLocation } from "@/lib/position-tracking/locations";
import {
  normalizeTrackingTarget,
  registrableDomain,
  trackingTargetBelongsToDomain,
  type TrackingTargetType,
} from "@/lib/position-tracking/targets";
import type { AuthContext } from "@/lib/session";
import {
  collectTrackingObservation,
  getPositionTrackingCapabilities,
  type TrackingEngine,
} from "@/server/position-tracking/providers";

export type RunTrigger = "initial" | "manual" | "scheduled";

export interface SetupPositionTrackingInput {
  campaignId?: string;
  folderId?: string | null;
  domain: string;
  name?: string;
  target: { type: TrackingTargetType; value: string };
  searchEngine: TrackingEngine;
  device: "desktop" | "mobile" | "tablet";
  locationKey: string;
  businessName?: string | null;
  keywords: SetupKeyword[];
  weeklyDigestEnabled: boolean;
  idempotencyKey: string;
}

export interface PositionTrackingRunView {
  id: string;
  campaignId: string;
  trigger: RunTrigger;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentKeyword: string | null;
  error: string | null;
  items: {
    id: string;
    keywordId: string;
    keyword: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    attempts: number;
    error: string | null;
  }[];
  createdAt: string;
  completedAt: string | null;
}

async function requireOwnedCampaign(auth: AuthContext, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  if (!campaign) throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  return campaign;
}

async function requireOwnedRun(auth: AuthContext, runId: string) {
  const [run] = await db
    .select()
    .from(positionTrackingRuns)
    .where(and(eq(positionTrackingRuns.id, runId), eq(positionTrackingRuns.workspaceId, auth.workspaceId)))
    .limit(1);
  if (!run) throw new ApiError("NOT_FOUND", "포지션 추적 실행을 찾을 수 없습니다.");
  return run;
}

function cleanKeywords(keywords: SetupKeyword[]): SetupKeyword[] {
  const seen = new Set<string>();
  const result: SetupKeyword[] = [];
  for (const row of keywords) {
    const keyword = row.keyword.trim().replace(/\s+/g, " ").slice(0, 200);
    const key = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    result.push({
      keyword,
      tags: [...new Set(row.tags.map((tag) => tag.trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))].slice(0, 20),
    });
  }
  if (result.length === 0) throw new ApiError("VALIDATION_ERROR", "추적할 키워드를 한 개 이상 추가해 주세요.");
  if (result.length > MAX_TRACKING_KEYWORDS) {
    throw new ApiError("PLAN_LIMIT", `캠페인당 키워드는 최대 ${MAX_TRACKING_KEYWORDS}개입니다.`);
  }
  return result;
}

export async function setupPositionTracking(
  auth: AuthContext,
  input: SetupPositionTrackingInput
): Promise<{ campaignId: string; runId: string; total: number; reused: boolean }> {
  const [duplicate] = await db
    .select({ id: positionTrackingCampaigns.id })
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        eq(positionTrackingCampaigns.setupRequestId, input.idempotencyKey)
      )
    )
    .limit(1);
  if (duplicate) {
    const [run] = await db
      .select({ id: positionTrackingRuns.id, total: positionTrackingRuns.totalCount })
      .from(positionTrackingRuns)
      .where(eq(positionTrackingRuns.campaignId, duplicate.id))
      .orderBy(desc(positionTrackingRuns.createdAt))
      .limit(1);
    if (run) return { campaignId: duplicate.id, runId: run.id, total: run.total, reused: true };
  }

  let projectDomain = registrableDomain(input.domain);
  if (input.folderId) {
    const [folder] = await db
      .select({ id: folders.id, domain: folders.domain })
      .from(folders)
      .where(
        and(
          eq(folders.id, input.folderId),
          eq(folders.workspaceId, auth.workspaceId),
          isNull(folders.deletedAt)
        )
      )
      .limit(1);
    if (!folder) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
    projectDomain = registrableDomain(folder.domain);
  }
  if (!projectDomain) throw new ApiError("VALIDATION_ERROR", "프로젝트 도메인을 확인해 주세요.");

  const location = getTrackingLocation(input.locationKey);
  if (!location) throw new ApiError("VALIDATION_ERROR", "지원하는 위치를 선택해 주세요.");
  const capabilities = getPositionTrackingCapabilities();
  const engineCapability = capabilities.engines[input.searchEngine];
  if (!engineCapability.enabled) {
    throw new ApiError("VALIDATION_ERROR", engineCapability.reason ?? "선택한 검색 엔진을 사용할 수 없습니다.");
  }
  if ((input.searchEngine === "google" || input.searchEngine === "bing") && !capabilities.devices[input.device].enabled) {
    throw new ApiError("VALIDATION_ERROR", capabilities.devices[input.device].reason ?? "선택한 기기를 사용할 수 없습니다.");
  }

  let targetValue: string;
  try {
    targetValue = normalizeTrackingTarget(input.target.type, input.target.value);
  } catch (error) {
    throw new ApiError("VALIDATION_ERROR", error instanceof Error ? error.message : "추적 대상을 확인해 주세요.");
  }
  if (!trackingTargetBelongsToDomain(input.target.type, targetValue, projectDomain)) {
    throw new ApiError("VALIDATION_ERROR", "추적 대상은 현재 프로젝트 도메인에 속해야 합니다.");
  }
  const keywords = cleanKeywords(input.keywords);
  const existingCampaign = input.campaignId
    ? await requireOwnedCampaign(auth, input.campaignId)
    : null;
  const campaignId = existingCampaign?.id ?? newId("ptc");
  const runId = newId("ptr");
  const keywordRows = keywords.map((keyword) => ({ ...keyword, id: newId("tkw") }));
  const baseName = input.name?.trim() || `${targetValue} · ${input.searchEngine} · ${location.city}`;
  const [sameName] = await db
    .select({ id: positionTrackingCampaigns.id })
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        eq(positionTrackingCampaigns.name, baseName),
        existingCampaign ? ne(positionTrackingCampaigns.id, existingCampaign.id) : undefined,
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  const name = sameName ? `${baseName} · ${campaignId.slice(-6)}` : baseName;
  const now = new Date();

  db.transaction((tx) => {
    const campaignValues = {
      folderId: input.folderId ?? existingCampaign?.folderId ?? null,
      name,
      domain: projectDomain,
      targetType: input.target.type,
      targetValue,
      location: location.label,
      countryCode: location.countryCode,
      languageCode: location.languageCode,
      locationKey: location.key,
      locationLabel: location.label,
      businessName: input.businessName?.trim() || null,
      weeklyDigestEnabled: input.weeklyDigestEnabled,
      setupRequestId: input.idempotencyKey,
      device: input.searchEngine === "chatgpt" || input.searchEngine === "gemini" ? "desktop" as const : input.device,
      searchEngine: input.searchEngine,
      collectSchedule: "weekly" as const,
      nextRunAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      updatedAt: now,
      updatedBy: auth.userId,
    };
    if (existingCampaign) {
      tx.update(positionTrackingCampaigns)
        .set(campaignValues)
        .where(eq(positionTrackingCampaigns.id, campaignId))
        .run();
    } else {
      tx.insert(positionTrackingCampaigns).values({
        id: campaignId,
        workspaceId: auth.workspaceId,
        ...campaignValues,
        createdBy: auth.userId,
      }).run();
    }
    tx.insert(trackedKeywords).values(keywordRows.map((keyword) => ({
      id: keyword.id,
      campaignId,
      keyword: keyword.keyword,
      tags: JSON.stringify(keyword.tags),
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }))).run();
    tx.insert(positionTrackingRuns).values({
      id: runId,
      workspaceId: auth.workspaceId,
      campaignId,
      trigger: "initial",
      status: "queued",
      totalCount: keywordRows.length,
      createdBy: auth.userId,
    }).run();
    tx.insert(positionTrackingRunItems).values(keywordRows.map((keyword) => ({
      id: newId("pti"),
      runId,
      trackedKeywordId: keyword.id,
      status: "queued" as const,
    }))).run();
    tx.insert(positionTrackingSubscriptions).values({
      id: newId("pts"),
      workspaceId: auth.workspaceId,
      campaignId,
      userId: auth.userId,
      weeklyDigestEnabled: input.weeklyDigestEnabled,
    }).onConflictDoUpdate({
      target: [positionTrackingSubscriptions.campaignId, positionTrackingSubscriptions.userId],
      set: { weeklyDigestEnabled: input.weeklyDigestEnabled, updatedAt: now },
    }).run();
  });

  return { campaignId, runId, total: keywordRows.length, reused: false };
}

export async function createPositionTrackingRun(
  auth: AuthContext,
  campaignId: string,
  trigger: RunTrigger = "manual"
): Promise<{ runId: string; total: number; reused: boolean }> {
  await requireOwnedCampaign(auth, campaignId);
  const [active] = await db
    .select({ id: positionTrackingRuns.id, total: positionTrackingRuns.totalCount })
    .from(positionTrackingRuns)
    .where(
      and(
        eq(positionTrackingRuns.campaignId, campaignId),
        inArray(positionTrackingRuns.status, ["queued", "running"])
      )
    )
    .orderBy(desc(positionTrackingRuns.createdAt))
    .limit(1);
  if (active) return { runId: active.id, total: active.total, reused: true };
  const keywords = await db
    .select({ id: trackedKeywords.id })
    .from(trackedKeywords)
    .where(and(eq(trackedKeywords.campaignId, campaignId), isNull(trackedKeywords.deletedAt)))
    .orderBy(asc(trackedKeywords.createdAt))
    .limit(MAX_TRACKING_KEYWORDS);
  if (keywords.length === 0) throw new ApiError("VALIDATION_ERROR", "수집할 추적 키워드가 없습니다.");
  const runId = newId("ptr");
  db.transaction((tx) => {
    tx.insert(positionTrackingRuns).values({
      id: runId,
      workspaceId: auth.workspaceId,
      campaignId,
      trigger,
      status: "queued",
      totalCount: keywords.length,
      createdBy: auth.userId,
    }).run();
    tx.insert(positionTrackingRunItems).values(keywords.map((keyword) => ({
      id: newId("pti"),
      runId,
      trackedKeywordId: keyword.id,
      status: "queued" as const,
    }))).run();
  });
  return { runId, total: keywords.length, reused: false };
}

export async function getPositionTrackingRun(
  auth: AuthContext,
  runId: string
): Promise<PositionTrackingRunView> {
  const run = await requireOwnedRun(auth, runId);
  const items = await db
    .select({
      id: positionTrackingRunItems.id,
      keywordId: trackedKeywords.id,
      keyword: trackedKeywords.keyword,
      status: positionTrackingRunItems.status,
      attempts: positionTrackingRunItems.attemptCount,
      error: positionTrackingRunItems.errorMessage,
    })
    .from(positionTrackingRunItems)
    .innerJoin(trackedKeywords, eq(trackedKeywords.id, positionTrackingRunItems.trackedKeywordId))
    .where(eq(positionTrackingRunItems.runId, runId))
    .orderBy(asc(trackedKeywords.createdAt));
  return {
    id: run.id,
    campaignId: run.campaignId,
    trigger: run.trigger,
    status: run.status,
    total: run.totalCount,
    processed: run.processedCount,
    succeeded: run.successCount,
    failed: run.failedCount,
    currentKeyword: run.currentKeyword,
    error: run.errorMessage,
    items,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function weekKey(date: Date): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - weekday + 1);
  return start.toISOString().slice(0, 10);
}

async function createWeeklyDigest(runId: string, campaignId: string, succeeded: number, failed: number) {
  const [campaign] = await db
    .select({ workspaceId: positionTrackingCampaigns.workspaceId, name: positionTrackingCampaigns.name })
    .from(positionTrackingCampaigns)
    .where(eq(positionTrackingCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) return;
  const subscriptions = await db
    .select()
    .from(positionTrackingSubscriptions)
    .where(
      and(
        eq(positionTrackingSubscriptions.campaignId, campaignId),
        eq(positionTrackingSubscriptions.weeklyDigestEnabled, true)
      )
    );
  if (subscriptions.length === 0) return;
  const now = new Date();
  await db.insert(appNotifications).values(subscriptions.map((subscription) => ({
    id: newId("ntf"),
    workspaceId: campaign.workspaceId,
    userId: subscription.userId,
    type: "position_tracking_weekly",
    title: `${campaign.name} 주간 순위 업데이트`,
    message: `${succeeded}개 키워드 수집 완료${failed > 0 ? ` · ${failed}개 실패` : ""}`,
    href: `/position-tracking/?campaign=${encodeURIComponent(campaignId)}&run=${encodeURIComponent(runId)}`,
    dedupeKey: `position:${campaignId}:${weekKey(now)}`,
  }))).onConflictDoNothing();
}

function visibilityFromPositions(positions: (number | null)[]): number {
  if (positions.length === 0) return 0;
  const score = positions.reduce<number>((sum, position) => {
    if (position === null || position > 100) return sum;
    return sum + (101 - position);
  }, 0);
  return Math.round(Math.min(100, score / positions.length));
}

async function refreshRunState(auth: AuthContext, runId: string): Promise<PositionTrackingRunView> {
  const run = await requireOwnedRun(auth, runId);
  const rows = await db
    .select({ status: positionTrackingRunItems.status })
    .from(positionTrackingRunItems)
    .where(eq(positionTrackingRunItems.runId, runId));
  const succeeded = rows.filter((row) => row.status === "succeeded").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const processed = succeeded + failed + rows.filter((row) => row.status === "cancelled").length;
  const active = rows.some((row) => row.status === "queued" || row.status === "running");
  const status = active
    ? "running"
    : succeeded === 0
      ? "failed"
      : failed > 0
        ? "partial"
        : "completed";
  const completedAt = active ? null : new Date();
  await db
    .update(positionTrackingRuns)
    .set({
      status,
      processedCount: processed,
      successCount: succeeded,
      failedCount: failed,
      currentKeyword: active ? run.currentKeyword : null,
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(positionTrackingRuns.id, runId));

  if (!active && succeeded > 0 && !run.completedAt) {
    const positions = await db
      .select({ position: trackedKeywords.position })
      .from(positionTrackingRunItems)
      .innerJoin(trackedKeywords, eq(trackedKeywords.id, positionTrackingRunItems.trackedKeywordId))
      .where(eq(positionTrackingRunItems.runId, runId));
    const visibility = visibilityFromPositions(positions.map((row) => row.position));
    await db
      .update(positionTrackingCampaigns)
      .set({ visibility, updatedAt: new Date(), updatedBy: auth.userId })
      .where(eq(positionTrackingCampaigns.id, run.campaignId));
    await db.insert(positionTrackingVisibilityHistory).values({
      id: newId("pvh"),
      campaignId: run.campaignId,
      visibility,
      rankedCount: positions.filter((row) => row.position !== null).length,
      keywordCount: positions.length,
      source: "position-tracking-run",
      capturedAt: completedAt!,
    });
    if (run.trigger === "scheduled") {
      await createWeeklyDigest(run.id, run.campaignId, succeeded, failed);
    }
  }
  return getPositionTrackingRun(auth, runId);
}

export async function processNextPositionTrackingItem(
  auth: AuthContext,
  runId: string
): Promise<PositionTrackingRunView> {
  const existingRun = await requireOwnedRun(auth, runId);
  if (existingRun.status !== "queued" && existingRun.status !== "running") {
    return getPositionTrackingRun(auth, runId);
  }
  const claimed = db.transaction((tx) => {
    const item = tx
      .select({
        id: positionTrackingRunItems.id,
        trackedKeywordId: positionTrackingRunItems.trackedKeywordId,
        keyword: trackedKeywords.keyword,
      })
      .from(positionTrackingRunItems)
      .innerJoin(trackedKeywords, eq(trackedKeywords.id, positionTrackingRunItems.trackedKeywordId))
      .where(and(eq(positionTrackingRunItems.runId, runId), eq(positionTrackingRunItems.status, "queued")))
      .orderBy(asc(trackedKeywords.createdAt))
      .limit(1)
      .get();
    if (!item) return null;
    const updated = tx
      .update(positionTrackingRunItems)
      .set({
        status: "running",
        startedAt: new Date(),
        attemptCount: sql`${positionTrackingRunItems.attemptCount} + 1`,
      })
      .where(and(eq(positionTrackingRunItems.id, item.id), eq(positionTrackingRunItems.status, "queued")))
      .returning({ id: positionTrackingRunItems.id })
      .get();
    if (!updated) return null;
    tx.update(positionTrackingRuns)
      .set({ status: "running", currentKeyword: item.keyword, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(positionTrackingRuns.id, runId))
      .run();
    return item;
  });

  if (!claimed) return refreshRunState(auth, runId);
  const run = await requireOwnedRun(auth, runId);
  const campaign = await requireOwnedCampaign(auth, run.campaignId);
  const location = getTrackingLocation(campaign.locationKey) ?? defaultTrackingLocation(campaign.domain);
  try {
    const observation = await collectTrackingObservation({
      keyword: claimed.keyword,
      engine: campaign.searchEngine,
      device: campaign.device,
      targetType: campaign.targetType,
      targetValue: campaign.targetValue || campaign.domain,
      businessName: campaign.businessName,
      location,
    });
    if ((await requireOwnedRun(auth, runId)).status === "cancelled") {
      return getPositionTrackingRun(auth, runId);
    }
    const [keyword] = await db
      .select({ position: trackedKeywords.position })
      .from(trackedKeywords)
      .where(eq(trackedKeywords.id, claimed.trackedKeywordId))
      .limit(1);
    db.transaction((tx) => {
      tx.update(trackedKeywords).set({
        previousPosition: keyword?.position ?? null,
        position: observation.position,
        lastResultUrl: observation.url,
        mentioned: observation.mentioned,
        lastError: null,
        lastCollectedAt: observation.capturedAt,
        updatedAt: new Date(),
        updatedBy: auth.userId,
      }).where(eq(trackedKeywords.id, claimed.trackedKeywordId)).run();
      tx.insert(positionTrackingObservations).values({
        id: newId("pto"),
        campaignId: campaign.id,
        runId,
        trackedKeywordId: claimed.trackedKeywordId,
        measurementKind: observation.measurementKind,
        position: observation.position,
        url: observation.url,
        mentioned: observation.mentioned,
        localPackPosition: observation.localPackPosition,
        features: JSON.stringify(observation.features),
        citations: JSON.stringify(observation.citations),
        source: observation.source,
        capturedAt: observation.capturedAt,
      }).run();
      tx.update(positionTrackingRunItems).set({
        status: "succeeded",
        errorMessage: null,
        completedAt: new Date(),
      }).where(eq(positionTrackingRunItems.id, claimed.id)).run();
    });
  } catch (error) {
    if ((await requireOwnedRun(auth, runId)).status === "cancelled") {
      return getPositionTrackingRun(auth, runId);
    }
    const message = error instanceof ApiError ? error.message : "수집에 실패했습니다.";
    db.transaction((tx) => {
      tx.update(trackedKeywords).set({
        lastError: message,
        lastCollectedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: auth.userId,
      }).where(eq(trackedKeywords.id, claimed.trackedKeywordId)).run();
      tx.update(positionTrackingRunItems).set({
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      }).where(eq(positionTrackingRunItems.id, claimed.id)).run();
    });
  }
  return refreshRunState(auth, runId);
}

export async function cancelPositionTrackingRun(
  auth: AuthContext,
  runId: string,
): Promise<PositionTrackingRunView> {
  const run = await requireOwnedRun(auth, runId);
  if (run.status !== "queued" && run.status !== "running") {
    return getPositionTrackingRun(auth, runId);
  }
  const items = await db
    .select({ status: positionTrackingRunItems.status })
    .from(positionTrackingRunItems)
    .where(eq(positionTrackingRunItems.runId, runId));
  const succeeded = items.filter((item) => item.status === "succeeded").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const now = new Date();
  db.transaction((tx) => {
    tx.update(positionTrackingRunItems)
      .set({ status: "cancelled", completedAt: now })
      .where(
        and(
          eq(positionTrackingRunItems.runId, runId),
          inArray(positionTrackingRunItems.status, ["queued", "running"]),
        ),
      )
      .run();
    tx.update(positionTrackingRuns)
      .set({
        status: "cancelled",
        processedCount: items.length,
        successCount: succeeded,
        failedCount: failed,
        currentKeyword: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(positionTrackingRuns.id, runId))
      .run();
  });
  return getPositionTrackingRun(auth, runId);
}

export async function retryFailedPositionTrackingItems(
  auth: AuthContext,
  runId: string
): Promise<PositionTrackingRunView> {
  const run = await requireOwnedRun(auth, runId);
  if (run.status === "cancelled") {
    throw new ApiError("VALIDATION_ERROR", "취소된 실행은 재시도할 수 없습니다.");
  }
  if (run.status === "queued" || run.status === "running") {
    throw new ApiError("VALIDATION_ERROR", "진행 중인 실행은 재시도할 수 없습니다.");
  }
  await db
    .update(positionTrackingRunItems)
    .set({ status: "queued", errorMessage: null, startedAt: null, completedAt: null })
    .where(and(eq(positionTrackingRunItems.runId, runId), eq(positionTrackingRunItems.status, "failed")));
  await db
    .update(positionTrackingRuns)
    .set({ status: "queued", errorMessage: null, currentKeyword: null, completedAt: null, updatedAt: new Date() })
    .where(eq(positionTrackingRuns.id, runId));
  return refreshRunState(auth, runId);
}

export async function drainPositionTrackingRun(
  auth: AuthContext,
  runId: string
): Promise<PositionTrackingRunView> {
  let view = await getPositionTrackingRun(auth, runId);
  let remaining = Math.max(1, view.total + 1);
  while ((view.status === "queued" || view.status === "running") && remaining > 0) {
    view = await processNextPositionTrackingItem(auth, runId);
    remaining -= 1;
  }
  return view;
}
