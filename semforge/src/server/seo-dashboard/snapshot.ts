import { createHash } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { SeoDashboardSnapshot } from "@/components/seo-dash/types";
import type { AiVisibilityWidgetSummary } from "@/components/seo-dash/WidgetAiSearch";
import type { RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import type {
  PositionTrackingActiveRunSummary,
  PositionTrackingWidgetSummary,
} from "@/components/seo-dash/WidgetPositionTracking";
import type { SiteAuditWidgetSummary } from "@/components/seo-dash/WidgetSiteAudit";
import { db } from "@/db/client";
import {
  folders,
  linkGraphEdges,
  positionTrackingCampaigns,
  positionTrackingRuns,
  siteAuditCampaigns,
  siteAuditRuns,
} from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { normalizeHostname } from "@/lib/position-tracking/targets";
import type { AuthContext } from "@/lib/session";
import { getProjectAiVisibilityDashboard } from "@/server/ai-visibility/dashboard";
import { findAiVisibilityProject } from "@/server/ai-visibility/projects";
import { getDomainAnalytics } from "@/server/analytics";
import { getOnpageDomainSummary } from "@/server/onpage/store";
import { getKeywordHighlights } from "@/server/position-tracking/highlights";
import { getCampaignOverview } from "@/server/position-tracking/overview";
import { buildPositionTrackingWidgetSummary } from "@/server/position-tracking/widget";
import { getSiteAuditOverview } from "@/server/siteaudit/overview";
import { isSiteAuditEmailConfigured } from "@/server/siteaudit/email";

export function buildMonthlyRefDomains(
  edges: { sourceDomain: string; firstSeenAt: Date }[],
  now = new Date(),
): RefDomainMonth[] {
  const months: { end: Date; label: string }[] = [];
  for (let index = 11; index >= 0; index -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index + 1, 1));
    months.push({
      end,
      label: new Intl.DateTimeFormat("ko-KR", {
        year: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(start),
    });
  }

  return months.map((month) => {
    const referringDomains = new Set<string>();
    let backlinks = 0;
    for (const edge of edges) {
      if (edge.firstSeenAt < month.end) {
        referringDomains.add(edge.sourceDomain);
        backlinks += 1;
      }
    }
    return {
      label: month.label,
      referringDomains: referringDomains.size,
      backlinks,
    };
  });
}

interface SeoProjectRow {
  id: string;
  workspaceId: string;
  name: string;
  domain: string;
  updatedAt: Date;
}

interface SeoSiteAuditCampaignRow {
  id: string;
  folderId: string | null;
  domain: string;
  status: "idle" | "queued" | "running" | "completed" | "failed";
}

/**
 * 신규 캠페인은 folder_id가 프로젝트의 정식 연결 키다. folder_id 도입 전 캠페인은
 * 연결되지 않은 행에 한해서만 정규화된 도메인으로 복구한다.
 */
export function selectSeoSiteAuditCampaign(
  rows: SeoSiteAuditCampaignRow[],
  folderId: string | null,
  domain: string,
) {
  if (!folderId) return null;
  const linked = rows.find((row) => row.folderId === folderId);
  if (linked) return linked;
  const normalizedDomain = normalizeDomain(domain);
  return (
    rows.find(
      (row) => row.folderId === null && normalizeDomain(row.domain) === normalizedDomain,
    ) ?? null
  );
}

/**
 * 쿼리의 workspace 조건을 한 번 더 방어하고 최신 폴더만 프로젝트로 노출한다.
 * URL의 domain이 현재 워크스페이스 프로젝트가 아니면 임의 도메인을 분석하지 않고
 * 가장 최근 프로젝트로 되돌아간다.
 */
export function selectSeoDashboardProject(
  rows: SeoProjectRow[],
  workspaceId: string,
  rawDomain?: string,
) {
  const projects = [...rows]
    .filter((row) => row.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((project) => ({
      id: project.id,
      name: project.name,
      domain: normalizeDomain(project.domain),
    }))
    .filter((project) => project.domain.includes("."))
    .filter(
      (project, index, candidates) =>
        candidates.findIndex((candidate) => candidate.domain === project.domain) === index,
    );
  const requestedDomain = rawDomain ? normalizeDomain(rawDomain) : "";
  const project =
    projects.find((candidate) => candidate.domain === requestedDomain) ?? projects[0] ?? null;
  return {
    projects,
    project,
    currentDomain: project?.domain ?? "",
  };
}

/** 로컬 위젯 환경설정 키에 실제 사용자/워크스페이스 식별자를 노출하지 않는다. */
export function createSeoPreferenceScope(auth: Pick<AuthContext, "workspaceId" | "userId">, domain: string) {
  return createHash("sha256")
    .update(`${auth.workspaceId}:${auth.userId}:${normalizeDomain(domain)}`)
    .digest("hex")
    .slice(0, 16);
}

export async function getSeoDashboardSnapshot(
  auth: AuthContext,
  rawDomain?: string,
): Promise<SeoDashboardSnapshot> {
  const folderRows = await db
    .select({
      id: folders.id,
      workspaceId: folders.workspaceId,
      name: folders.name,
      domain: folders.domain,
      updatedAt: folders.updatedAt,
    })
    .from(folders)
    .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)))
    .orderBy(desc(folders.updatedAt));

  const { projects, project, currentDomain } = selectSeoDashboardProject(
    folderRows,
    auth.workspaceId,
    rawDomain,
  );
  const currentFolderId = project?.id ?? null;
  const positionTrackingDomain = normalizeHostname(currentDomain) || currentDomain;
  const countryCode = currentDomain.endsWith(".kr") ? "KR" : "US";

  const [report, auditCampaignRows, positionCampaignRows, edges] = await Promise.all([
    currentDomain
      ? getDomainAnalytics({ domain: currentDomain, countryCode, device: "desktop" })
      : Promise.resolve(null),
    currentDomain && currentFolderId
      ? db
          .select({
            id: siteAuditCampaigns.id,
            folderId: siteAuditCampaigns.folderId,
            domain: siteAuditCampaigns.domain,
            status: siteAuditCampaigns.status,
          })
          .from(siteAuditCampaigns)
          .where(
            and(
              eq(siteAuditCampaigns.workspaceId, auth.workspaceId),
              isNull(siteAuditCampaigns.deletedAt),
              or(
                eq(siteAuditCampaigns.folderId, currentFolderId),
                isNull(siteAuditCampaigns.folderId),
              ),
            ),
          )
          .orderBy(desc(siteAuditCampaigns.updatedAt))
      : Promise.resolve([]),
    currentDomain
      ? db
          .select({
            id: positionTrackingCampaigns.id,
            location: positionTrackingCampaigns.location,
            device: positionTrackingCampaigns.device,
            searchEngine: positionTrackingCampaigns.searchEngine,
          })
          .from(positionTrackingCampaigns)
          .where(
            and(
              eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
              eq(positionTrackingCampaigns.domain, currentDomain),
              isNull(positionTrackingCampaigns.deletedAt),
            ),
          )
          .orderBy(desc(positionTrackingCampaigns.updatedAt))
          .limit(1)
      : Promise.resolve([]),
    currentDomain
      ? db
          .select({
            sourceDomain: linkGraphEdges.sourceDomain,
            firstSeenAt: linkGraphEdges.firstSeenAt,
          })
          .from(linkGraphEdges)
          .where(
            and(
              eq(linkGraphEdges.targetDomain, currentDomain),
              eq(linkGraphEdges.source, "site-audit-crawler"),
            ),
          )
      : Promise.resolve([] as { sourceDomain: string; firstSeenAt: Date }[]),
  ]);

  const auditCampaign = selectSeoSiteAuditCampaign(
    auditCampaignRows,
    currentFolderId,
    currentDomain,
  );
  const [auditOverview, auditRunRows] = auditCampaign
    ? await Promise.all([
        getSiteAuditOverview(auth, auditCampaign.id),
        db
          .select({
            status: siteAuditRuns.status,
            pageLimit: siteAuditRuns.pageLimit,
            crawledPages: siteAuditRuns.crawledPages,
            errorMessage: siteAuditRuns.errorMessage,
          })
          .from(siteAuditRuns)
          .where(eq(siteAuditRuns.campaignId, auditCampaign.id))
          .orderBy(desc(siteAuditRuns.createdAt))
          .limit(1),
      ])
    : [null, []];
  const auditRun = auditRunRows[0] ?? null;
  const auditHasRealCrawl = (auditOverview?.crawledPages ?? 0) > 0;
  const auditState = auditCampaign
    ? auditRun?.status === "queued" || auditRun?.status === "running" || auditRun?.status === "failed"
      ? auditRun.status
      : auditCampaign.status
    : "unconfigured";
  const siteAuditSummary: SiteAuditWidgetSummary | null = project
    ? {
        campaignId: auditCampaign?.id ?? null,
        state: auditState,
        siteHealth: auditHasRealCrawl ? (auditOverview?.campaign.siteHealth ?? null) : null,
        lastRunAt: auditHasRealCrawl ? (auditOverview?.campaign.lastRunAt ?? null) : null,
        crawledPages: auditHasRealCrawl ? (auditOverview?.crawledPages ?? 0) : 0,
        errors: auditHasRealCrawl ? (auditOverview?.totals.errors ?? null) : null,
        warnings: auditHasRealCrawl ? (auditOverview?.totals.warnings ?? null) : null,
        notices: auditHasRealCrawl ? (auditOverview?.totals.notices ?? null) : null,
        runProgress: auditRun
          ? {
              crawledPages: auditRun.crawledPages,
              pageLimit: auditRun.pageLimit,
            }
          : null,
        errorMessage: auditState === "failed" ? (auditRun?.errorMessage ?? null) : null,
      }
    : null;

  const [positionOverview, positionHighlights, activeRunRows] = positionCampaignRows[0]
    ? await Promise.all([
        getCampaignOverview(auth, positionCampaignRows[0].id),
        getKeywordHighlights(auth, positionCampaignRows[0].id),
        db
          .select({
            runId: positionTrackingRuns.id,
            status: positionTrackingRuns.status,
            total: positionTrackingRuns.totalCount,
            processed: positionTrackingRuns.processedCount,
            succeeded: positionTrackingRuns.successCount,
            failed: positionTrackingRuns.failedCount,
            currentKeyword: positionTrackingRuns.currentKeyword,
          })
          .from(positionTrackingRuns)
          .where(
            and(
              eq(positionTrackingRuns.workspaceId, auth.workspaceId),
              eq(positionTrackingRuns.campaignId, positionCampaignRows[0].id),
              or(
                eq(positionTrackingRuns.status, "queued"),
                eq(positionTrackingRuns.status, "running"),
              ),
            ),
          )
          .orderBy(desc(positionTrackingRuns.createdAt))
          .limit(1),
      ])
    : [null, null, []];

  const positionTrackingSummary: PositionTrackingWidgetSummary | null =
    positionCampaignRows[0] && positionOverview && positionHighlights
      ? buildPositionTrackingWidgetSummary(
          positionCampaignRows[0],
          positionOverview,
          positionHighlights,
        )
      : null;
  const positionTrackingActiveRun: PositionTrackingActiveRunSummary | null = activeRunRows[0]
    ? {
        ...activeRunRows[0],
        status: activeRunRows[0].status as "queued" | "running",
      }
    : null;

  const aiVisibilitySummary: AiVisibilityWidgetSummary | null = currentFolderId
    ? await (async () => {
        const aiProject = await findAiVisibilityProject(auth, currentFolderId);
        if (!aiProject) return null;
        const overview = await getProjectAiVisibilityDashboard(auth, currentFolderId, {
          range: "1m",
        });
        return {
          promptCount: overview.scope.prompts,
          visibility: overview.kpis.visibility.value,
          mentions: overview.kpis.mentions.value,
          citations: overview.kpis.citations.value,
          citedPages: overview.kpis.citedPages.value,
          measurable: overview.completeness.measurableCells,
          unknown: overview.completeness.unknownCells,
          lastCollectedAt: overview.provenance.lastCollectedAt,
          providers: overview.scope.configuredProviders.map((provider) => {
            const row = overview.providerBreakdown.find((item) => item.key === provider);
            const capability = overview.capabilities.providers[provider];
            return {
              key: provider,
              label:
                provider === "google_aio"
                  ? "Google AI 개요"
                  : provider === "chatgpt_web"
                    ? "ChatGPT 웹 검색"
                    : "Gemini 그라운딩",
              enabled: capability.enabled,
              reason: capability.reason,
              visibility: row?.visibility ?? null,
              mentions: row?.mentions ?? 0,
              citations: row?.citations ?? 0,
            };
          }),
        };
      })()
    : null;

  const onpageSummary = currentDomain
    ? await getOnpageDomainSummary(auth.workspaceId, currentDomain)
    : null;
  const freshest = report?.freshness.serpCapturedAt ?? report?.freshness.keywordMetricsThrough;
  const dateLabel = freshest
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(freshest))
    : null;

  return {
    projects,
    project,
    currentDomain,
    currentFolderId,
    countryCode,
    dateLabel,
    report,
    monthlyRefDomains: buildMonthlyRefDomains(edges),
    siteAuditSummary,
    siteAuditEmailConfigured: isSiteAuditEmailConfigured(),
    positionTrackingSummary,
    positionTrackingActiveRun,
    positionTrackingDomain,
    aiVisibilitySummary,
    onpageSummary,
  };
}
