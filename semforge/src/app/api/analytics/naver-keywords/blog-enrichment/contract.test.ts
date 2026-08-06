// @TASK NAVER-KI-API-06 - NAVER 블로그 공급량 보강 API 계약 검증
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/app/api/analytics/naver-keywords/blog-enrichment/contract.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blogEnrichmentBodySchema,
  blogEnrichmentHttpStatus,
} from "@/app/api/analytics/naver-keywords/blog-enrichment/contract";

test("본문은 keywords 문자열 배열 1~20개만 엄격하게 허용한다", () => {
  assert.equal(blogEnrichmentBodySchema.safeParse({ keywords: ["키워드"] }).success, true);
  assert.equal(
    blogEnrichmentBodySchema.safeParse({
      keywords: Array.from({ length: 20 }, (_, index) => `키워드 ${index + 1}`),
    }).success,
    true,
  );
  assert.equal(blogEnrichmentBodySchema.safeParse({ keywords: [] }).success, false);
  assert.equal(
    blogEnrichmentBodySchema.safeParse({
      keywords: Array.from({ length: 21 }, (_, index) => `키워드 ${index + 1}`),
    }).success,
    false,
  );
  assert.equal(blogEnrichmentBodySchema.safeParse({ keywords: [1] }).success, false);
  assert.equal(
    blogEnrichmentBodySchema.safeParse({ keywords: ["키워드"], forceRefresh: true }).success,
    false,
  );
});

test("블로그 결과가 하나라도 live면 200이고 모두 실패하면 503이다", () => {
  assert.equal(
    blogEnrichmentHttpStatus([
      { blog: { status: "unavailable" } },
      { blog: { status: "live" } },
    ]),
    200,
  );
  assert.equal(
    blogEnrichmentHttpStatus([
      { blog: { status: "unavailable" } },
      { blog: { status: "error" } },
    ]),
    503,
  );
  assert.equal(blogEnrichmentHttpStatus([]), 503);
});
