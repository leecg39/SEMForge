import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiVisibilityCitations,
  aiVisibilityObservations,
  aiVisibilityProjects,
  aiVisibilityPrompts,
  aiVisibilityRunItems,
  aiVisibilityRuns,
  type AiVisibilityProvider,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { getTrackingLocation } from "@/lib/position-tracking/locations";
import type { AuthContext } from "@/lib/session";
import {
  collectAiSearchObservation,
  domainMatches,
  getAiSearchCapabilities,
} from "@/server/ai-search/providers";
import { generateBrandPerformanceReportsForRun } from "./brand-performance";
import { getAiVisibilityProjectBundle, requireAiVisibilityProject } from "./projects";

export type AiVisibilityRunTrigger = "initial" | "manual" | "scheduled" | "migration";

export interface AiVisibilityRunView {
  id: string;
  folderId: string;
  projectId: string;
  trigger: AiVisibilityRunTrigger;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  completeness: number;
  currentPrompt: string | null;
  error: string | null;
  items: {
    id: string;
    promptId: string;
    prompt: string;
    provider: AiVisibilityProvider;
    countryCode: string;
    locationKey: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    attempts: number;
    error: string | null;
  }[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

async function requireOwnedRun(auth: AuthContext, runId: string) {
  const [row] = await db
    .select({ run: aiVisibilityRuns, folderId: aiVisibilityProjects.folderId })
    .from(aiVisibilityRuns)
    .innerJoin(aiVisibilityProjects, eq(aiVisibilityProjects.id, aiVisibilityRuns.projectId))
    .where(
      and(
        eq(aiVisibilityRuns.id, runId),
        eq(aiVisibilityRuns.workspaceId, auth.workspaceId),
      ),
    )
    .limit(1);
  if (!row) throw new ApiError("NOT_FOUND", "AI 가시성 실행을 찾을 수 없습니다.");
  return row;
}

export async function createAiVisibilityRun(
  auth: AuthContext,
  folderId: string,
  trigger: AiVisibilityRunTrigger = "manual",
): Promise<{ runId: string; total: number; reused: boolean; disabledProviders: AiVisibilityProvider[] }> {
  const bundle = await getAiVisibilityProjectBundle(auth, folderId);
  const [active] = await db
    .select({ id: aiVisibilityRuns.id, total: aiVisibilityRuns.totalCount })
    .from(aiVisibilityRuns)
    .where(
      and(
        eq(aiVisibilityRuns.projectId, bundle.project.id),
        inArray(aiVisibilityRuns.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(aiVisibilityRuns.createdAt))
    .limit(1);
  const capabilities = getAiSearchCapabilities();
  const enabledProviders = bundle.providers.filter(
    (provider) => capabilities.providers[provider].enabled,
  );
  const disabledProviders = bundle.providers.filter(
    (provider) => !capabilities.providers[provider].enabled,
  );
  if (active) {
    return { runId: active.id, total: active.total, reused: true, disabledProviders };
  }
  if (bundle.prompts.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "수집할 활성 프롬프트가 없습니다.");
  }
  if (bundle.scopes.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "수집할 국가를 먼저 설정해 주세요.");
  }
  if (enabledProviders.length === 0) {
    const reasons = disabledProviders
      .map((provider) => capabilities.providers[provider].reason)
      .filter(Boolean)
      .join(" ");
    throw new ApiError("VALIDATION_ERROR", reasons || "사용 가능한 AI 플랫폼이 없습니다.");
  }

  const items = bundle.prompts.flatMap((prompt) =>
    enabledProviders.flatMap((provider) =>
      bundle.scopes.map((scope) => ({ prompt, provider, scope })),
    ),
  );
  const runId = newId("avr");
  db.transaction((tx) => {
    tx.insert(aiVisibilityRuns).values({
      id: runId,
      workspaceId: auth.workspaceId,
      projectId: bundle.project.id,
      trigger,
      status: "queued",
      totalCount: items.length,
      createdBy: auth.userId,
    }).run();
    tx.insert(aiVisibilityRunItems).values(items.map(({ prompt, provider, scope }) => ({
      id: newId("avi"),
      runId,
      promptId: prompt.id,
      provider,
      countryCode: scope.countryCode,
      locationKey: scope.locationKey,
      status: "queued" as const,
    }))).run();
  });
  return { runId, total: items.length, reused: false, disabledProviders };
}

export async function getAiVisibilityRun(
  auth: AuthContext,
  runId: string,
): Promise<AiVisibilityRunView> {
  const { run, folderId } = await requireOwnedRun(auth, runId);
  const items = await db
    .select({
      id: aiVisibilityRunItems.id,
      promptId: aiVisibilityPrompts.id,
      prompt: aiVisibilityPrompts.prompt,
      provider: aiVisibilityRunItems.provider,
      countryCode: aiVisibilityRunItems.countryCode,
      locationKey: aiVisibilityRunItems.locationKey,
      status: aiVisibilityRunItems.status,
      attempts: aiVisibilityRunItems.attemptCount,
      error: aiVisibilityRunItems.errorMessage,
    })
    .from(aiVisibilityRunItems)
    .innerJoin(aiVisibilityPrompts, eq(aiVisibilityPrompts.id, aiVisibilityRunItems.promptId))
    .where(eq(aiVisibilityRunItems.runId, runId))
    .orderBy(asc(aiVisibilityPrompts.createdAt), asc(aiVisibilityRunItems.provider));
  return {
    id: run.id,
    folderId,
    projectId: run.projectId,
    trigger: run.trigger,
    status: run.status,
    total: run.totalCount,
    processed: run.processedCount,
    succeeded: run.successCount,
    failed: run.failedCount,
    completeness: run.totalCount > 0
      ? Math.round((run.successCount / run.totalCount) * 1000) / 10
      : 0,
    currentPrompt: run.currentPrompt,
    error: run.errorMessage,
    items,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

async function refreshRunState(auth: AuthContext, runId: string): Promise<AiVisibilityRunView> {
  const { run } = await requireOwnedRun(auth, runId);
  if (run.status === "cancelled") return getAiVisibilityRun(auth, runId);
  const rows = await db
    .select({ status: aiVisibilityRunItems.status })
    .from(aiVisibilityRunItems)
    .where(eq(aiVisibilityRunItems.runId, runId));
  const succeeded = rows.filter((row) => row.status === "succeeded").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const cancelled = rows.filter((row) => row.status === "cancelled").length;
  const active = rows.some((row) => row.status === "queued" || row.status === "running");
  const status = active
    ? "running" as const
    : succeeded === 0
      ? "failed" as const
      : failed > 0 || cancelled > 0
        ? "partial" as const
        : "completed" as const;
  const completedAt = active ? null : new Date();
  const errorMessage = !active && succeeded === 0 && failed > 0
    ? "모든 플랫폼 수집에 실패했습니다. 실행 항목의 실패 사유를 확인해 주세요."
    : null;
  db.transaction((tx) => {
    tx.update(aiVisibilityRuns).set({
      status,
      processedCount: succeeded + failed + cancelled,
      successCount: succeeded,
      failedCount: failed,
      currentPrompt: active ? run.currentPrompt : null,
      errorMessage,
      completedAt,
      updatedAt: new Date(),
    }).where(eq(aiVisibilityRuns.id, runId)).run();
    if (!active && !run.completedAt) {
      tx.update(aiVisibilityProjects).set({
        lastRunAt: completedAt,
        updatedAt: new Date(),
        updatedBy: auth.userId,
      }).where(eq(aiVisibilityProjects.id, run.projectId)).run();
    }
  });
  return getAiVisibilityRun(auth, runId);
}

export async function processNextAiVisibilityItem(
  auth: AuthContext,
  runId: string,
): Promise<AiVisibilityRunView> {
  const owned = await requireOwnedRun(auth, runId);
  if (owned.run.status !== "queued" && owned.run.status !== "running") {
    return getAiVisibilityRun(auth, runId);
  }
  const claimed = db.transaction((tx) => {
    const item = tx
      .select({
        id: aiVisibilityRunItems.id,
        promptId: aiVisibilityRunItems.promptId,
        prompt: aiVisibilityPrompts.prompt,
        provider: aiVisibilityRunItems.provider,
        countryCode: aiVisibilityRunItems.countryCode,
        locationKey: aiVisibilityRunItems.locationKey,
      })
      .from(aiVisibilityRunItems)
      .innerJoin(aiVisibilityPrompts, eq(aiVisibilityPrompts.id, aiVisibilityRunItems.promptId))
      .where(
        and(
          eq(aiVisibilityRunItems.runId, runId),
          eq(aiVisibilityRunItems.status, "queued"),
        ),
      )
      .orderBy(asc(aiVisibilityPrompts.createdAt), asc(aiVisibilityRunItems.provider))
      .limit(1)
      .get();
    if (!item) return null;
    const updated = tx.update(aiVisibilityRunItems).set({
      status: "running",
      startedAt: new Date(),
      attemptCount: sql`${aiVisibilityRunItems.attemptCount} + 1`,
    }).where(
      and(
        eq(aiVisibilityRunItems.id, item.id),
        eq(aiVisibilityRunItems.status, "queued"),
      ),
    ).returning({ id: aiVisibilityRunItems.id }).get();
    if (!updated) return null;
    tx.update(aiVisibilityRuns).set({
      status: "running",
      currentPrompt: item.prompt,
      startedAt: owned.run.startedAt ?? new Date(),
      updatedAt: new Date(),
    }).where(eq(aiVisibilityRuns.id, runId)).run();
    return item;
  });
  if (!claimed) return refreshRunState(auth, runId);

  const bundle = await getAiVisibilityProjectBundle(auth, owned.folderId);
  const location = getTrackingLocation(claimed.locationKey);
  if (!location) {
    await db.update(aiVisibilityRunItems).set({
      status: "failed",
      errorMessage: "지원하지 않는 위치입니다.",
      completedAt: new Date(),
    }).where(eq(aiVisibilityRunItems.id, claimed.id));
    return refreshRunState(auth, runId);
  }

  try {
    const result = await collectAiSearchObservation({
      provider: claimed.provider,
      prompt: claimed.prompt,
      brandNames: [bundle.project.brandName, ...bundle.brandAliases],
      targetDomain: bundle.project.domain,
      location,
      forceRefresh: owned.run.trigger === "manual",
    });
    if ((await requireOwnedRun(auth, runId)).run.status === "cancelled") {
      return getAiVisibilityRun(auth, runId);
    }
    const observationId = newId("avo");
    db.transaction((tx) => {
      tx.insert(aiVisibilityObservations).values({
        id: observationId,
        projectId: bundle.project.id,
        runId,
        runItemId: claimed.id,
        promptId: claimed.promptId,
        provider: claimed.provider,
        countryCode: claimed.countryCode,
        locationKey: claimed.locationKey,
        visibilityStatus: result.visibilityStatus,
        brandMentioned: result.brandMentioned,
        citationsAvailable: result.citationsAvailable,
        responseText: result.responseText,
        source: result.source,
        fromCache: result.fromCache,
        capturedAt: result.capturedAt,
      }).run();
      if (result.citations.length > 0) {
        tx.insert(aiVisibilityCitations).values(result.citations.map((citation) => ({
          id: newId("avc"),
          observationId,
          position: citation.position,
          url: citation.url,
          domain: citation.domain,
          title: citation.title,
          isOwnDomain: domainMatches(citation.domain, bundle.project.domain),
        }))).run();
      }
      tx.update(aiVisibilityRunItems).set({
        status: "succeeded",
        errorMessage: null,
        completedAt: new Date(),
      }).where(eq(aiVisibilityRunItems.id, claimed.id)).run();
    });
  } catch (error) {
    if ((await requireOwnedRun(auth, runId)).run.status === "cancelled") {
      return getAiVisibilityRun(auth, runId);
    }
    const message = error instanceof ApiError
      ? error.message
      : "AI 플랫폼 응답 수집에 실패했습니다.";
    await db.update(aiVisibilityRunItems).set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    }).where(eq(aiVisibilityRunItems.id, claimed.id));
  }
  return refreshRunState(auth, runId);
}

export async function drainAiVisibilityRun(
  auth: AuthContext,
  runId: string,
): Promise<AiVisibilityRunView> {
  let view = await getAiVisibilityRun(auth, runId);
  let remaining = Math.max(1, view.total + 1);
  while ((view.status === "queued" || view.status === "running") && remaining > 0) {
    view = await processNextAiVisibilityItem(auth, runId);
    remaining -= 1;
  }
  if (view.status === "completed" || view.status === "partial") {
    await generateBrandPerformanceReportsForRun(auth, runId);
  }
  return view;
}

export async function cancelAiVisibilityRun(
  auth: AuthContext,
  runId: string,
): Promise<AiVisibilityRunView> {
  const { run } = await requireOwnedRun(auth, runId);
  if (run.status !== "queued" && run.status !== "running") {
    return getAiVisibilityRun(auth, runId);
  }
  const now = new Date();
  db.transaction((tx) => {
    tx.update(aiVisibilityRunItems).set({
      status: "cancelled",
      completedAt: now,
    }).where(
      and(
        eq(aiVisibilityRunItems.runId, runId),
        inArray(aiVisibilityRunItems.status, ["queued", "running"]),
      ),
    ).run();
    tx.update(aiVisibilityRuns).set({
      status: "cancelled",
      processedCount: run.totalCount,
      currentPrompt: null,
      completedAt: now,
      updatedAt: now,
    }).where(eq(aiVisibilityRuns.id, runId)).run();
  });
  return getAiVisibilityRun(auth, runId);
}

export async function retryFailedAiVisibilityItems(
  auth: AuthContext,
  runId: string,
): Promise<AiVisibilityRunView> {
  const { run } = await requireOwnedRun(auth, runId);
  if (run.status === "cancelled" || run.status === "queued" || run.status === "running") {
    throw new ApiError("VALIDATION_ERROR", "현재 실행은 재시도할 수 없습니다.");
  }
  const capabilities = getAiSearchCapabilities();
  const failed = await db
    .select({ id: aiVisibilityRunItems.id, provider: aiVisibilityRunItems.provider })
    .from(aiVisibilityRunItems)
    .where(
      and(
        eq(aiVisibilityRunItems.runId, runId),
        eq(aiVisibilityRunItems.status, "failed"),
      ),
    );
  const retryIds = failed
    .filter((item) => capabilities.providers[item.provider].enabled)
    .map((item) => item.id);
  if (retryIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "현재 재시도할 수 있는 실패 항목이 없습니다.");
  }
  db.transaction((tx) => {
    tx.update(aiVisibilityRunItems).set({
      status: "queued",
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    }).where(inArray(aiVisibilityRunItems.id, retryIds)).run();
    tx.update(aiVisibilityRuns).set({
      status: "queued",
      errorMessage: null,
      currentPrompt: null,
      completedAt: null,
      updatedAt: new Date(),
    }).where(eq(aiVisibilityRuns.id, runId)).run();
  });
  return refreshRunState(auth, runId);
}

export async function getProjectForAiRun(auth: AuthContext, folderId: string) {
  return requireAiVisibilityProject(auth, folderId);
}
