import { and, eq, isNull } from "drizzle-orm";
import { AppShell } from "@/components/app/AppShell";
import { SeoWidgetDashboard } from "@/components/seo-dash/SeoWidgetDashboard";
import type { RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import { db } from "@/db/client";
import { folders, linkGraphEdges } from "@/db/schema";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getAuth } from "@/lib/session";
import { getDomainAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";

const FALLBACK_DOMAIN = "northwind.example.com";

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

  const normalized = rawDomain ? normalizeDomain(rawDomain) : "";
  const domain = normalized.includes(".")
    ? normalized
    : folderRows[0]?.domain ?? FALLBACK_DOMAIN;
  const countryCode = domain.endsWith(".kr") ? "KR" : "US";

  const [report, edges] = await Promise.all([
    getDomainAnalytics({ domain, countryCode, device: "desktop" }),
    db
      .select({
        sourceDomain: linkGraphEdges.sourceDomain,
        firstSeenAt: linkGraphEdges.firstSeenAt,
      })
      .from(linkGraphEdges)
      .where(eq(linkGraphEdges.targetDomain, domain)),
  ]);

  const freshest = report?.freshness.serpCapturedAt ?? report?.freshness.keywordMetricsThrough;
  const dateLabel = freshest
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
        new Date(freshest)
      )
    : new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <AppShell activeToolkit="seo" activeHref="/seo/">
      <SeoWidgetDashboard
        report={report}
        projects={folderRows}
        currentDomain={domain}
        monthlyRefDomains={buildMonthlyRefDomains(edges)}
        dateLabel={dateLabel}
      />
    </AppShell>
  );
}
