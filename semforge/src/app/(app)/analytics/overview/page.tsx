import { AppShell } from "@/components/app/AppShell";
import { DomainIntelligenceDashboard } from "@/components/analytics/DomainIntelligenceDashboard";
import { DomainOverviewLanding } from "@/components/analytics/domain-overview/Landing";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { pageSession } from "@/server/page-auth";
import { getAvailableDomains, getDomainAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";

const SUPPORTED_COUNTRIES = new Set(["KR", "US"]);

export default async function DomainOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; country?: string }>;
}) {
  const { auth } = await pageSession();
  const { domain: rawDomain, country: rawCountry } = await searchParams;
  const domain = rawDomain ? normalizeDomain(rawDomain) : "";

  // 도메인 없이 진입하면 검색 랜딩을 보여준다 (기본 도메인 폴백 없음).
  if (!domain.includes(".")) {
    const availableDomains = await getAvailableDomains(auth);
    return (
      <AppShell activeToolkit="seo" activeHref="/analytics/overview/">
        <DomainOverviewLanding availableDomains={availableDomains} />
      </AppShell>
    );
  }

  // 국가 파라미터가 유효하면 우선하고, 없으면 .kr 도메인만 한국 DB 로 맞춘다.
  const requestedCountry = rawCountry?.trim().toUpperCase() ?? "";
  const countryCode = SUPPORTED_COUNTRIES.has(requestedCountry)
    ? requestedCountry
    : domain.endsWith(".kr")
      ? "KR"
      : "US";

  const initialReport = await getDomainAnalytics({
    domain,
    countryCode,
    device: "desktop",
  });

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/overview/">
      <DomainIntelligenceDashboard
        // 도메인/국가가 바뀌면 클라이언트 상태(탭·수집 패널)를 새로 시작한다.
        key={`${domain}|${countryCode}`}
        initialReport={initialReport}
        initialDomain={domain}
        initialCountry={countryCode}
      />
    </AppShell>
  );
}
