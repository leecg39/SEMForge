import { AppShell } from "@/components/app/AppShell";
import { SeoDashboard } from "@/components/seo/SeoDashboard";
import { normalizeDomain } from "@/lib/analytics/metrics";

export const dynamic = "force-dynamic";

export default async function SeoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain: rawDomain } = await searchParams;
  // ?domain= 이 있으면 대시보드의 초기 분석 대상으로 쓴다 (없으면 첫 폴더 도메인).
  const normalized = rawDomain ? normalizeDomain(rawDomain) : "";
  const initialDomain = normalized.includes(".") ? normalized : undefined;

  return (
    <AppShell activeToolkit="seo" activeHref="/seo/">
      <SeoDashboard initialDomain={initialDomain} />
    </AppShell>
  );
}
