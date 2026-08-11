// @TASK NAVER-P0-PROVIDERS - NAVER Search Ads RelKwdStat contract tests
// @SPEC user-approved-plan#3-a-official-data-collection
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  NaverSearchAdsRateLimitError,
  NaverSearchAdsUnavailableError,
  fetchNaverRelatedKeywords,
  parseNaverQueryCount,
  sumNaverQueryCounts,
} from "@/server/naver-search-ads/client";

const credentials = {
  accessLicense: "test-access-license",
  secretKey: "test-secret-key",
  customerId: "1234567",
};

function keywordToolResponse(): Response {
  return Response.json({
    keywordList: [
      {
        relKeyword: "검색엔진최적화",
        monthlyPcQcCnt: "< 10",
        monthlyMobileQcCnt: 1250,
        monthlyAvePcClkCnt: 1.25,
        monthlyAveMobileClkCnt: "12.75",
        monthlyAvePcCtr: 0.13,
        monthlyAveMobileCtr: "1.56",
        plAvgDepth: 7.8,
        compIdx: "높음",
      },
    ],
  });
}

test("RelKwdStat는 timestamp.method.path HMAC 서명과 공식 인증 헤더를 사용한다", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const timestamp = 1_786_051_200_000;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return keywordToolResponse();
  };

  await fetchNaverRelatedKeywords(["SEO", "검색 광고"], {
    credentials,
    fetchImpl,
    now: () => timestamp,
  });

  const url = new URL(capturedUrl);
  assert.equal(url.origin, "https://api.searchad.naver.com");
  assert.equal(url.pathname, "/keywordstool");
  assert.equal(url.searchParams.get("hintKeywords"), "SEO,검색 광고");
  assert.equal(url.searchParams.get("showDetail"), "1");
  assert.equal(capturedInit?.method, "GET");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("X-Timestamp"), String(timestamp));
  assert.equal(headers.get("X-API-KEY"), "test-access-license");
  assert.equal(headers.get("X-Customer"), "1234567");
  assert.equal(
    headers.get("X-Signature"),
    createHmac("sha256", "test-secret-key")
      .update(`${timestamp}.GET./keywordstool`)
      .digest("base64"),
  );
});

test("월간 검색수의 <10 qualifier를 보존하고 PPC 지표는 공개 결과에서 제거한다", async () => {
  const result = await fetchNaverRelatedKeywords(["SEO"], {
    credentials,
    fetchImpl: async () => keywordToolResponse(),
    now: () => 1_786_051_200_000,
  });

  const row = result.keywords[0];
  assert.deepEqual(row?.monthlyPcQueries, {
    relation: "lt",
    min: 0,
    maxExclusive: 10,
    display: "<10",
  });
  assert.deepEqual(row?.monthlyMobileQueries, {
    relation: "exact",
    value: 1250,
    min: 1250,
    maxExclusive: 1251,
    display: "1,250",
  });
  assert.deepEqual(row?.monthlyTotalQueries, {
    relation: "range",
    min: 1250,
    maxExclusive: 1260,
    display: "1,250–1,259",
  });
  assert.deepEqual(Object.keys(row ?? {}).sort(), [
    "keyword",
    "monthlyMobileQueries",
    "monthlyPcQueries",
    "monthlyTotalQueries",
  ]);
});

test("count helper는 exact와 qualifier 합계를 범위로 반환한다", () => {
  const low = parseNaverQueryCount("< 10");
  const exact = parseNaverQueryCount("100");
  assert.ok(low);
  assert.ok(exact);
  assert.deepEqual(sumNaverQueryCounts([low, exact]), {
    relation: "range",
    min: 100,
    maxExclusive: 110,
    display: "100–109",
  });
  assert.deepEqual(sumNaverQueryCounts([low, low]), {
    relation: "lt",
    min: 0,
    maxExclusive: 20,
    display: "<20",
  });
});

test("seed는 최대 5개이며 검증 실패 시 공급자를 호출하지 않는다", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchNaverRelatedKeywords(["a", "b", "c", "d", "e", "f"], {
        credentials,
        fetchImpl: async () => {
          calls += 1;
          return keywordToolResponse();
        },
      }),
    /최대 5개/,
  );
  assert.equal(calls, 0);
});

test("429는 inline retry 없이 typed rate-limit 오류로 반환한다", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchNaverRelatedKeywords(["SEO"], {
        credentials,
        fetchImpl: async () => {
          calls += 1;
          return Response.json({ message: "secret provider payload" }, { status: 429 });
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof NaverSearchAdsRateLimitError);
      assert.equal(error.statusCode, 429);
      assert.doesNotMatch(error.message, /secret provider payload/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("Search Ads 자격 증명이 없으면 typed unavailable 오류를 반환한다", async () => {
  await assert.rejects(
    () => fetchNaverRelatedKeywords(["SEO"], { env: {} }),
    (error: unknown) =>
      error instanceof NaverSearchAdsUnavailableError && error.status === "unavailable",
  );
});
