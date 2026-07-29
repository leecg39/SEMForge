import { AppShell } from "@/components/app/AppShell";
import { OrganicResearchDashboard } from "@/components/analytics/OrganicResearchDashboard";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getDomainAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";

const FALLBACK_DOMAIN = "northwind.example.com";

/**
 * Organic Research — 축적된 serp_snapshots 를 도메인 관점으로 조회하는 라이브 화면.
 * 정적 세그먼트가 /analytics/[...seg] 캐치올보다 우선하므로 mock 템플릿을 대체한다.
 */
export default async function OrganicResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain: rawDomain } = await searchParams;
  const normalized = rawDomain ? normalizeDomain(rawDomain) : "";
  const domain = normalized.includes(".") ? normalized : FALLBACK_DOMAIN;
  const countryCode = domain.endsWith(".kr") ? "KR" : "US";

  const initialReport = await getDomainAnalytics({
    domain,
    countryCode,
    device: "desktop",
  });

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/organic/overview">
      <OrganicResearchDashboard
        initialReport={initialReport}
        initialDomain={domain}
        initialCountry={countryCode}
      />
    </AppShell>
  );
}
