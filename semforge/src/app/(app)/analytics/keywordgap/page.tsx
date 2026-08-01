import { AppShell } from "@/components/app/AppShell";
import { KeywordGapDashboard } from "@/components/analytics/keyword-gap/KeywordGapDashboard";
import { KeywordGapLanding } from "@/components/analytics/keyword-gap/Landing";
import {
  formatGapTargetParam,
  MAX_GAP_TARGETS,
  parseGapTargetParam,
  type GapTarget,
} from "@/lib/analytics/keyword-gap";
import { getKeywordGap } from "@/server/keyword-gap";

export const dynamic = "force-dynamic";

const SUPPORTED_COUNTRIES = new Set(["KR", "US"]);

/**
 * Keyword Gap — 수집된 SERP 스냅샷 유니버스로 최대 5개 도메인의 키워드
 * 프로필을 비교하는 라이브 화면. 정적 세그먼트가 /analytics/[...seg]
 * 캐치올보다 우선하므로 mock 템플릿을 대체한다.
 */
export default async function KeywordGapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const you = parseGapTargetParam(single("you"));
  const competitors: GapTarget[] = [];
  for (let index = 1; index < MAX_GAP_TARGETS; index += 1) {
    const target = parseGapTargetParam(single(`c${index}`));
    if (target) competitors.push(target);
  }

  // 유효한 나 + 경쟁자 1개 이상이 없으면 입력 랜딩을 보여준다.
  if (!you || competitors.length === 0) {
    return (
      <AppShell activeToolkit="seo" activeHref="/analytics/keywordgap/">
        <KeywordGapLanding />
      </AppShell>
    );
  }

  const requestedCountry = single("country")?.trim().toUpperCase() ?? "";
  const countryCode = SUPPORTED_COUNTRIES.has(requestedCountry) ? requestedCountry : "KR";
  const device = single("device") === "mobile" ? ("mobile" as const) : ("desktop" as const);

  const targets = [you, ...competitors];
  const report = await getKeywordGap({ targets, countryCode, device });

  return (
    <AppShell activeToolkit="seo" activeHref="/analytics/keywordgap/">
      <KeywordGapDashboard
        // 대상/국가가 바뀌면 클라이언트 상태(탭·필터·페이지)를 새로 시작한다.
        key={`${targets.map(formatGapTargetParam).join(",")}|${countryCode}|${device}`}
        initialReport={report}
      />
    </AppShell>
  );
}
