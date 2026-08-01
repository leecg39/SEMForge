import { and, desc, eq, isNull, or } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import { SeoWidgetDashboard } from "@/components/seo-dash/SeoWidgetDashboard";
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
  trackedKeywords,
} from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { normalizeHostname } from "@/lib/position-tracking/targets";
import { getProjectAiVisibilityDashboard } from "@/server/ai-visibility/dashboard";
import { findAiVisibilityProject } from "@/server/ai-visibility/projects";
import { getDomainAnalytics } from "@/server/analytics";
import { getOnpageDomainSummary } from "@/server/onpage/store";
import { pageSession } from "@/server/page-auth";
import { getSiteAuditOverview } from "@/server/siteaudit/overview";
import { listVisibilityHistory } from "@/server/talordata/collect";

export const dynamic = "force-dynamic";

/** link_graph firstSeenAt 기준 최근 12개월 누적 참조 도메인·백링크 수 */
function buildMonthlyRefDomains(
  edges: { sourceDomain: string; firstSeenAt: Date }[]
): RefDomainMonth[] {
  const now = new Date();
  const months: { key: string; end: Date; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    months.push({
      key: `${start.getUTCFullYear()}-${start.getUTCMonth()}`,
      end,
      label: new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "short", timeZone: "UTC" }).format(start),
    });
  }
  return months.map((month) => {
    const seen = new Set<string>();
    let backlinks = 0;
    for (const edge of edges) {
      if (new Date(edge.firstSeenAt) < month.end) {
        seen.add(edge.sourceDomain);
        backlinks += 1;
      }
    }
    return { label: month.label, referringDomains: seen.size, backlinks };
  });
}

export default async function SeoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain: rawDomain } = await searchParams;
  // 이 화면은 보호된 수집 API를 자동 호출하므로 세션 없는 상태로 렌더링하지 않는다.
  const { auth } = await pageSession();

  const folderRows = auth
    ? await db
        .select({ id: folders.id, name: folders.name, domain: folders.domain })
        .from(folders)
        .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)))
    : [];

  const projects = [...folderRows]
    .map((project) => ({ ...project, domain: normalizeDomain(project.domain) }))
    .filter((project) => project.domain.includes("."))
    .filter(
      (project, index, rows) =>
        rows.findIndex((candidate) => candidate.domain === project.domain) === index,
    );

  const normalized = rawDomain ? normalizeDomain(rawDomain) : "";
  const domain = normalized.includes(".") ? normalized : (projects[0]?.domain ?? "");
  const positionTrackingDomain = normalizeHostname(rawDomain ?? domain) || domain;
  const currentFolderId = folderRows.find(
    (folder) => normalizeDomain(folder.domain) === domain,
  )?.id ?? null;
  const countryCode = domain.endsWith(".kr") ? "KR" : "US";

  const [report, auditCampaignRows, positionCampaignRows, edges] = await Promise.all([
    domain
      ? getDomainAnalytics({ domain, countryCode, device: "desktop" })
      : Promise.resolve(null),
    auth
      ? db
          .select({ id: siteAuditCampaigns.id })
          .from(siteAuditCampaigns)
          .where(
            and(
              eq(siteAuditCampaigns.workspaceId, auth.workspaceId),
              eq(siteAuditCampaigns.domain, domain),
              isNull(siteAuditCampaigns.deletedAt)
            )
          )
          .orderBy(desc(siteAuditCampaigns.updatedAt))
          .limit(1)
      : Promise.resolve([]),
    auth
      ? db
          .select({
            id: positionTrackingCampaigns.id,
            location: positionTrackingCampaigns.location,
            device: positionTrackingCampaigns.device,
            searchEngine: positionTrackingCampaigns.searchEngine,
            visibility: positionTrackingCampaigns.visibility,
            updatedAt: positionTrackingCampaigns.updatedAt,
          })
          .from(positionTrackingCampaigns)
          .where(
            and(
              eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
              eq(positionTrackingCampaigns.domain, normalizeDomain(domain)),
              isNull(positionTrackingCampaigns.deletedAt)
            )
          )
          .orderBy(desc(positionTrackingCampaigns.updatedAt))
          .limit(1)
      : Promise.resolve([]),
    // 사이트 진단 크롤러가 적재한 실측 링크 그래프 (이 도메인으로 향하는 백링크).
    domain
      ? db
          .select({
            sourceDomain: linkGraphEdges.sourceDomain,
            firstSeenAt: linkGraphEdges.firstSeenAt,
          })
          .from(linkGraphEdges)
          .where(
            and(
              eq(linkGraphEdges.targetDomain, domain),
              eq(linkGraphEdges.source, "site-audit-crawler")
            )
          )
      : Promise.resolve([] as { sourceDomain: string; firstSeenAt: Date }[]),
  ]);

  const auditOverview =
    auth && auditCampaignRows[0]
      ? await getSiteAuditOverview(auth, auditCampaignRows[0].id)
      : null;
  // 크롤된 페이지가 없는 캠페인의 점수/이슈 수는 실제 크롤 결과가 아니므로
  // 위젯에 "수집 전" 상태를 넘긴다 (시드 시절의 잔여 가공 값을 표시하지 않는다).
  const auditHasRealCrawl = (auditOverview?.crawledPages ?? 0) > 0;
  const siteAuditSummary: SiteAuditWidgetSummary | null = auditOverview
    ? {
        campaignId: auditOverview.campaign.id,
        siteHealth: auditHasRealCrawl ? auditOverview.campaign.siteHealth : null,
        lastRunAt: auditHasRealCrawl ? auditOverview.campaign.lastRunAt : null,
        crawledPages: auditOverview.crawledPages,
        errors: auditHasRealCrawl ? auditOverview.totals.errors : 0,
        warnings: auditHasRealCrawl ? auditOverview.totals.warnings : 0,
        notices: auditHasRealCrawl ? auditOverview.totals.notices : 0,
      }
    : null;

  const [positionKeywordRows, visibilityHistoryRows, activeRunRows] = positionCampaignRows[0]
    ? await Promise.all([
        db
          .select({
            keyword: trackedKeywords.keyword,
            position: trackedKeywords.position,
            previousPosition: trackedKeywords.previousPosition,
          })
          .from(trackedKeywords)
          .where(
            and(
              eq(trackedKeywords.campaignId, positionCampaignRows[0].id),
              isNull(trackedKeywords.deletedAt)
            )
          ),
        auth
          ? listVisibilityHistory(auth, positionCampaignRows[0].id)
          : Promise.resolve([]),
        auth
          ? db
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
              .limit(1)
          : Promise.resolve([]),
      ])
    : [[], [], []];
  const positionTrackingSummary: PositionTrackingWidgetSummary | null = positionCampaignRows[0]
    ? {
        campaignId: positionCampaignRows[0].id,
        location: positionCampaignRows[0].location,
        device: positionCampaignRows[0].device,
        searchEngine: positionCampaignRows[0].searchEngine,
        visibility: positionCampaignRows[0].visibility,
        updatedAt: positionCampaignRows[0].updatedAt?.toISOString() ?? null,
        keywords: positionKeywordRows,
        history: visibilityHistoryRows.map((row) => ({
          capturedAt: new Date(row.capturedAt).toISOString(),
          visibility: row.visibility,
        })),
      }
    : null;
  const positionTrackingActiveRun: PositionTrackingActiveRunSummary | null = activeRunRows[0]
    ? {
        ...activeRunRows[0],
        status: activeRunRows[0].status as "queued" | "running",
      }
    : null;

  // AI 가시성 위젯은 개요 화면과 동일한 프로젝트 집계 서비스를 사용한다.
  const aiVisibilitySummary: AiVisibilityWidgetSummary | null =
    auth && currentFolderId
      ? await (async () => {
          const project = await findAiVisibilityProject(auth, currentFolderId);
          if (!project) return null;
          const overview = await getProjectAiVisibilityDashboard(auth, currentFolderId, { range: "1m" });
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
                label: provider === "google_aio" ? "Google AI 개요" : provider === "chatgpt_web" ? "ChatGPT 웹 검색" : "Gemini 그라운딩",
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

  // 온페이지 SEO 위젯용 실측 집계 (분석 이력이 없으면 null → 위젯이 설정 CTA 표시).
  const onpageSummary =
    auth && domain ? await getOnpageDomainSummary(auth.workspaceId, domain) : null;

  const freshest = report?.freshness.serpCapturedAt ?? report?.freshness.keywordMetricsThrough;
  const dateLabel = freshest
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
        new Date(freshest)
      )
    : new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <AppShell activeToolkit="seo" activeHref="/seo/">
      <SeoWidgetDashboard
        key={domain}
        report={report}
        projects={projects}
        currentDomain={domain}
        countryCode={countryCode}
        monthlyRefDomains={buildMonthlyRefDomains(edges)}
        dateLabel={dateLabel}
        siteAuditSummary={siteAuditSummary}
        positionTrackingSummary={positionTrackingSummary}
        positionTrackingActiveRun={positionTrackingActiveRun}
        positionTrackingDomain={positionTrackingDomain}
        currentFolderId={currentFolderId}
        aiVisibilitySummary={aiVisibilitySummary}
        onpageSummary={onpageSummary}
      />
    </AppShell>
  );
}
