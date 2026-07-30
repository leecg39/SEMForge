import { and, desc, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import { SeoWidgetDashboard } from "@/components/seo-dash/SeoWidgetDashboard";
import type { AiVisibilityWidgetSummary } from "@/components/seo-dash/WidgetAiSearch";
import type { RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import type { PositionTrackingWidgetSummary } from "@/components/seo-dash/WidgetPositionTracking";
import type { SiteAuditWidgetSummary } from "@/components/seo-dash/WidgetSiteAudit";
import { db } from "@/db/client";
import {
  folders,
  positionTrackingCampaigns,
  siteAuditCampaigns,
  trackedKeywords,
} from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";
import { getAiVisibilityOverview } from "@/server/ai-visibility/overview";
import { getDomainAnalytics } from "@/server/analytics";
import { getSiteAuditOverview } from "@/server/siteaudit/overview";

export const dynamic = "force-dynamic";

/** link_graph firstSeenAt 기준 최근 12개월 누적 참조 도메인 수 */
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
    for (const edge of edges) {
      if (new Date(edge.firstSeenAt) < month.end) seen.add(edge.sourceDomain);
    }
    return { label: month.label, referringDomains: seen.size };
  });
}

export default async function SeoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain: rawDomain } = await searchParams;
  const auth = await getAuth();

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
  const countryCode = domain.endsWith(".kr") ? "KR" : "US";

  // 링크 그래프는 아직 라이브 수집 소스가 없어 참조 도메인 추이를 제공하지 않는다.
  const edges: { sourceDomain: string; firstSeenAt: Date }[] = [];

  const [report, auditCampaignRows, positionCampaignRows] = await Promise.all([
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

  const positionKeywordRows = positionCampaignRows[0]
    ? await db
        .select({
          keyword: trackedKeywords.keyword,
          position: trackedKeywords.position,
        })
        .from(trackedKeywords)
        .where(
          and(
            eq(trackedKeywords.campaignId, positionCampaignRows[0].id),
            isNull(trackedKeywords.deletedAt)
          )
        )
    : [];
  const positionTrackingSummary: PositionTrackingWidgetSummary | null = positionCampaignRows[0]
    ? {
        campaignId: positionCampaignRows[0].id,
        location: positionCampaignRows[0].location,
        device: positionCampaignRows[0].device,
        searchEngine: positionCampaignRows[0].searchEngine,
        visibility: positionCampaignRows[0].visibility,
        updatedAt: positionCampaignRows[0].updatedAt?.toISOString() ?? null,
        keywords: positionKeywordRows,
      }
    : null;

  // AI 가시성 위젯용 실측 요약 (추적 쿼리가 없으면 null → 위젯이 수집 안내 표시).
  const aiVisibilitySummary: AiVisibilityWidgetSummary | null =
    auth && domain
      ? await (async () => {
          const overview = await getAiVisibilityOverview(auth, domain);
          if (overview.stats.queryCount === 0) return null;
          return {
            queryCount: overview.stats.queryCount,
            aioCount: overview.stats.aioCount,
            citedCount: overview.stats.citedCount,
            judgeableAioCount: overview.stats.judgeableAioCount,
            unknownCitationCount: overview.stats.unknownCitationCount,
            lastCollectedAt: overview.stats.lastCollectedAt,
          };
        })()
      : null;

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
        aiVisibilitySummary={aiVisibilitySummary}
      />
    </AppShell>
  );
}
