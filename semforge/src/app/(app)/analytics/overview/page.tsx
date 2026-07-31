import { AppShell } from "@/components/app/AppShell";
import { DomainIntelligenceDashboard } from "@/components/analytics/DomainIntelligenceDashboard";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { getDomainAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";

export default async function DomainOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain: rawDomain } = await searchParams;
  // 랜딩(/seo/ 등)에서 넘어온 도메인을 그대로 초기 분석 대상으로 쓴다.
  const normalized = rawDomain ? normalizeDomain(rawDomain) : "";
  const domain = normalized.includes(".") ? normalized : "";
  // .kr 도메인은 한국 DB 로 초기 리포트·수집을 맞춘다.
  const countryCode = domain.endsWith(".kr") ? "KR" : "US";

  const initialReport = domain
    ? await getDomainAnalytics({
        domain,
        countryCode,
        device: "desktop",
      })
    : null;

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/overview/">
      <DomainIntelligenceDashboard
        initialReport={initialReport}
        initialDomain={domain}
        initialCountry={countryCode}
      />
    </AppShell>
  );
}
