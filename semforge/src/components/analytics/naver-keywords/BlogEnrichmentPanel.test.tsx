// @TASK NAVER-KI-BLOG-UI-01 - 블로그 보강 패널 접근성·상태 테스트
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST node:test
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlogEnrichmentPanel } from "@/components/analytics/naver-keywords/BlogEnrichmentPanel";
import type { BlogEnrichmentView } from "@/components/analytics/naver-keywords/blog-enrichment-model";

const report: BlogEnrichmentView = {
  generatedAt: "2026-08-04T00:00:00.000Z",
  results: [
    {
      keyword: "정상 키워드",
      status: "live",
      total: 321,
      source: "naver-api-hub-blog-search",
      cache: "stale",
      fetchedAt: "2026-08-03T00:00:00.000Z",
      reason: "최근 30일 이내 캐시를 표시합니다.",
    },
    {
      keyword: "실패 키워드",
      status: "error",
      total: null,
      source: "naver-api-hub-blog-search",
      cache: "fresh",
      fetchedAt: "2026-08-04T00:00:00.000Z",
      reason: "잠시 후 다시 시도해 주세요.",
    },
  ],
};

test("보강은 자동 실행이 아닌 명시적인 type=button과 선택 20개 상한을 안내한다", () => {
  const html = renderToStaticMarkup(
    <BlogEnrichmentPanel
      selectedKeywords={Array.from({ length: 24 }, (_, index) => `키워드 ${index + 1}`)}
      state={{ status: "idle" }}
      onRequest={() => undefined}
    />,
  );

  assert.match(html, /type="button"/);
  assert.match(html, /선택 키워드 블로그 검색 보강/);
  assert.match(html, /앞 20개/);
  assert.match(html, /네이버 블로그 검색 API 응답 예시\/통합검색 순위 아님/);
});

test("키워드별 total·source·cache·fetchedAt·status·reason을 반응형 상태 목록으로 렌더링한다", () => {
  const html = renderToStaticMarkup(
    <BlogEnrichmentPanel
      selectedKeywords={["정상 키워드", "실패 키워드"]}
      state={{ status: "success", report }}
      onRequest={() => undefined}
    />,
  );

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /정상 키워드/);
  assert.match(html, /실패 키워드/);
  assert.match(html, /321/);
  assert.match(html, /naver-api-hub-blog-search/);
  assert.match(html, /오래된 캐시/);
  assert.match(html, /신선한 캐시/);
  assert.match(html, /2026-08-03 00:00/);
  assert.match(html, /정상 \(live\)/);
  assert.match(html, /오류 \(error\)/);
  assert.match(html, /최근 30일 이내 캐시를 표시합니다/);
  assert.match(html, /잠시 후 다시 시도해 주세요/);
  assert.match(html, /미제공/);
  assert.match(html, /<article/);
});

test("요청 중에는 버튼의 busy 상태와 진행 상황을 스크린 리더에 노출한다", () => {
  const html = renderToStaticMarkup(
    <BlogEnrichmentPanel
      selectedKeywords={["키워드"]}
      state={{ status: "loading" }}
      onRequest={() => undefined}
    />,
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /블로그 검색 응답을 조회하고 있습니다/);
});
