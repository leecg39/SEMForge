import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  folders,
  siteAuditCampaigns,
  siteAuditMetricSnapshots,
  siteAuditRuns,
} from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import {
  metricDeltas,
  metricValues,
  safeJson,
  type SiteAuditMetricValues,
  type StoredPsiMetrics,
  type StoredThemeScore,
} from "@/server/siteaudit/metrics";
import { getSiteAuditOverview } from "@/server/siteaudit/overview";
import { isSiteAuditEmailConfigured } from "@/server/siteaudit/email";

export type SiteAuditProjectState =
  | "unconfigured"
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface SiteAuditProjectConfig {
  id: string;
  version: number;
  crawlScope: "domain" | "subdomain" | "path";
  pageLimit: number;
  crawlSource: "website" | "sitemap" | "url_list";
  schedule: "off" | "daily" | "weekly" | "monthly";
  notifyOnComplete: boolean;
  emailOnComplete: boolean;
  crawlerUserAgent: "semforge" | "googlebot" | "bingbot";
  allowPaths: string[];
  disallowPaths: string[];
  ignoreQueryParameters: string[];
}

export interface SiteAuditProjectRow {
  projectId: string;
  name: string;
  domain: string;
  campaignId: string | null;
  state: SiteAuditProjectState;
  lastUpdatedAt: string | null;
  latestRun: {
    id: string;
    status: "queued" | "running" | "completed" | "failed";
    pageLimit: number;
    crawledPages: number;
    failedFetches: number;
    errorMessage: string | null;
    updatedAt: string;
  } | null;
  metrics: SiteAuditMetricValues | null;
  deltas: SiteAuditMetricValues | null;
  provenance: Record<string, unknown>;
  config: SiteAuditProjectConfig | null;
}

export interface SiteAuditProjectListResult {
  rows: SiteAuditProjectRow[];
  meta: {
    q: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    sort: "updatedAt:desc" | "updatedAt:asc" | "name:asc" | "name:desc";
    emailConfigured: boolean;
  };
}

type Campaign = typeof siteAuditCampaigns.$inferSelect;
type Run = typeof siteAuditRuns.$inferSelect;
type Snapshot = typeof siteAuditMetricSnapshots.$inferSelect;

function configFromCampaign(campaign: Campaign): SiteAuditProjectConfig {
  return {
    id: campaign.id,
    version: campaign.version,
    crawlScope: campaign.crawlScope,
    pageLimit: campaign.pageLimit,
    crawlSource: campaign.crawlSource,
    schedule: campaign.schedule,
    notifyOnComplete: campaign.notifyOnComplete,
    emailOnComplete: campaign.emailOnComplete,
    crawlerUserAgent: campaign.crawlerUserAgent,
    allowPaths: safeJson<string[]>(campaign.allowPaths, []),
    disallowPaths: safeJson<string[]>(campaign.disallowPaths, []),
    ignoreQueryParameters: safeJson<string[]>(campaign.ignoreQueryParameters, []),
  };
}

function valuesFromSnapshot(snapshot: Snapshot): SiteAuditMetricValues {
  return metricValues({
    crawledPages: snapshot.crawledPages,
    siteHealth: snapshot.siteHealth,
    errorCount: snapshot.errorCount,
    warningCount: snapshot.warningCount,
    themes: safeJson<StoredThemeScore[]>(snapshot.themeScores, []),
    psi: safeJson<StoredPsiMetrics | null>(snapshot.psiMetrics, null),
  });
}

function stateFor(campaign: Campaign | null, latestRun: Run | null): SiteAuditProjectState {
  if (!campaign) return "unconfigured";
  if (latestRun?.status === "queued" || latestRun?.status === "running") {
    return latestRun.status;
  }
  if (latestRun?.status === "failed" || campaign.status === "failed") return "failed";
  if (latestRun?.status === "completed" || campaign.status === "completed") return "completed";
  return "idle";
}

function latestIso(campaign: Campaign | null, run: Run | null, folderUpdatedAt: Date): string {
  const candidates = [folderUpdatedAt, campaign?.updatedAt, run?.updatedAt].filter(
    (value): value is Date => value instanceof Date
  );
  return new Date(Math.max(...candidates.map((value) => value.getTime()))).toISOString();
}

export async function listSiteAuditProjects(
  auth: AuthContext,
  options?: { q?: string; page?: number; pageSize?: number; sort?: string }
): Promise<SiteAuditProjectListResult> {
  const q = options?.q?.trim() ?? "";
  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const pageSize = Math.max(1, Math.min(50, Math.floor(options?.pageSize ?? 10)));
  const allowedSorts = ["updatedAt:desc", "updatedAt:asc", "name:asc", "name:desc"] as const;
  const sort = allowedSorts.includes(options?.sort as (typeof allowedSorts)[number])
    ? (options?.sort as (typeof allowedSorts)[number])
    : "updatedAt:desc";

  const [folderRows, campaignRows] = await Promise.all([
    db
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, auth.workspaceId)),
    db
      .select()
      .from(siteAuditCampaigns)
      .where(eq(siteAuditCampaigns.workspaceId, auth.workspaceId))
      .orderBy(desc(siteAuditCampaigns.updatedAt)),
  ]);
  const activeFolders = folderRows.filter((row) => row.deletedAt === null);
  const activeCampaigns = campaignRows.filter((row) => row.deletedAt === null);
  const campaignByFolder = new Map<string, Campaign>();
  for (const campaign of activeCampaigns) {
    if (campaign.folderId && !campaignByFolder.has(campaign.folderId)) {
      campaignByFolder.set(campaign.folderId, campaign);
    }
  }
  const knownFolderIds = new Set(activeFolders.map((row) => row.id));
  const candidates = [
    ...activeFolders.map((folder) => ({
      projectId: folder.id,
      name: folder.name,
      domain: folder.domain,
      updatedAt: folder.updatedAt,
      campaign: campaignByFolder.get(folder.id) ?? null,
    })),
    ...activeCampaigns
      .filter((campaign) => !campaign.folderId || !knownFolderIds.has(campaign.folderId))
      .map((campaign) => ({
        projectId: `campaign:${campaign.id}`,
        name: campaign.name,
        domain: campaign.domain,
        updatedAt: campaign.updatedAt,
        campaign,
      })),
  ].filter((item) => {
    if (!q) return true;
    const haystack = `${item.name}\n${item.domain}`.toLocaleLowerCase();
    return haystack.includes(q.toLocaleLowerCase());
  });

  candidates.sort((a, b) => {
    if (sort.startsWith("name:")) {
      const compared = a.name.localeCompare(b.name, "ko");
      return sort.endsWith(":asc") ? compared : -compared;
    }
    const compared = a.updatedAt.getTime() - b.updatedAt.getTime();
    return sort.endsWith(":asc") ? compared : -compared;
  });

  const total = candidates.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = candidates.slice((safePage - 1) * pageSize, safePage * pageSize);
  const campaignIds = visible
    .map((item) => item.campaign?.id)
    .filter((id): id is string => Boolean(id));
  const runRows =
    campaignIds.length > 0
      ? await db
          .select()
          .from(siteAuditRuns)
          .where(inArray(siteAuditRuns.campaignId, campaignIds))
          .orderBy(desc(siteAuditRuns.createdAt))
      : [];
  const runsByCampaign = new Map<string, Run[]>();
  for (const run of runRows) {
    const rows = runsByCampaign.get(run.campaignId) ?? [];
    rows.push(run);
    runsByCampaign.set(run.campaignId, rows);
  }
  const completedRunIds = runRows
    .filter((run) => run.status === "completed")
    .map((run) => run.id);
  const snapshots =
    completedRunIds.length > 0
      ? await db
          .select()
          .from(siteAuditMetricSnapshots)
          .where(inArray(siteAuditMetricSnapshots.runId, completedRunIds))
      : [];
  const snapshotByRun = new Map(snapshots.map((snapshot) => [snapshot.runId, snapshot]));

  const rows = await Promise.all(
    visible.map(async (item): Promise<SiteAuditProjectRow> => {
      const campaign = item.campaign;
      if (!campaign) {
        return {
          projectId: item.projectId,
          name: item.name,
          domain: item.domain,
          campaignId: null,
          state: "unconfigured",
          lastUpdatedAt: item.updatedAt.toISOString(),
          latestRun: null,
          metrics: null,
          deltas: null,
          provenance: {},
          config: null,
        };
      }
      const runs = runsByCampaign.get(campaign.id) ?? [];
      const latestRun = runs[0] ?? null;
      const completed = runs.filter(
        (run) => run.status === "completed" && snapshotByRun.has(run.id)
      );
      const latestSnapshot = completed[0] ? snapshotByRun.get(completed[0].id) ?? null : null;
      const previousSnapshot = completed[1]
        ? snapshotByRun.get(completed[1].id) ?? null
        : null;
      let metrics = latestSnapshot ? valuesFromSnapshot(latestSnapshot) : null;
      let provenance = latestSnapshot
        ? safeJson<Record<string, unknown>>(latestSnapshot.provenance, {})
        : {};

      // 실행 이력 도입 전의 실제 최신 크롤 결과도 목록에서 유실하지 않는다.
      if (!metrics && campaign.lastRunAt) {
        try {
          const overview = await getSiteAuditOverview(auth, campaign.id);
          metrics = metricValues({
            crawledPages: overview.crawledPages,
            siteHealth: overview.campaign.siteHealth,
            errorCount: overview.totals.errors,
            warningCount: overview.totals.warnings,
            themes: overview.themes,
            psi: null,
          });
          provenance = { crawl: "legacy-latest", psi: null };
        } catch {
          metrics = null;
        }
      }
      const previous = previousSnapshot ? valuesFromSnapshot(previousSnapshot) : null;
      return {
        projectId: item.projectId,
        name: item.name,
        domain: item.domain,
        campaignId: campaign.id,
        state: stateFor(campaign, latestRun),
        lastUpdatedAt: latestIso(campaign, latestRun, item.updatedAt),
        latestRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              pageLimit: latestRun.pageLimit,
              crawledPages: latestRun.crawledPages,
              failedFetches: latestRun.failedFetches,
              errorMessage: latestRun.errorMessage,
              updatedAt: latestRun.updatedAt.toISOString(),
            }
          : null,
        metrics,
        deltas: metrics ? metricDeltas(metrics, previous) : null,
        provenance,
        config: configFromCampaign(campaign),
      };
    })
  );

  return {
    rows,
    meta: {
      q,
      page: safePage,
      pageSize,
      total,
      totalPages,
      sort,
      emailConfigured: isSiteAuditEmailConfigured(),
    },
  };
}
