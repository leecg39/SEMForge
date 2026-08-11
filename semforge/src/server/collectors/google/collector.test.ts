// @TASK P3-C1-T1 - Google rank/AIO collector job handler contract
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/collectors/google/collector.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  JobExecutionContext,
  ProviderCallFailure,
  ProviderCallRequest,
  ProviderCallSuccess,
} from "@/server/jobs/contracts";
import {
  createGoogleCollectionJobHandler,
  type GoogleCollectionPayload,
  type GoogleObservationBatch,
} from "@/server/collectors/google/collector";
import type { TalordataGoogleSearchResult } from "@/server/providers/talordata/provider";
import { TalordataProviderFailure } from "@/server/providers/talordata/provider";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const observedAt = "2026-08-09T09:00:00.000Z";

function providerResult(overrides: Partial<TalordataGoogleSearchResult> = {}): TalordataGoogleSearchResult {
  return {
    query: "ai seo",
    organic: [
      {
        position: 1,
        title: "Competitor",
        link: "https://competitor.example/result",
        domain: "competitor.example",
        displayLink: null,
        description: null,
      },
      {
        position: 37,
        title: "Target subdomain",
        link: "https://reports.example.com/weekly",
        domain: "reports.example.com",
        displayLink: null,
        description: null,
      },
      {
        position: 100,
        title: "Target root",
        link: "https://example.com/archive",
        domain: "example.com",
        displayLink: null,
        description: null,
      },
    ],
    aiOverview: {
      present: true,
      presenceAvailable: true,
      citationsAvailable: true,
      citations: [
        {
          url: "https://insights.example.com/aio",
          domain: "insights.example.com",
          title: "Target citation",
        },
        {
          url: "https://independent.example/source",
          domain: "independent.example",
          title: "Independent citation",
        },
      ],
    },
    providerRequestId: "task-google-1",
    collectedAt: "2026-08-09T09:00:03.000Z",
    provenance: {
      source: "talordata",
      engine: "google",
      country: "kr",
      language: "ko",
      device: "desktop",
      window: 100,
    },
    ...overrides,
  };
}

function payloadFor(
  queries: GoogleCollectionPayload["queries"],
  limits: { maxProviderCalls?: number; maxBillableUnits?: number } = {},
): GoogleCollectionPayload {
  return {
    siteId,
    siteDomain: "example.com",
    observedAt,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    reservationExpiresAt: "2026-08-09T10:00:00.000Z",
    maxProviderCalls: limits.maxProviderCalls ?? 40,
    maxBillableUnits: limits.maxBillableUnits ?? 80,
    queries,
  };
}

function contextWith(
  providerCalls: JobExecutionContext["providerCalls"],
): JobExecutionContext {
  return {
    workspaceId,
    jobId: "job-google-test",
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "worker-test",
      token: "00000000-0000-4000-8000-000000000008",
      generation: 1,
      expiresAt: new Date("2026-08-09T09:05:00.000Z"),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-08-09T09:00:00.000Z"),
    audit: async () => undefined,
    providerCalls,
  };
}

function jobWith(payload: GoogleCollectionPayload, idempotencyKey = "weekly:test") {
  return {
    id: "job-google-test",
    workspaceId,
    type: "collect.google",
    idempotencyKey,
    attempt: 1,
    maxAttempts: 5,
    payload,
  };
}

test("rank와 AIO의 동일 normalized query를 1회 호출하고 최고 순위와 인용을 저장한다", async () => {
  const searches: { query: string; includeAiOverview: boolean }[] = [];
  let seenSignal: AbortSignal | undefined;
  const reservations: ProviderCallRequest[] = [];
  const successes: ProviderCallSuccess[] = [];
  const failures: ProviderCallFailure[] = [];
  const batches: GoogleObservationBatch[] = [];
  const handler = createGoogleCollectionJobHandler({
    provider: {
      async search(input) {
        searches.push({
          query: input.query,
          includeAiOverview: input.includeAiOverview,
        });
        seenSignal = input.signal;
        return providerResult({ query: input.query });
      },
    },
    observations: {
      async upsert(batch) {
        batches.push(batch);
      },
    },
  });
  const context: JobExecutionContext = {
    workspaceId,
    jobId: "job-google-1",
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "worker-1",
      token: "00000000-0000-4000-8000-000000000003",
      generation: 1,
      expiresAt: new Date("2026-08-09T09:05:00.000Z"),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-08-09T09:00:00.000Z"),
    audit: async () => undefined,
    providerCalls: {
      async reserve(request) {
        reservations.push(request);
        return {
          disposition: "execute",
          providerCallId: "00000000-0000-4000-8000-000000000004",
          usageReservationId: "00000000-0000-4000-8000-000000000005",
          responseMetadata: null,
        };
      },
      async succeed(success) {
        successes.push(success);
      },
      async fail(failure) {
        failures.push(failure);
      },
    },
  };

  const result = await handler(
    {
      id: "job-google-1",
      workspaceId,
      type: "collect.google",
      idempotencyKey: "weekly:2026-08-09:site-1",
      attempt: 1,
      maxAttempts: 5,
      payload: {
        siteId,
        siteDomain: "example.com",
        observedAt,
        periodStart: "2026-08-01T00:00:00.000Z",
        periodEnd: "2026-09-01T00:00:00.000Z",
        reservationExpiresAt: "2026-08-09T10:00:00.000Z",
        maxProviderCalls: 1,
        maxBillableUnits: 2,
        queries: [
          {
            workspaceId,
            siteId,
            trackedQueryId: "00000000-0000-4000-8000-000000000006",
            type: "rank",
            query: "  ＡＩ   SEO  ",
          },
          {
            workspaceId,
            siteId,
            trackedQueryId: "00000000-0000-4000-8000-000000000007",
            type: "aio",
            query: "ai seo",
          },
        ],
      },
    },
    context,
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(searches, [{ query: "ai seo", includeAiOverview: true }]);
  assert.equal(seenSignal, context.signal);
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0]?.units, 2);
  assert.equal(reservations[0]?.provider, "talordata");
  assert.equal(reservations[0]?.resource, "google_serp_response");
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 0);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0]?.rankObservations, [
    {
      trackedQueryId: "00000000-0000-4000-8000-000000000006",
      position: 37,
      outsideTop100: false,
      resultUrl: "https://reports.example.com/weekly",
      resultTitle: "Target subdomain",
    },
  ]);
  assert.equal(batches[0]?.aioObservations[0]?.presence, "present");
  assert.deepEqual(
    batches[0]?.aioObservations[0]?.citations.map((citation) => citation.url),
    ["https://insights.example.com/aio", "https://independent.example/source"],
  );
  assert.equal(batches[0]?.providerCallId, "00000000-0000-4000-8000-000000000004");
  assert.equal(batches[0]?.collectedAt, "2026-08-09T09:00:03.000Z");
});

test("등록 도메인과 하위 도메인이 top100에 없으면 >100을 null과 명시 플래그로 보존한다", async () => {
  const searches: { query: string; includeAiOverview: boolean }[] = [];
  const reservations: ProviderCallRequest[] = [];
  const batches: GoogleObservationBatch[] = [];
  const handler = createGoogleCollectionJobHandler({
    provider: {
      async search(input) {
        searches.push({
          query: input.query,
          includeAiOverview: input.includeAiOverview,
        });
        return providerResult({
          query: input.query,
          organic: [
            {
              position: 100,
              title: "Other result",
              link: "https://other.example/result",
              domain: "other.example",
              displayLink: null,
              description: null,
            },
          ],
          aiOverview: {
            present: false,
            presenceAvailable: false,
            citationsAvailable: false,
            citations: [],
          },
        });
      },
    },
    observations: { async upsert(batch) { batches.push(batch); } },
  });
  const context = contextWith({
    async reserve(request) {
      reservations.push(request);
      return {
        disposition: "execute",
        providerCallId: "00000000-0000-4000-8000-000000000009",
        usageReservationId: "00000000-0000-4000-8000-000000000010",
        responseMetadata: null,
      };
    },
    async succeed() {},
    async fail() {},
  });

  const result = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId,
          siteId,
          trackedQueryId: "00000000-0000-4000-8000-000000000011",
          type: "rank",
          query: "미노출 키워드",
        },
      ]),
    ),
    context,
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(searches, [{ query: "미노출 키워드", includeAiOverview: false }]);
  assert.equal(reservations[0]?.units, 1);
  assert.deepEqual(batches[0]?.rankObservations, [
    {
      trackedQueryId: "00000000-0000-4000-8000-000000000011",
      position: null,
      outsideTop100: true,
      resultUrl: null,
      resultTitle: null,
    },
  ]);
});

test("AIO 증거 미제공은 unknown, 명시적 미출현과 검증 인용 미일치는 absent로 저장한다", async () => {
  const batches: GoogleObservationBatch[] = [];
  let callIndex = 0;
  const states: TalordataGoogleSearchResult["aiOverview"][] = [
    {
      present: false,
      presenceAvailable: false,
      citationsAvailable: false,
      citations: [],
    },
    {
      present: false,
      presenceAvailable: true,
      citationsAvailable: false,
      citations: [],
    },
    {
      present: true,
      presenceAvailable: true,
      citationsAvailable: false,
      citations: [],
    },
    {
      present: true,
      presenceAvailable: true,
      citationsAvailable: true,
      citations: [
        {
          url: "https://independent.example/source",
          domain: "independent.example",
          title: "Independent",
        },
      ],
    },
  ];
  const handler = createGoogleCollectionJobHandler({
    provider: {
      async search(input) {
        const aiOverview = states[callIndex++];
        assert.ok(aiOverview);
        return providerResult({ query: input.query, aiOverview });
      },
    },
    observations: { async upsert(batch) { batches.push(batch); } },
  });
  let reservationIndex = 0;
  const context = contextWith({
    async reserve() {
      reservationIndex += 1;
      return {
        disposition: "execute",
        providerCallId: `00000000-0000-4000-8000-${String(20 + reservationIndex).padStart(12, "0")}`,
        usageReservationId: `00000000-0000-4000-8000-${String(30 + reservationIndex).padStart(12, "0")}`,
        responseMetadata: null,
      };
    },
    async succeed() {},
    async fail() {},
  });
  const queries = ["missing", "explicit absent", "citations unavailable", "not cited"].map(
    (query, index) => ({
      workspaceId,
      siteId,
      trackedQueryId: `00000000-0000-4000-8000-${String(40 + index).padStart(12, "0")}`,
      type: "aio" as const,
      query,
    }),
  );

  const result = await handler(jobWith(payloadFor(queries)), context);

  assert.equal(result.status, "succeeded");
  assert.deepEqual(
    batches.flatMap((batch) => batch.aioObservations.map((observation) => observation.presence)),
    ["unknown", "absent", "unknown", "absent"],
  );
});

test("완료된 provider call replay는 외부 호출 없이 저장을 복구한다", async () => {
  let searches = 0;
  const batches: GoogleObservationBatch[] = [];
  const replayedResult = providerResult({ query: "replay keyword" });
  const handler = createGoogleCollectionJobHandler({
    provider: {
      async search() {
        searches += 1;
        return replayedResult;
      },
    },
    observations: { async upsert(batch) { batches.push(batch); } },
  });
  const context = contextWith({
    async reserve() {
      return {
        disposition: "replay",
        providerCallId: "00000000-0000-4000-8000-000000000051",
        usageReservationId: "00000000-0000-4000-8000-000000000052",
        responseMetadata: {
          schema: "semforge.talordata.google.v1",
          result: replayedResult,
        },
      };
    },
    async succeed() {
      assert.fail("replay는 succeed를 다시 호출하지 않아야 한다");
    },
    async fail() {
      assert.fail("replay는 fail을 호출하지 않아야 한다");
    },
  });

  const result = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId,
          siteId,
          trackedQueryId: "00000000-0000-4000-8000-000000000053",
          type: "rank",
          query: "replay keyword",
        },
      ]),
    ),
    context,
  );

  assert.equal(result.status, "succeeded");
  assert.equal(searches, 0);
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.providerCallId, "00000000-0000-4000-8000-000000000051");
});

test("in_doubt provider call은 중복 외부 호출 없이 retryable로 보류한다", async () => {
  let searches = 0;
  let writes = 0;
  const handler = createGoogleCollectionJobHandler({
    provider: { async search() { searches += 1; return providerResult(); } },
    observations: { async upsert() { writes += 1; } },
  });
  const context = contextWith({
    async reserve() {
      return {
        disposition: "in_doubt",
        providerCallId: "00000000-0000-4000-8000-000000000061",
        usageReservationId: "00000000-0000-4000-8000-000000000062",
        responseMetadata: null,
      };
    },
    async succeed() {},
    async fail() {},
  });
  const result = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId,
          siteId,
          trackedQueryId: "00000000-0000-4000-8000-000000000063",
          type: "rank",
          query: "in doubt",
        },
      ]),
    ),
    context,
  );

  assert.equal(result.status, "retryable");
  assert.equal(searches, 0);
  assert.equal(writes, 0);
});

test("요청 단위 provider call/billable unit 상한을 예약 전에 차단한다", async () => {
  let reservations = 0;
  const handler = createGoogleCollectionJobHandler({
    provider: { async search() { return providerResult(); } },
    observations: { async upsert() {} },
  });
  const context = contextWith({
    async reserve() {
      reservations += 1;
      throw new Error("reserve should not run");
    },
    async succeed() {},
    async fail() {},
  });
  const result = await handler(
    jobWith(
      payloadFor(
        [
          {
            workspaceId,
            siteId,
            trackedQueryId: "00000000-0000-4000-8000-000000000071",
            type: "aio",
            query: "first aio",
          },
          {
            workspaceId,
            siteId,
            trackedQueryId: "00000000-0000-4000-8000-000000000072",
            type: "aio",
            query: "second aio",
          },
        ],
        { maxProviderCalls: 2, maxBillableUnits: 3 },
      ),
    ),
    context,
  );

  assert.equal(result.status, "dead");
  assert.equal(reservations, 0);
});

test("workspace/site/query 복합 경계가 어긋나면 provider 예약 전에 차단한다", async () => {
  let reservations = 0;
  const handler = createGoogleCollectionJobHandler({
    provider: { async search() { return providerResult(); } },
    observations: { async upsert() {} },
  });
  const context = contextWith({
    async reserve() {
      reservations += 1;
      throw new Error("reserve should not run");
    },
    async succeed() {},
    async fail() {},
  });
  const result = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId: "00000000-0000-4000-8000-000000000099",
          siteId,
          trackedQueryId: "00000000-0000-4000-8000-000000000081",
          type: "rank",
          query: "cross tenant",
        },
      ]),
    ),
    context,
  );

  assert.equal(result.status, "dead");
  assert.equal(reservations, 0);
});

test("경로가 섞인 비정규 site domain은 provider 예약 전에 거부한다", async () => {
  let reservations = 0;
  const handler = createGoogleCollectionJobHandler({
    provider: { async search() { return providerResult(); } },
    observations: { async upsert() {} },
  });
  const context = contextWith({
    async reserve() {
      reservations += 1;
      throw new Error("reserve should not run");
    },
    async succeed() {},
    async fail() {},
  });
  const payload = payloadFor([
    {
      workspaceId,
      siteId,
      trackedQueryId: "00000000-0000-4000-8000-000000000089",
      type: "rank",
      query: "invalid site domain",
    },
  ]);

  const result = await handler(
    jobWith({ ...payload, siteDomain: "example.com/path" }),
    context,
  );

  assert.equal(result.status, "dead");
  assert.equal(reservations, 0);
});

test("TalorData rate limit은 provider call을 실패 처리하고 worker retryable로 반환한다", async () => {
  const failures: ProviderCallFailure[] = [];
  let writes = 0;
  const handler = createGoogleCollectionJobHandler({
    provider: {
      async search() {
        throw new TalordataProviderFailure("retryable", "rate_limit", "Too Many Requests");
      },
    },
    observations: { async upsert() { writes += 1; } },
  });
  const context = contextWith({
    async reserve() {
      return {
        disposition: "execute",
        providerCallId: "00000000-0000-4000-8000-000000000091",
        usageReservationId: "00000000-0000-4000-8000-000000000092",
        responseMetadata: null,
      };
    },
    async succeed() {},
    async fail(failure) { failures.push(failure); },
  });
  const result = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId,
          siteId,
          trackedQueryId: "00000000-0000-4000-8000-000000000093",
          type: "rank",
          query: "rate limited",
        },
      ]),
    ),
    context,
  );

  assert.equal(result.status, "retryable");
  assert.equal(failures[0]?.errorCode, "rate_limit");
  assert.equal(writes, 0);
});

test("빈 normalized query와 중복 trackedQueryId를 provider 예약 전에 거부한다", async () => {
  let reservations = 0;
  const handler = createGoogleCollectionJobHandler({
    provider: { async search() { return providerResult(); } },
    observations: { async upsert() {} },
  });
  const context = contextWith({
    async reserve() {
      reservations += 1;
      return {
        disposition: "execute",
        providerCallId: "00000000-0000-4000-8000-000000000101",
        usageReservationId: "00000000-0000-4000-8000-000000000102",
        responseMetadata: null,
      };
    },
    async succeed() {},
    async fail() {},
  });
  const duplicateId = "00000000-0000-4000-8000-000000000103";
  const emptyResult = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId,
          siteId,
          trackedQueryId: "00000000-0000-4000-8000-000000000104",
          type: "rank",
          query: "   　   ",
        },
      ]),
      "weekly:empty",
    ),
    context,
  );
  const duplicateResult = await handler(
    jobWith(
      payloadFor([
        {
          workspaceId,
          siteId,
          trackedQueryId: duplicateId,
          type: "rank",
          query: "duplicate one",
        },
        {
          workspaceId,
          siteId,
          trackedQueryId: duplicateId,
          type: "aio",
          query: "duplicate two",
        },
      ]),
      "weekly:duplicate",
    ),
    context,
  );

  assert.equal(emptyResult.status, "dead");
  assert.equal(duplicateResult.status, "dead");
  assert.equal(reservations, 0);
});

test("등록 도메인이 www 하위 도메인이면 상위 apex 결과를 순위로 오인하지 않는다", async () => {
  const batches: GoogleObservationBatch[] = [];
  const handler = createGoogleCollectionJobHandler({
    provider: {
      async search(input) {
        return providerResult({
          query: input.query,
          organic: [
            {
              position: 1,
              title: "Apex",
              link: "https://example.com/apex",
              domain: "example.com",
              displayLink: null,
              description: null,
            },
            {
              position: 5,
              title: "Registered www",
              link: "https://www.example.com/page",
              domain: "example.com",
              displayLink: null,
              description: null,
            },
          ],
        });
      },
    },
    observations: { async upsert(batch) { batches.push(batch); } },
  });
  const context = contextWith({
    async reserve() {
      return {
        disposition: "execute",
        providerCallId: "00000000-0000-4000-8000-000000000111",
        usageReservationId: "00000000-0000-4000-8000-000000000112",
        responseMetadata: null,
      };
    },
    async succeed() {},
    async fail() {},
  });
  const payload = payloadFor([
    {
      workspaceId,
      siteId,
      trackedQueryId: "00000000-0000-4000-8000-000000000113",
      type: "rank",
      query: "www boundary",
    },
  ]);

  const result = await handler(
    jobWith({ ...payload, siteDomain: "www.example.com" }),
    context,
  );

  assert.equal(result.status, "succeeded");
  assert.equal(batches[0]?.rankObservations[0]?.position, 5);
});
