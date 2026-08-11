// @TASK P3-C2-T1 - NAVER official production provider contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/providers/naver/production.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NAVER_AGE_CODES,
  createNaverProductionProvider,
  NaverOpenApiRequestError,
} from "@/server/providers/naver/production";

async function fixture(name: string): Promise<unknown> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as unknown;
}

const range = {
  startDate: "2026-07-01",
  endDate: "2026-07-07",
  timeUnit: "date" as const,
};

test("공식 NAVER Open API URL/헤더와 Search Ads fixture를 허용 데이터로만 정규화한다", async () => {
  const [searchAdsFixture, datalabFixture, blogFixture] = await Promise.all([
    fixture("search-ads-monthly.json"),
    fixture("datalab-trend.json"),
    fixture("blog-search.json"),
  ]);
  const openApiRequests: Array<{ url: URL; init: RequestInit; body: Record<string, unknown> | null }> = [];
  let openApiInFlight = 0;
  let maxOpenApiInFlight = 0;

  const provider = createNaverProductionProvider({
    credentials: { clientId: "official-client", clientSecret: "official-secret" },
    now: () => new Date("2026-07-08T00:00:00.000Z"),
    fetchImpl: async (input, init = {}) => {
      openApiInFlight += 1;
      maxOpenApiInFlight = Math.max(maxOpenApiInFlight, openApiInFlight);
      const url = new URL(String(input));
      const body = typeof init.body === "string"
        ? JSON.parse(init.body) as Record<string, unknown>
        : null;
      openApiRequests.push({ url, init, body });
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      openApiInFlight -= 1;
      return Response.json(url.pathname.endsWith("/blog.json") ? blogFixture : datalabFixture);
    },
    searchAdsOptions: {
      credentials: {
        accessLicense: "search-ads-access",
        secretKey: "search-ads-secret",
        customerId: "search-ads-customer",
      },
      now: () => Date.parse("2026-07-08T00:00:00.000Z"),
      fetchImpl: async () => Response.json(searchAdsFixture),
    },
  });

  const monthly = await provider.getMonthlySearchVolume({ query: "검색엔진최적화" });
  const trend = await provider.getRelativeTrend({ query: "검색엔진최적화", range });
  const gender = await provider.getGenderDemographics({ query: "검색엔진최적화", range });
  const age = await provider.getAgeDemographics({ query: "검색엔진최적화", range });
  const blog = await provider.getBlogResultTotal({ query: "검색엔진최적화" });

  assert.deepEqual(monthly.pc, {
    relation: "lt",
    min: 0,
    maxExclusive: 10,
    display: "<10",
  });
  assert.deepEqual(monthly.mobile, {
    relation: "exact",
    value: 120,
    min: 120,
    maxExclusive: 121,
    display: "120",
  });
  assert.deepEqual(trend.points, [
    { period: "2026-07-01", ratio: 42.5 },
    { period: "2026-07-02", ratio: 100 },
  ]);
  assert.deepEqual(gender.segments.map((segment) => segment.gender), ["m", "f"]);
  assert.deepEqual(age.segments.map((segment) => segment.age), NAVER_AGE_CODES);
  assert.equal(blog.total, 987654);

  const serialized = JSON.stringify({ monthly, trend, gender, age, blog });
  for (const forbidden of [
    "competition",
    "monthlyAvePcClkCnt",
    "monthlyAveragePcClicks",
    "plAvgDepth",
    "rank",
    "fixture title",
    "fixture-user",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden provider field leaked: ${forbidden}`);
  }

  assert.equal(openApiRequests.length, 15);
  assert.equal(maxOpenApiInFlight, 1);
  for (const request of openApiRequests) {
    assert.equal(request.url.origin, "https://openapi.naver.com");
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get("X-Naver-Client-Id"), "official-client");
    assert.equal(headers.get("X-Naver-Client-Secret"), "official-secret");
    assert.equal(headers.has("X-NCP-APIGW-API-KEY-ID"), false);
  }
  const blogRequest = openApiRequests.at(-1);
  assert.equal(blogRequest?.url.pathname, "/v1/search/blog.json");
  assert.equal(blogRequest?.url.searchParams.get("display"), "1");
  assert.equal(blogRequest?.url.searchParams.get("query"), "검색엔진최적화");

  const datalabRequests = openApiRequests.slice(0, -1);
  assert.ok(datalabRequests.every((request) => request.url.pathname === "/v1/datalab/search"));
  assert.deepEqual(
    datalabRequests.filter((request) => request.body?.gender).map((request) => request.body?.gender),
    ["m", "f"],
  );
  assert.deepEqual(
    datalabRequests.filter((request) => request.body?.ages).flatMap((request) => request.body?.ages as string[]),
    NAVER_AGE_CODES,
  );
});

test("Open API 자격증명 누락과 429를 안전하고 안정적인 오류로 구분한다", async () => {
  const unavailable = createNaverProductionProvider({ env: {} });
  await assert.rejects(
    () => unavailable.getBlogResultTotal({ query: "SEO" }),
    (error: unknown) =>
      error instanceof NaverOpenApiRequestError && error.kind === "unavailable",
  );

  const rateLimited = createNaverProductionProvider({
    credentials: { clientId: "id", clientSecret: "secret" },
    fetchImpl: async () => new Response(null, { status: 429 }),
  });
  await assert.rejects(
    () => rateLimited.getRelativeTrend({ query: "SEO", range }),
    (error: unknown) =>
      error instanceof NaverOpenApiRequestError &&
      error.kind === "rate_limited" &&
      error.statusCode === 429,
  );
});
