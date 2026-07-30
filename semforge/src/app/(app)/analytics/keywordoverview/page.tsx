import { AppShell } from "@/components/app/AppShell";
import { KeywordOverviewDashboard } from "@/components/analytics/KeywordOverviewDashboard";

export const dynamic = "force-dynamic";

/**
 * Keyword Overview — TalorData 실시간 SERP 기반 라이브 도구.
 * 정적 세그먼트가 /analytics/[...seg] 캐치올보다 우선하므로 mock 템플릿을 대체한다.
 */
export default async function KeywordOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string }>;
}) {
  const { keyword } = await searchParams;
  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/keywordoverview/">
      <KeywordOverviewDashboard initialKeyword={keyword?.trim() ?? ""} />
    </AppShell>
  );
}
