// @TASK NAVER-P0-EXPLORER - 탐색기 렌더링·접근성 회귀 테스트
// @SPEC user-approved-plan#4-tests-and-release
// @TEST src/components/analytics/naver-keywords/KeywordResults.test.tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KeywordResults } from "@/components/analytics/naver-keywords/KeywordResults";
import { NaverKeywordExplorer } from "@/components/analytics/naver-keywords/NaverKeywordExplorer";
import type { NaverKeywordExploreView } from "@/components/analytics/naver-keywords/types";

const report: NaverKeywordExploreView = {
  seeds: ["검색 광고"],
  generatedAt: "2026-08-04T00:00:00.000Z",
  total: 1,
  provenance: {
    status: "live",
    cache: "fresh",
    measurement: "absolute",
    source: "naver-search-ads",
    fetchedAt: "2026-08-04T00:00:00.000Z",
    expiresAt: "2026-08-11T00:00:00.000Z",
  },
  rows: [
    {
      snapshotId: "snapshot-1",
      keyword: "검색 광고",
      normalizedKeyword: "검색 광고",
      monthlyPcQueries: { relation: "lt", min: 0, maxExclusive: 10, display: "<10" },
      monthlyMobileQueries: { relation: "exact", min: 120, maxExclusive: 121, value: 120, display: "120" },
      monthlyTotalQueries: { relation: "range", min: 120, maxExclusive: 130, display: "120–129" },
      monthlyAveragePcClicks: 1.2,
      monthlyAverageMobileClicks: 2.4,
      monthlyAveragePcCtr: 0.2,
      monthlyAverageMobileCtr: 0.4,
      averageAdDepth: 5,
      competition: "high",
      competitionLabel: "높음",
      intent: "commercial",
      intentMeasurement: "inferred",
      intentModel: "clone-intent-v1",
      source: "naver-search-ads",
      fetchedAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-11T00:00:00.000Z",
      cache: "fresh",
    },
  ],
};

test("초기 탐색기는 이름 있는 form과 명시적 submit 버튼을 렌더링한다", () => {
  const html = renderToStaticMarkup(<NaverKeywordExplorer />);
  assert.match(html, /한국형 키워드 탐색기/);
  assert.match(html, /aria-label="네이버 연관 키워드 탐색"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /공식 통계/);
});

test("결과는 접근 가능한 데스크톱 표와 모바일 카드를 함께 렌더링하고 범위값을 보존한다", () => {
  const html = renderToStaticMarkup(
    <KeywordResults
      report={report}
      selectedKeywords={new Set()}
      onToggleKeyword={() => undefined}
      onTogglePage={() => undefined}
    />,
  );
  assert.match(html, /<caption[^>]*>네이버 공식 데이터 기반 연관 키워드 결과<\/caption>/);
  assert.match(html, /aria-label="검색 광고 선택"/);
  assert.match(html, /&lt;10/);
  assert.match(html, /120–129/);
  assert.match(html, /상업 조사 · 추론/);
  assert.match(html, /블로그 공급량 미제공/);
  assert.match(html, /<article/);
});
