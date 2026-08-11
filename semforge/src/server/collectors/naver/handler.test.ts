// @TASK P3-C2-T1 - NAVER worker handler contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/naver/handler.ts
import assert from "node:assert/strict";
import test from "node:test";

import type {
  JobExecutionContext,
  JobHandlerInput,
  ProviderCallFailure,
  ProviderCallReservation,
  ProviderCallSuccess,
} from "@/server/jobs/contracts";
import { NaverSearchAdsRateLimitError } from "@/server/naver-search-ads/client";
import type { NaverProvider } from "@/server/providers/naver/contracts";
import type { NaverObservationRecord } from "@/server/collectors/naver/collector";
import {
  createNaverCollectionJobHandler,
  type NaverCollectionJobPayload,
} from "@/server/collectors/naver/handler";

const collectedAt = "2026-08-09T09:01:00.000Z";
const payload: NaverCollectionJobPayload = {
  workspaceId: "workspace-1",
  siteId: "site-1",
  trackedQueryId: "tracked-query-1",
  query: "검색엔진최적화",
  observedAt: "2026-08-09T09:00:00.000Z",
  range: { startDate: "2026-07-01", endDate: "2026-07-31", timeUnit: "date" },
  callBudget: { maxCalls: 16 },
};

function job(
  value: NaverCollectionJobPayload = payload,
  attempt = 1,
  maxAttempts = 3,
): JobHandlerInput<NaverCollectionJobPayload> {
  return {
    id: "job-1",
    workspaceId: "workspace-1",
    type: "collect.naver",
    payload: value,
    idempotencyKey: "weekly:naver:tracked-query-1:2026-08-09",
    attempt,
    maxAttempts,
  };
}

function provider(overrides: Partial<NaverProvider> = {}): NaverProvider {
  return {
    getMonthlySearchVolume: async () => ({
      pc: { relation: "lt", min: 0, maxExclusive: 10, display: "<10" },
      mobile: null,
      source: "naver-search-ads-relkwdstat",
      collectedAt,
    }),
    getRelativeTrend: async () => ({
      points: [{ period: "2026-07-01", ratio: 50 }],
      source: "naver-datalab-search",
      collectedAt,
    }),
    getGenderDemographics: async () => ({
      segments: [],
      source: "naver-datalab-search",
      collectedAt,
    }),
    getAgeDemographics: async () => ({
      segments: [],
      source: "naver-datalab-search",
      collectedAt,
    }),
    getBlogResultTotal: async () => ({
      total: 100,
      source: "naver-search-blog",
      collectedAt,
    }),
    ...overrides,
  };
}

function context(options: {
  workspaceId?: string;
  jobId?: string;
  attempt?: number;
  maxAttempts?: number;
  reserve?: JobExecutionContext["providerCalls"]["reserve"];
  succeeded?: ProviderCallSuccess[];
  failed?: ProviderCallFailure[];
  audits?: Array<{ action: string; metadata?: Readonly<Record<string, unknown>> }>;
} = {}): JobExecutionContext {
  return {
    workspaceId: options.workspaceId ?? "workspace-1",
    jobId: options.jobId ?? "job-1",
    attempt: options.attempt ?? 1,
    maxAttempts: options.maxAttempts ?? 3,
    lease: {
      owner: "worker-1",
      token: "lease-token",
      generation: 1,
      expiresAt: new Date("2026-08-09T09:05:00.000Z"),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-08-09T09:02:00.000Z"),
    audit: async (action, metadata) => {
      options.audits?.push(metadata ? { action, metadata } : { action });
    },
    providerCalls: {
      reserve: options.reserve ?? (async (request) => ({
        disposition: "execute",
        providerCallId: `call:${request.operation}`,
        usageReservationId: `usage:${request.operation}`,
        responseMetadata: null,
      })),
      succeed: async (result) => { options.succeeded?.push(result); },
      fail: async (result) => { options.failed?.push(result); },
    },
  };
}

test("payload와 context workspace가 다르면 provider/reservation/store 전에 dead 처리한다", async () => {
  let touched = false;
  const handler = createNaverCollectionJobHandler({
    provider: provider({ getMonthlySearchVolume: async () => { touched = true; throw new Error(); } }),
    store: { upsert: async () => { touched = true; } },
  });
  const result = await handler(job(), context({
    workspaceId: "other-workspace",
    reserve: async () => { touched = true; throw new Error(); },
  }));

  assert.deepEqual(result, { status: "dead", error: "NAVER_WORKSPACE_MISMATCH" });
  assert.equal(touched, false);
});

test("job ID와 attempt/maxAttempts가 lease context와 다르면 provider 전에 dead 처리한다", async () => {
  let touched = false;
  const handler = createNaverCollectionJobHandler({
    provider: provider(),
    store: { upsert: async () => { touched = true; } },
  });
  const reserve = async (): Promise<ProviderCallReservation> => {
    touched = true;
    throw new Error("must not reserve with mismatched job context");
  };

  for (const executionContext of [
    context({ jobId: "stale-job", reserve }),
    context({ attempt: 2, reserve }),
    context({ maxAttempts: 4, reserve }),
  ]) {
    assert.deepEqual(await handler(job(), executionContext), {
      status: "dead",
      error: "NAVER_JOB_CONTEXT_MISMATCH",
    });
  }
  assert.equal(touched, false);
});

test("잘못된 날짜/기간/budget/식별자는 reservation 전에 payload invalid로 종료한다", async () => {
  const invalidPayloads: NaverCollectionJobPayload[] = [
    { ...payload, query: "   " },
    { ...payload, siteId: "" },
    { ...payload, observedAt: "2026-08-09" },
    { ...payload, range: { ...payload.range, startDate: "2026-02-30" } },
    {
      ...payload,
      range: { ...payload.range, startDate: "2026-08-01", endDate: "2026-07-01" },
    },
    { ...payload, callBudget: { maxCalls: -1 } },
    { ...payload, callBudget: { maxCalls: 1.5 } },
  ];
  let touched = 0;
  const handler = createNaverCollectionJobHandler({
    provider: provider(),
    store: { upsert: async () => { touched += 1; } },
  });

  for (const invalid of invalidPayloads) {
    const result = await handler(job(invalid), context({
      reserve: async () => {
        touched += 1;
        throw new Error("must not reserve invalid payload");
      },
    }));
    assert.deepEqual(result, { status: "dead", error: "NAVER_JOB_PAYLOAD_INVALID" });
  }
  assert.equal(touched, 0);
});

test("source별 execute/replay 예약을 적용하고 실행한 call만 확정한다", async () => {
  const providerCalls: string[] = [];
  const succeeded: ProviderCallSuccess[] = [];
  const audits: Array<{ action: string; metadata?: Readonly<Record<string, unknown>> }> = [];
  const saved: NaverObservationRecord[] = [];
  const replayTrend = {
    points: [{ period: "2026-07-01", ratio: 77 }],
    source: "naver-datalab-search" as const,
    collectedAt,
  };
  const reserve = async ({ operation }: { operation: string }): Promise<ProviderCallReservation> => {
    if (operation === "datalab_trend") {
      return {
        disposition: "replay",
        providerCallId: "call:trend",
        usageReservationId: "usage:trend",
        responseMetadata: { value: replayTrend },
      };
    }
    return {
      disposition: "execute",
      providerCallId: `call:${operation}`,
      usageReservationId: `usage:${operation}`,
      responseMetadata: null,
    };
  };
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: async () => {
        providerCalls.push("monthly");
        return provider().getMonthlySearchVolume({ query: "SEO" });
      },
      getRelativeTrend: async () => {
        providerCalls.push("trend");
        return provider().getRelativeTrend({ query: "SEO", range: payload.range });
      },
      getGenderDemographics: async () => {
        providerCalls.push("gender");
        return provider().getGenderDemographics({ query: "SEO", range: payload.range });
      },
      getBlogResultTotal: async () => {
        providerCalls.push("blog");
        return provider().getBlogResultTotal({ query: "SEO" });
      },
    }),
    store: { upsert: async (record) => { saved.push(record); } },
  });

  const result = await handler(
    job({ ...payload, callBudget: { maxCalls: 4 } }),
    context({ reserve: reserve as JobExecutionContext["providerCalls"]["reserve"], succeeded, audits }),
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(providerCalls, ["monthly", "gender"]);
  assert.equal(saved[0]?.sources.datalab_trend.value?.points[0]?.ratio, 77);
  assert.equal(saved[0]?.sources.datalab_trend.providerCallId, "call:trend");
  assert.deepEqual(
    succeeded.map((entry) => entry.providerCallId),
    ["call:search_ads_monthly_volume", "call:datalab_gender"],
  );
  assert.ok(audits.some((entry) => entry.action === "naver.collection.completed"));
  const completed = audits.find((entry) => entry.action === "naver.collection.completed");
  assert.equal(completed?.metadata?.status, "partial");
  assert.deepEqual(completed?.metadata?.sources, [
    {
      source: "search_ads_monthly_volume",
      disposition: "executed",
      providerCallId: "call:search_ads_monthly_volume",
      collectedAt,
      status: "succeeded",
      errorCode: null,
    },
    {
      source: "datalab_trend",
      disposition: "replayed",
      providerCallId: "call:trend",
      collectedAt,
      status: "succeeded",
      errorCode: null,
    },
    {
      source: "datalab_gender",
      disposition: "executed",
      providerCallId: "call:datalab_gender",
      collectedAt,
      status: "succeeded",
      errorCode: null,
    },
    {
      source: "datalab_age",
      disposition: "skipped",
      providerCallId: null,
      collectedAt: "2026-08-09T09:02:00.000Z",
      status: "unavailable",
      errorCode: "NAVER_CALL_BUDGET_EXCEEDED",
    },
    {
      source: "search_api_blog_total",
      disposition: "skipped",
      providerCallId: null,
      collectedAt: "2026-08-09T09:02:00.000Z",
      status: "unavailable",
      errorCode: "NAVER_CALL_BUDGET_EXCEEDED",
    },
  ]);
});

test("in_doubt 예약은 provider를 재호출하지 않고 안정 retryable로 분류한다", async () => {
  let providerCalled = false;
  let reservations = 0;
  const audits: Array<{ action: string; metadata?: Readonly<Record<string, unknown>> }> = [];
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: async () => {
        providerCalled = true;
        return provider().getMonthlySearchVolume({ query: "SEO" });
      },
    }),
    store: { upsert: async () => { providerCalled = true; } },
  });
  const result = await handler(
    job({ ...payload, callBudget: { maxCalls: 16 } }),
    context({
      audits,
      reserve: async (request) => {
        reservations += 1;
        return {
        disposition: "in_doubt",
        providerCallId: `call:${request.operation}`,
        usageReservationId: `usage:${request.operation}`,
        responseMetadata: null,
        };
      },
    }),
  );

  assert.deepEqual(result, { status: "retryable", error: "NAVER_PROVIDER_CALL_IN_DOUBT" });
  assert.equal(providerCalled, false);
  assert.equal(reservations, 5);
  const inDoubt = audits.find((entry) => entry.action === "naver.collection.in_doubt");
  const sources = inDoubt?.metadata?.sources as Array<Record<string, unknown>>;
  assert.equal(sources.length, 5);
  assert.ok(sources.every((source) =>
    source.status === "in_doubt" &&
    source.errorCode === "NAVER_PROVIDER_CALL_IN_DOUBT" &&
    typeof source.providerCallId === "string"
  ));
});

test("provider 실행 뒤 observation 저장 실패는 모든 call을 outcome_in_doubt로 감사한다", async () => {
  let providerCalls = 0;
  const audits: Array<{ action: string; metadata?: Readonly<Record<string, unknown>> }> = [];
  const succeeded: ProviderCallSuccess[] = [];
  const failed: ProviderCallFailure[] = [];
  const base = provider();
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: async (input) => {
        providerCalls += 1;
        return base.getMonthlySearchVolume(input);
      },
      getRelativeTrend: async (input) => {
        providerCalls += 1;
        return base.getRelativeTrend(input);
      },
      getGenderDemographics: async (input) => {
        providerCalls += 1;
        return base.getGenderDemographics(input);
      },
      getAgeDemographics: async (input) => {
        providerCalls += 1;
        return base.getAgeDemographics(input);
      },
      getBlogResultTotal: async (input) => {
        providerCalls += 1;
        return base.getBlogResultTotal(input);
      },
    }),
    store: { upsert: async () => { throw new Error("storage unavailable"); } },
  });

  assert.deepEqual(
    await handler(job(), context({ audits, succeeded, failed })),
    { status: "retryable", error: "NAVER_COLLECTION_OUTCOME_IN_DOUBT" },
  );
  assert.equal(providerCalls, 5);
  assert.equal(succeeded.length, 0);
  assert.equal(failed.length, 0);
  const uncertain = audits.find(
    (entry) => entry.action === "naver.collection.outcome_in_doubt",
  );
  const sources = uncertain?.metadata?.sources as Array<Record<string, unknown>>;
  assert.equal(sources.length, 5);
  assert.ok(sources.every((source) =>
    source.disposition === "in_doubt" &&
    source.status === "in_doubt" &&
    source.errorCode === "NAVER_COLLECTION_OUTCOME_IN_DOUBT"
  ));
});

test("후속 reserve 예외 전 확보한 execute reservation은 미실행 코드로 정리한다", async () => {
  let providerOrStoreCalled = false;
  let reserveCount = 0;
  const failed: ProviderCallFailure[] = [];
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: async () => {
        providerOrStoreCalled = true;
        return provider().getMonthlySearchVolume({ query: "SEO" });
      },
    }),
    store: { upsert: async () => { providerOrStoreCalled = true; } },
  });
  const result = await handler(
    job({ ...payload, callBudget: { maxCalls: 2 } }),
    context({
      failed,
      reserve: async (request) => {
        reserveCount += 1;
        if (reserveCount === 2) throw new Error("reservation backend unavailable");
        return {
          disposition: "execute",
          providerCallId: `call:${request.operation}`,
          usageReservationId: `usage:${request.operation}`,
          responseMetadata: null,
        };
      },
    }),
  );

  assert.deepEqual(result, { status: "retryable", error: "NAVER_HANDLER_RETRYABLE" });
  assert.equal(providerOrStoreCalled, false);
  assert.deepEqual(failed.map((entry) => ({
    providerCallId: entry.providerCallId,
    errorCode: entry.errorCode,
  })), [{
    providerCallId: "call:search_ads_monthly_volume",
    errorCode: "NAVER_RESERVATION_NOT_EXECUTED",
  }]);
});

test("후속 in_doubt 전 확보한 execute reservation을 정리하되 불확실 call은 건드리지 않는다", async () => {
  let providerOrStoreCalled = false;
  let reserveCount = 0;
  const failed: ProviderCallFailure[] = [];
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: async () => {
        providerOrStoreCalled = true;
        return provider().getMonthlySearchVolume({ query: "SEO" });
      },
    }),
    store: { upsert: async () => { providerOrStoreCalled = true; } },
  });
  const result = await handler(
    job({ ...payload, callBudget: { maxCalls: 2 } }),
    context({
      failed,
      reserve: async (request) => {
        reserveCount += 1;
        return reserveCount === 1
          ? {
              disposition: "execute",
              providerCallId: `call:${request.operation}`,
              usageReservationId: `usage:${request.operation}`,
              responseMetadata: null,
            }
          : {
              disposition: "in_doubt",
              providerCallId: "call:uncertain-trend",
              usageReservationId: "usage:uncertain-trend",
              responseMetadata: null,
            };
      },
    }),
  );

  assert.deepEqual(result, { status: "retryable", error: "NAVER_PROVIDER_CALL_IN_DOUBT" });
  assert.equal(providerOrStoreCalled, false);
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.providerCallId, "call:search_ads_monthly_volume");
  assert.equal(failed[0]?.errorCode, "NAVER_RESERVATION_NOT_EXECUTED");
});

test("모든 source가 replay면 정규화 metadata만 복원하고 provider를 한 번도 호출하지 않는다", async () => {
  let providerCalls = 0;
  const saved: NaverObservationRecord[] = [];
  const replayValues: Record<string, unknown> = {
    search_ads_monthly_volume: {
      pc: null,
      mobile: null,
      source: "naver-search-ads-relkwdstat",
      collectedAt,
    },
    datalab_trend: {
      points: [],
      source: "naver-datalab-search",
      collectedAt,
    },
    datalab_gender: {
      segments: [],
      source: "naver-datalab-search",
      collectedAt,
    },
    datalab_age: {
      segments: [],
      source: "naver-datalab-search",
      collectedAt,
    },
    search_api_blog_total: {
      total: 100,
      source: "naver-search-blog",
      collectedAt,
    },
  };
  const neverCall = async (): Promise<never> => {
    providerCalls += 1;
    throw new Error("provider must not be called for replay");
  };
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: neverCall,
      getRelativeTrend: neverCall,
      getGenderDemographics: neverCall,
      getAgeDemographics: neverCall,
      getBlogResultTotal: neverCall,
    }),
    store: { upsert: async (record) => { saved.push(record); } },
  });
  const result = await handler(job(), context({
    reserve: async (request) => ({
      disposition: "replay",
      providerCallId: `call:${request.operation}`,
      usageReservationId: `usage:${request.operation}`,
      responseMetadata: { value: replayValues[request.operation] },
    }),
  }));

  assert.equal(result.status, "succeeded");
  assert.equal(providerCalls, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.callsUsed, 0);
  assert.equal(saved[0]?.sources.search_api_blog_total.value?.total, 100);
});

test("429 실행 실패는 coordinator.fail 후 재시도하고 최대 시도에서는 dead 처리한다", async () => {
  const failed: ProviderCallFailure[] = [];
  const handler = createNaverCollectionJobHandler({
    provider: provider({
      getMonthlySearchVolume: async () => { throw new NaverSearchAdsRateLimitError(); },
    }),
    store: { upsert: async () => undefined },
  });
  const retryable = await handler(
    job({ ...payload, callBudget: { maxCalls: 1 } }, 1, 3),
    context({ failed }),
  );
  const dead = await handler(
    job({ ...payload, callBudget: { maxCalls: 1 } }, 3, 3),
    context({ failed, attempt: 3 }),
  );

  assert.deepEqual(retryable, { status: "retryable", error: "NAVER_COLLECTION_RETRYABLE" });
  assert.deepEqual(dead, { status: "dead", error: "NAVER_COLLECTION_RETRY_EXHAUSTED" });
  assert.equal(failed[0]?.errorCode, "NAVER_RATE_LIMITED");
});
