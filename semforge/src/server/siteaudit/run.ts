import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  siteAuditCampaigns,
  siteAuditMetricSnapshots,
  siteAuditRuns,
  users,
  workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { assertSameWorkspace } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import { runPageSpeedInsights } from "@/server/psi/client";
import { runSiteAuditCampaign } from "@/server/siteaudit/crawl";
import { createFirecrawlCrawler } from "@/server/siteaudit/firecrawl";
import type { StoredPsiMetrics } from "@/server/siteaudit/metrics";
import { deliverSiteAuditNotifications } from "@/server/siteaudit/notifications";
import { getSiteAuditOverview } from "@/server/siteaudit/overview";
import { supportsFirecrawlUserAgent } from "@/server/siteaudit/rules";

const STALE_RUN_MS = 30 * 60 * 1000;
const PROGRESS_WRITE_INTERVAL_MS = 500;

export interface EnqueuedSiteAuditRun {
  id: string;
  campaignId: string;
  status: "queued";
  pageLimit: number;
  crawledPages: number;
  createdAt: string;
}

function userSafeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 500) || "사이트 진단 실행에 실패했습니다.";
}

export async function enqueueSiteAuditRun(
  auth: AuthContext,
  campaignId: string
): Promise<EnqueuedSiteAuditRun> {
  const [campaign] = await db
    .select()
    .from(siteAuditCampaigns)
    .where(and(eq(siteAuditCampaigns.id, campaignId), isNull(siteAuditCampaigns.deletedAt)))
    .limit(1);
  assertSameWorkspace(auth, campaign, "사이트 진단 캠페인");

  const [active] = await db
    .select({ id: siteAuditRuns.id })
    .from(siteAuditRuns)
    .where(
      and(
        eq(siteAuditRuns.campaignId, campaign.id),
        inArray(siteAuditRuns.status, ["queued", "running"])
      )
    )
    .limit(1);
  if (active) {
    throw new ApiError(
      "VERSION_CONFLICT",
      "이미 사이트 진단이 준비 중이거나 실행 중입니다."
    );
  }

  const now = new Date();
  const id = newId("sar");
  try {
    await db.insert(siteAuditRuns).values({
      id,
      workspaceId: auth.workspaceId,
      campaignId: campaign.id,
      status: "queued",
      pageLimit: Math.max(1, Math.min(500, campaign.pageLimit)),
      crawledPages: 0,
      failedFetches: 0,
      heartbeatAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
    });
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(userSafeError(error))) {
      throw new ApiError("VERSION_CONFLICT", "이미 사이트 진단이 실행 중입니다.");
    }
    throw error;
  }
  await db
    .update(siteAuditCampaigns)
    .set({ status: "queued", updatedAt: now })
    .where(eq(siteAuditCampaigns.id, campaign.id));

  return {
    id,
    campaignId: campaign.id,
    status: "queued",
    pageLimit: Math.max(1, Math.min(500, campaign.pageLimit)),
    crawledPages: 0,
    createdAt: now.toISOString(),
  };
}

async function loadExecutionContext(auth: AuthContext, runId: string) {
  const [row] = await db
    .select({
      run: siteAuditRuns,
      campaign: siteAuditCampaigns,
    })
    .from(siteAuditRuns)
    .innerJoin(siteAuditCampaigns, eq(siteAuditCampaigns.id, siteAuditRuns.campaignId))
    .where(eq(siteAuditRuns.id, runId))
    .limit(1);
  if (!row || row.run.workspaceId !== auth.workspaceId || row.campaign.deletedAt) {
    throw new ApiError("NOT_FOUND", "사이트 진단 실행을 찾을 수 없습니다.");
  }
  return row;
}

async function persistMetricSnapshot(
  auth: AuthContext,
  runId: string,
  campaignId: string,
  crawlEngine: "firecrawl" | "self",
  sourceNote?: string
) {
  const overview = await getSiteAuditOverview(auth, campaignId);
  let psi: StoredPsiMetrics | null = null;
  let psiError: string | null = null;
  try {
    const result = await runPageSpeedInsights({
      url: `https://${overview.campaign.domain.replace(/^https?:\/\//, "")}`,
      strategy: "mobile",
    });
    psi = {
      scores: result.scores,
      cwv: result.cwv,
      fetchedAt: result.fetchedAt.toISOString(),
      source: "pagespeed-insights",
    };
  } catch (error) {
    psiError = userSafeError(error);
  }

  const capturedAt = new Date();
  await db
    .insert(siteAuditMetricSnapshots)
    .values({
      runId,
      siteHealth: overview.campaign.siteHealth,
      crawledPages: overview.crawledPages,
      errorCount: overview.totals.errors,
      warningCount: overview.totals.warnings,
      noticeCount: overview.totals.notices,
      themeScores: JSON.stringify(overview.themes),
      psiMetrics: psi ? JSON.stringify(psi) : null,
      provenance: JSON.stringify({
        crawl: crawlEngine,
        sourceNote: sourceNote ?? null,
        psi: psi ? "pagespeed-insights" : null,
        psiError,
      }),
      capturedAt,
    })
    .onConflictDoUpdate({
      target: siteAuditMetricSnapshots.runId,
      set: {
        siteHealth: overview.campaign.siteHealth,
        crawledPages: overview.crawledPages,
        errorCount: overview.totals.errors,
        warningCount: overview.totals.warnings,
        noticeCount: overview.totals.notices,
        themeScores: JSON.stringify(overview.themes),
        psiMetrics: psi ? JSON.stringify(psi) : null,
        provenance: JSON.stringify({
          crawl: crawlEngine,
          sourceNote: sourceNote ?? null,
          psi: psi ? "pagespeed-insights" : null,
          psiError,
        }),
        capturedAt,
      },
    });
  return overview;
}

async function notifyRun(
  auth: AuthContext,
  input: {
    runId: string;
    campaign: typeof siteAuditCampaigns.$inferSelect;
    outcome: "completed" | "failed";
    summary: string;
  }
) {
  try {
    await deliverSiteAuditNotifications({
      workspaceId: auth.workspaceId,
      campaignId: input.campaign.id,
      campaignName: input.campaign.name,
      runId: input.runId,
      userId: auth.userId,
      email: auth.email,
      notifyInApp: input.campaign.notifyOnComplete,
      notifyEmail: input.campaign.emailOnComplete,
      outcome: input.outcome,
      summary: input.summary,
    });
  } catch (error) {
    console.error("[siteaudit] notification delivery failed", userSafeError(error));
  }
}

/** queued 실행 하나를 원자적으로 선점해 완료/실패까지 처리한다. */
export async function executeSiteAuditRun(
  auth: AuthContext,
  runId: string
): Promise<{ status: "completed" | "failed"; message: string }> {
  const { run, campaign } = await loadExecutionContext(auth, runId);
  const startedAt = new Date();
  const claimed = await db
    .update(siteAuditRuns)
    .set({
      status: "running",
      startedAt,
      heartbeatAt: startedAt,
      updatedAt: startedAt,
      errorMessage: null,
    })
    .where(and(eq(siteAuditRuns.id, run.id), eq(siteAuditRuns.status, "queued")))
    .returning({ id: siteAuditRuns.id });
  if (claimed.length === 0) {
    const [current] = await db
      .select({ status: siteAuditRuns.status, errorMessage: siteAuditRuns.errorMessage })
      .from(siteAuditRuns)
      .where(eq(siteAuditRuns.id, run.id))
      .limit(1);
    return {
      status: current?.status === "completed" ? "completed" : "failed",
      message: current?.errorMessage ?? `실행 상태: ${current?.status ?? "unknown"}`,
    };
  }

  let lastProgressWrite = 0;
  const onProgress = async (progress: { crawledPages: number; failedFetches: number }) => {
    const nowMs = Date.now();
    if (
      nowMs - lastProgressWrite < PROGRESS_WRITE_INTERVAL_MS &&
      progress.crawledPages < run.pageLimit
    ) {
      return;
    }
    lastProgressWrite = nowMs;
    const now = new Date(nowMs);
    await db
      .update(siteAuditRuns)
      .set({
        crawledPages: Math.min(run.pageLimit, progress.crawledPages),
        failedFetches: progress.failedFetches,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(and(eq(siteAuditRuns.id, run.id), eq(siteAuditRuns.status, "running")));
  };

  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
    const report = await runSiteAuditCampaign(auth, campaign.id, {
      crawler:
        firecrawlKey && supportsFirecrawlUserAgent(campaign.crawlerUserAgent)
          ? createFirecrawlCrawler(firecrawlKey)
          : undefined,
      onProgress,
    });
    const overview = await persistMetricSnapshot(
      auth,
      run.id,
      campaign.id,
      report.crawlEngine,
      report.sourceNote
    );
    const finishedAt = new Date(report.finishedAt);
    await db
      .update(siteAuditRuns)
      .set({
        status: "completed",
        crawledPages: report.crawledPages,
        failedFetches: report.failedFetches,
        crawlEngine: report.crawlEngine,
        sourceNote: report.sourceNote ?? null,
        heartbeatAt: finishedAt,
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(siteAuditRuns.id, run.id));
    const summary = `${overview.crawledPages}개 페이지 · Site Health ${
      overview.campaign.siteHealth ?? "미측정"
    } · 오류 ${overview.totals.errors}건 · 경고 ${overview.totals.warnings}건`;
    await notifyRun(auth, { runId: run.id, campaign, outcome: "completed", summary });
    return { status: "completed", message: summary };
  } catch (error) {
    const message = userSafeError(error);
    const finishedAt = new Date();
    await Promise.all([
      db
        .update(siteAuditRuns)
        .set({
          status: "failed",
          errorMessage: message,
          heartbeatAt: finishedAt,
          finishedAt,
          updatedAt: finishedAt,
        })
        .where(eq(siteAuditRuns.id, run.id)),
      db
        .update(siteAuditCampaigns)
        .set({ status: "failed", updatedAt: finishedAt })
        .where(eq(siteAuditCampaigns.id, campaign.id)),
    ]);
    await notifyRun(auth, { runId: run.id, campaign, outcome: "failed", summary: message });
    return { status: "failed", message };
  }
}

async function authForRun(run: typeof siteAuditRuns.$inferSelect): Promise<AuthContext | null> {
  if (!run.createdBy) return null;
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      workspaceName: workspaces.name,
      workspacePlan: workspaces.plan,
    })
    .from(users)
    .innerJoin(workspaces, eq(workspaces.id, run.workspaceId))
    .where(eq(users.id, run.createdBy))
    .limit(1);
  if (!row) return null;
  return {
    userId: run.createdBy,
    email: row.email,
    name: row.name,
    workspaceId: run.workspaceId,
    workspaceName: row.workspaceName,
    workspacePlan: row.workspacePlan,
    role: "owner",
    sessionId: "site-audit-worker",
    ip: null,
    userAgent: null,
  };
}

/** due-runner가 응답 후 작업이 유실된 queued 실행을 회수하고 stale 실행을 정리한다. */
export async function recoverSiteAuditRuns(options?: {
  now?: Date;
  limit?: number;
}): Promise<{ recovered: number; failed: number; stale: number; errors: string[] }> {
  const now = options?.now ?? new Date();
  const limit = Math.max(1, Math.min(25, options?.limit ?? 10));
  const staleBefore = new Date(now.getTime() - STALE_RUN_MS);
  const stale = await db
    .select()
    .from(siteAuditRuns)
    .where(
      and(
        eq(siteAuditRuns.status, "running"),
        lt(siteAuditRuns.heartbeatAt, staleBefore)
      )
    );
  for (const run of stale) {
    await Promise.all([
      db
        .update(siteAuditRuns)
        .set({
          status: "failed",
          errorMessage: "서버 중단 후 제한 시간 내에 진행 상태가 갱신되지 않았습니다.",
          finishedAt: now,
          heartbeatAt: now,
          updatedAt: now,
        })
        .where(and(eq(siteAuditRuns.id, run.id), eq(siteAuditRuns.status, "running"))),
      db
        .update(siteAuditCampaigns)
        .set({ status: "failed", updatedAt: now })
        .where(eq(siteAuditCampaigns.id, run.campaignId)),
    ]);
  }

  const queued = await db
    .select()
    .from(siteAuditRuns)
    .where(eq(siteAuditRuns.status, "queued"))
    .orderBy(asc(siteAuditRuns.createdAt))
    .limit(limit);
  let recovered = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const run of queued) {
    const auth = await authForRun(run);
    if (!auth) {
      failed += 1;
      errors.push(`${run.id}: 실행 사용자를 찾을 수 없습니다.`);
      continue;
    }
    const result = await executeSiteAuditRun(auth, run.id);
    if (result.status === "completed") recovered += 1;
    else {
      failed += 1;
      errors.push(`${run.id}: ${result.message}`);
    }
  }
  return { recovered, failed, stale: stale.length, errors };
}
