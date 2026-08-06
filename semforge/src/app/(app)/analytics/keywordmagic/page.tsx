// @TASK NAVER-P0-EXPLORER - 한국형 키워드 탐색기 전용 라우트
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/model.test.ts
import { AppShell } from "@/components/app/AppShell";
import { NaverKeywordExplorer } from "@/components/analytics/naver-keywords/NaverKeywordExplorer";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  keyword?: string | string[];
  keywords?: string | string[];
}>;

function collectInitialSeeds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => item.split(/[\n,]/u)).slice(0, 5);
}

export default async function KeywordMagicPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const initialSeeds = [
    ...collectInitialSeeds(query.keyword),
    ...collectInitialSeeds(query.keywords),
  ].slice(0, 5);

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/keywordmagic/">
      <NaverKeywordExplorer initialSeeds={initialSeeds} />
    </AppShell>
  );
}
