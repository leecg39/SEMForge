// @TASK NAVER-KI-BLOG-UI-01 - 선택 키워드 블로그 보강 클라이언트 모델 테스트
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST node:test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOG_ENRICHMENT_ENDPOINT,
  MAX_BLOG_ENRICHMENT_KEYWORDS,
  buildBlogEnrichmentRequest,
  parseBlogEnrichmentEnvelope,
  selectBlogEnrichmentKeywords,
} from "@/components/analytics/naver-keywords/blog-enrichment-model";

test("블로그 보강 요청은 선택된 키워드 중 앞 20개만 POST 본문에 담는다", () => {
  const selected = Array.from({ length: 24 }, (_, index) => `선택 키워드 ${index + 1}`);
  const keywords = selectBlogEnrichmentKeywords(selected);
  const request = buildBlogEnrichmentRequest(keywords);

  assert.equal(MAX_BLOG_ENRICHMENT_KEYWORDS, 20);
  assert.deepEqual(keywords, selected.slice(0, 20));
  assert.equal(request.url, BLOG_ENRICHMENT_ENDPOINT);
  assert.equal(request.url, "/api/analytics/naver-keywords/blog-enrichment");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(String(request.init.body)), { keywords: selected.slice(0, 20) });
});

test("부분 실패나 HTTP 503에 실릴 수 있는 data envelope를 키워드별 메타와 함께 보존한다", () => {
  const report = parseBlogEnrichmentEnvelope({
    data: {
      keywords: ["정상 키워드", "실패 키워드"],
      generatedAt: "2026-08-04T00:00:00.000Z",
      results: [
        {
          keyword: "정상 키워드",
          blog: {
            status: "live",
            cache: "stale",
            measurement: "absolute",
            source: "naver-api-hub-blog-search",
            fetchedAt: "2026-08-03T00:00:00.000Z",
            expiresAt: "2026-08-04T00:00:00.000Z",
            reason: "최근 30일 이내 캐시를 표시합니다.",
            data: {
              total: 321,
              items: [],
              resultLabel: "네이버 블로그 검색 API 응답 예시",
            },
          },
        },
        {
          keyword: "실패 키워드",
          blog: {
            status: "error",
            cache: "fresh",
            measurement: "absolute",
            source: "naver-api-hub-blog-search",
            fetchedAt: "2026-08-04T00:00:00.000Z",
            expiresAt: "2026-08-04T00:00:00.000Z",
            reason: "잠시 후 다시 시도해 주세요.",
          },
        },
      ],
    },
    error: { code: "UPSTREAM_UNAVAILABLE", message: "일부 공급자 오류" },
  });

  assert.ok(report);
  assert.equal(report.results.length, 2);
  assert.deepEqual(report.results[0], {
    keyword: "정상 키워드",
    status: "live",
    total: 321,
    source: "naver-api-hub-blog-search",
    cache: "stale",
    fetchedAt: "2026-08-03T00:00:00.000Z",
    reason: "최근 30일 이내 캐시를 표시합니다.",
  });
  assert.deepEqual(report.results[1], {
    keyword: "실패 키워드",
    status: "error",
    total: null,
    source: "naver-api-hub-blog-search",
    cache: "fresh",
    fetchedAt: "2026-08-04T00:00:00.000Z",
    reason: "잠시 후 다시 시도해 주세요.",
  });
});

test("data가 없는 오류 envelope에는 보강 결과를 만들어내지 않는다", () => {
  assert.equal(
    parseBlogEnrichmentEnvelope({ error: { code: "UNAVAILABLE", message: "사용할 수 없습니다." } }),
    null,
  );
});
