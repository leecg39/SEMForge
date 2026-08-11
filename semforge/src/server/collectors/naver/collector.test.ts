// @TASK P3-C2-T1 - NAVER collection orchestration contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/naver/collector.ts
import assert from "node:assert/strict";
import test from "node:test";

import { NaverSearchAdsRateLimitError } from "@/server/naver-search-ads/client";
import type {
  NaverAgeDemographics,
  NaverBlogResultTotal,
  NaverGenderDemographics,
  NaverMonthlySearchVolume,
  NaverProvider,
  NaverRelativeTrend,
} from "@/server/providers/naver/contracts";
import {
  collectNaverObservation,
  type NaverCollectionInput,
  NaverCollectorValidationError,
  type NaverObservationRecord,
} from "@/server/collectors/naver/collector";

const collectedAt = "2026-08-09T09:01:00.000Z";
const input: NaverCollectionInput = {
  workspaceId: "workspace-1",
  siteId: "site-1",
  trackedQueryId: "tracked-query-1",
  query: "검색엔진최적화",
  observedAt: "2026-08-09T09:00:00.000Z",
  range: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    timeUnit: "date",
  },
  callBudget: { maxCalls: 16 },
};

function successfulProvider(overrides: Partial<NaverProvider> = {}): NaverProvider {
  const monthly: NaverMonthlySearchVolume = {
    pc: { relation: "lt", min: 0, maxExclusive: 10, display: "<10" },
    mobile: { relation: "exact", value: 120, min: 120, maxExclusive: 121, display: "120" },
    source: "naver-search-ads-relkwdstat",
    collectedAt,
  };
  const trend: NaverRelativeTrend = {
    points: [{ period: "2026-07-01", ratio: 50 }],
    source: "naver-datalab-search",
    collectedAt,
  };
  const gender: NaverGenderDemographics = {
    segments: [
      { gender: "m", points: [{ period: "2026-07-01", ratio: 45 }] },
      { gender: "f", points: [{ period: "2026-07-01", ratio: 55 }] },
    ],
    source: "naver-datalab-search",
    collectedAt,
  };
  const age: NaverAgeDemographics = {
    segments: [{ age: "4", points: [{ period: "2026-07-01", ratio: 100 }] }],
    source: "naver-datalab-search",
    collectedAt,
  };
  const blog: NaverBlogResultTotal = {
    total: 987654,
    source: "naver-search-blog",
    collectedAt,
  };
  return {
    getMonthlySearchVolume: async () => monthly,
    getRelativeTrend: async () => trend,
    getGenderDemographics: async () => gender,
    getAgeDemographics: async () => age,
    getBlogResultTotal: async () => blog,
    ...overrides,
  };
}

test("모든 source의 provenance와 qualifier를 보존해 안정 키로 idempotent upsert한다", async () => {
  const records = new Map<string, NaverObservationRecord>();
  const store = {
    upsert: async (record: NaverObservationRecord) => {
      records.set(record.observationKey, record);
    },
  };

  const first = await collectNaverObservation(input, {
    provider: successfulProvider(),
    store,
    now: () => new Date("2026-08-09T09:02:00.000Z"),
  });
  const second = await collectNaverObservation(
    {
      ...input,
      query: "재시도에서 변경된 표현",
      range: { startDate: "2026-06-01", endDate: "2026-06-30", timeUnit: "month" },
    },
    { provider: successfulProvider(), store, now: () => new Date("2026-08-09T09:03:00.000Z") },
  );

  assert.equal(first.status, "succeeded");
  assert.equal(first.callsUsed, 16);
  assert.equal(
    first.observationKey,
    second.observationKey,
    "DB unique(workspace_id, tracked_query_id, observed_at)와 같은 멱등 경계를 사용해야 한다",
  );
  assert.match(first.observationKey, /^naver:v1:[a-f0-9]{64}$/);
  assert.equal(records.size, 1);
  assert.equal(first.sources.search_ads_monthly_volume.status, "succeeded");
  assert.equal(first.sources.search_ads_monthly_volume.value?.pc?.relation, "lt");
  assert.deepEqual(first.sources.search_ads_monthly_volume.provenance, {
    source: "naver-search-ads-relkwdstat",
    collectedAt,
  });
  assert.equal(first.sources.datalab_gender.status, "succeeded");
  assert.equal(first.sources.datalab_age.status, "succeeded");
  assert.equal(first.sources.search_api_blog_total.value?.total, 987654);
});

test("call budget을 넘는 source는 provider를 호출하지 않고 나머지는 계속 수집한다", async () => {
  const calls: string[] = [];
  const base = successfulProvider();
  const provider = successfulProvider({
    getMonthlySearchVolume: async (value) => {
      calls.push("monthly");
      return base.getMonthlySearchVolume(value);
    },
    getRelativeTrend: async (value) => {
      calls.push("trend");
      return base.getRelativeTrend(value);
    },
    getGenderDemographics: async (value) => {
      calls.push("gender");
      return base.getGenderDemographics(value);
    },
    getAgeDemographics: async (value) => {
      calls.push("age");
      return base.getAgeDemographics(value);
    },
    getBlogResultTotal: async (value) => {
      calls.push("blog");
      return base.getBlogResultTotal(value);
    },
  });

  const result = await collectNaverObservation(
    { ...input, callBudget: { maxCalls: 3 } },
    { provider, store: { upsert: async () => undefined } },
  );

  assert.deepEqual(calls, ["monthly", "trend", "blog"]);
  assert.equal(result.callsUsed, 3);
  assert.equal(result.status, "partial");
  assert.deepEqual(
    {
      gender: result.sources.datalab_gender,
      age: result.sources.datalab_age,
    },
    {
      gender: {
        status: "unavailable",
        value: null,
        providerCallId: null,
        provenance: null,
        errorCode: "NAVER_CALL_BUDGET_EXCEEDED",
      },
      age: {
        status: "unavailable",
        value: null,
        providerCallId: null,
        provenance: null,
        errorCode: "NAVER_CALL_BUDGET_EXCEEDED",
      },
    },
  );
});

test("429는 retryable이며 source 하나의 실패가 다른 source 수집과 upsert를 막지 않는다", async () => {
  const secretError = new Error("leak-me user@example.com");
  let saved: NaverObservationRecord | null = null;
  const result = await collectNaverObservation(input, {
    provider: successfulProvider({
      getMonthlySearchVolume: async () => {
        throw new NaverSearchAdsRateLimitError();
      },
      getGenderDemographics: async () => {
        throw secretError;
      },
    }),
    store: { upsert: async (record) => { saved = record; } },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.sources.search_ads_monthly_volume.status, "retryable");
  assert.equal(result.sources.search_ads_monthly_volume.errorCode, "NAVER_RATE_LIMITED");
  assert.equal(result.sources.datalab_gender.status, "failed");
  assert.equal(result.sources.datalab_gender.errorCode, "NAVER_PROVIDER_FAILED");
  assert.equal(result.sources.datalab_trend.status, "succeeded");
  assert.equal(result.sources.datalab_age.status, "succeeded");
  assert.equal(result.sources.search_api_blog_total.status, "succeeded");
  assert.equal(saved, result);
  assert.equal(JSON.stringify(result).includes("user@example.com"), false);
});

test("source reservation의 providerCallId를 저장 계약까지 전달한다", async () => {
  const result = await collectNaverObservation(
    {
      ...input,
      sourcePlans: {
        search_ads_monthly_volume: {
          disposition: "execute",
          providerCallId: "provider-call-monthly",
        },
      },
    },
    { provider: successfulProvider(), store: { upsert: async () => undefined } },
  );

  assert.equal(
    result.sources.search_ads_monthly_volume.providerCallId,
    "provider-call-monthly",
  );
  assert.equal(result.sources.datalab_trend.providerCallId, null);
});

test("직접 collector 호출도 비정상 달력 날짜와 비정규 timestamp를 provider 전에 거부한다", async () => {
  let touched = false;
  const dependencies = {
    provider: successfulProvider({
      getMonthlySearchVolume: async () => {
        touched = true;
        return successfulProvider().getMonthlySearchVolume({ query: "SEO" });
      },
    }),
    store: { upsert: async () => { touched = true; } },
  };

  await assert.rejects(
    collectNaverObservation(
      { ...input, range: { ...input.range, startDate: "2026-02-30" } },
      dependencies,
    ),
    (error: unknown) =>
      error instanceof NaverCollectorValidationError &&
      error.message === "NAVER_RANGE_INVALID",
  );
  await assert.rejects(
    collectNaverObservation({ ...input, observedAt: "2026-08-09" }, dependencies),
    (error: unknown) =>
      error instanceof NaverCollectorValidationError &&
      error.message === "NAVER_OBSERVED_AT_INVALID",
  );
  assert.equal(touched, false);
});
