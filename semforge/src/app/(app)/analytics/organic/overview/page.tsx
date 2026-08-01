import { AppShell } from "@/components/app/AppShell";
import { OrganicResearchDashboard } from "@/components/analytics/OrganicResearchDashboard";
import { buildDomainAnalytics, normalizeDomain } from "@/lib/analytics/metrics";
import {
  buildOrganicOverviewExtras,
  countRankedKeywords,
} from "@/lib/analytics/organic-overview";
import type { AnalyticsDevice } from "@/lib/analytics/types";
import { getAnalyticsDataset } from "@/server/analytics";

export const dynamic = "force-dynamic";

const FALLBACK_DOMAIN = "www.uinus.co.kr";
/** 원본 필터바의 고정 DB 탭 (ko.semrush 기준 KR/US/UK) */
const DB_TABS = ["KR", "US", "UK"] as const;

/**
 * Organic Research(자연검색 순위) — ko.semrush.com/analytics/organic/overview 클론.
 * 축적된 serp_snapshots 를 도메인 관점으로 조회하는 라이브 화면.
 * 리포트(buildDomainAnalytics)와 화면 전용 파생(buildOrganicOverviewExtras)을
 * 같은 데이터셋 스캔으로 계산해 클라이언트에는 직렬화된 결과만 넘긴다.
 */
export default async function OrganicResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; db?: string; device?: string }>;
}) {
  const { domain: rawDomain, db, device: rawDevice } = await searchParams;
  const normalized = rawDomain ? normalizeDomain(rawDomain) : "";
  const domain = normalized.includes(".") ? normalized : FALLBACK_DOMAIN;
  const countryCode = db
    ? db.toUpperCase()
    : domain.endsWith(".kr")
      ? "KR"
      : "US";
  const device: AnalyticsDevice = rawDevice === "mobile" ? "mobile" : "desktop";

  const dataset = await getAnalyticsDataset({ countryCode, device });
  const query = { domain, countryCode, device };
  const report = buildDomainAnalytics(dataset, query);
  if (report) report.provenance = "live";
  const extras = report ? buildOrganicOverviewExtras(dataset, query) : null;

  // DB 탭 카운트: 활성 국가는 위 데이터셋 재사용, 나머지는 국가별 데이터셋으로 계산.
  const dbCounts = await Promise.all(
    DB_TABS.map(async (code) => {
      const scoped =
        code === countryCode ? dataset : await getAnalyticsDataset({ countryCode: code, device });
      return { code, count: countRankedKeywords(scoped, { domain, countryCode: code, device }) };
    }),
  );
  // 고정 탭에 없는 국가로 조회한 경우 활성 탭을 앞에 추가.
  if (!DB_TABS.includes(countryCode as (typeof DB_TABS)[number])) {
    dbCounts.unshift({
      code: countryCode as (typeof DB_TABS)[number],
      count: countRankedKeywords(dataset, query),
    });
  }

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/organic/overview">
      <OrganicResearchDashboard
        initialReport={report}
        extras={extras}
        initialDomain={domain}
        initialCountry={countryCode}
        initialDevice={device}
        dbCounts={dbCounts}
      />
    </AppShell>
  );
}
