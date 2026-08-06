// @TASK NAVER-P0-PROVIDERS - NAVER API HUB contract tests
// @SPEC user-approved-plan#3-a-official-data-collection
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NaverApiHubUnavailableError,
  fetchNaverBlogSearch,
  fetchNaverSearchTrend,
} from "@/server/naver-api-hub/client";

const credentials = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
};

test("Blog Search는 API HUB URL과 서버 인증 헤더를 사용하고 상위 항목을 정규화한다", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({
      lastBuildDate: "Tue, 04 Aug 2026 09:00:00 +0900",
      total: 1234,
      start: 1,
      display: 3,
      items: [
        {
          title: "<b>검색엔진</b> 최적화",
          link: "https://blog.naver.com/example/1",
          description: "<b>SEO</b> 글",
          bloggername: "SEM 연구소",
          bloggerlink: "https://blog.naver.com/example",
          postdate: "20260803",
        },
      ],
    });
  };

  const result = await fetchNaverBlogSearch(
    { query: "검색엔진 최적화", display: 3 },
    { credentials, fetchImpl },
  );

  const url = new URL(capturedUrl);
  assert.equal(url.origin, "https://naverapihub.apigw.ntruss.com");
  assert.equal(url.pathname, "/search/v1/blog");
  assert.equal(url.searchParams.get("query"), "검색엔진 최적화");
  assert.equal(url.searchParams.get("display"), "3");
  assert.equal(capturedInit?.method, "GET");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("X-NCP-APIGW-API-KEY-ID"), "test-client-id");
  assert.equal(headers.get("X-NCP-APIGW-API-KEY"), "test-client-secret");
  assert.equal(result.total, 1234);
  assert.equal(result.items[0]?.title, "검색엔진 최적화");
  assert.equal(result.items[0]?.description, "SEO 글");
});

test("Search Trend는 최근 12개월과 선택 필터를 공식 POST 본문으로 전달한다", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({
      startDate: "2025-08-04",
      endDate: "2026-08-04",
      timeUnit: "month",
      results: [
        {
          title: "검색엔진 최적화",
          keywords: ["검색엔진 최적화", "SEO"],
          data: [{ period: "2026-08-01", ratio: 82.25 }],
        },
      ],
    });
  };

  const result = await fetchNaverSearchTrend(
    {
      keywordGroups: [
        { groupName: "검색엔진 최적화", keywords: ["검색엔진 최적화", "SEO"] },
      ],
      device: "mo",
      gender: "f",
      ages: ["3", "4"],
    },
    {
      credentials,
      fetchImpl,
      now: () => new Date("2026-08-04T00:00:00.000Z"),
    },
  );

  assert.equal(capturedUrl, "https://naverapihub.apigw.ntruss.com/search-trend/v1/search");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    startDate: "2025-08-04",
    endDate: "2026-08-04",
    timeUnit: "month",
    keywordGroups: [
      { groupName: "검색엔진 최적화", keywords: ["검색엔진 최적화", "SEO"] },
    ],
    device: "mo",
    gender: "f",
    ages: ["3", "4"],
  });
  assert.equal(result.results[0]?.data[0]?.ratio, 82.25);
});

test("API HUB 자격 증명이 없으면 호출하지 않고 typed unavailable 오류를 던진다", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchNaverBlogSearch(
        { query: "SEO" },
        {
          env: {},
          fetchImpl: async () => {
            calls += 1;
            return Response.json({});
          },
        },
      ),
    (error: unknown) =>
      error instanceof NaverApiHubUnavailableError && error.status === "unavailable",
  );
  assert.equal(calls, 0);
});

test("API HUB 공급자 오류 본문은 예외 메시지에 노출하지 않는다", async () => {
  await assert.rejects(
    () =>
      fetchNaverBlogSearch(
        { query: "SEO" },
        {
          credentials,
          fetchImpl: async () =>
            Response.json(
              { error: { message: "test-client-secret should stay private" } },
              { status: 500 },
            ),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /test-client-secret/);
      return true;
    },
  );
});
