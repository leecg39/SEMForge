// @TASK P3-C2-T1 - Weekly GSC aggregate/query/page collection
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/collector.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { createGscSearchAnalyticsClient } from "@/server/collectors/gsc/client";
import {
  type GscObservation,
  createGscWeeklyCollector,
} from "@/server/collectors/gsc/collector";

const workspaceId = "52000000-0000-4000-8000-000000000001";
const siteId = "52000000-0000-4000-8000-000000000101";
const bindingId = "52000000-0000-4000-8000-000000000201";
const connectionId = "52000000-0000-4000-8000-000000000301";
const providerCallIds = {
  aggregate: "52000000-0000-4000-8000-000000000401",
  topQueries: "52000000-0000-4000-8000-000000000402",
  topPages: "52000000-0000-4000-8000-000000000403",
} as const;
const collectedAt = new Date("2026-08-09T23:01:00.000Z");

async function fixture(name: string): Promise<string> {
  return readFile(
    path.join(process.cwd(), "src/server/collectors/gsc/fixtures", name),
    "utf8",
  );
}

async function fixtureClient(options: { failPages?: boolean } = {}) {
  const fixtures = {
    date: await fixture("search-analytics-dates.json"),
    query: await fixture("search-analytics-top-queries.json"),
    page: await fixture("search-analytics-top-pages.json"),
  };
  return createGscSearchAnalyticsClient({
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        dimensions: ["date" | "query" | "page"];
      };
      const dimension = request.dimensions[0];
      if (dimension === "page" && options.failPages) {
        return Response.json(
          { message: "provider raw secret must not escape" },
          { status: 429 },
        );
      }
      return new Response(fixtures[dimension], { status: 200 });
    },
  });
}

function memoryStore() {
  const values = new Map<string, GscObservation>();
  return {
    values,
    port: {
      async upsertMany(observations: readonly GscObservation[]) {
        for (const observation of observations) {
          values.set(observation.observationKey, observation);
        }
      },
    },
  };
}

function baseDependencies(
  store: ReturnType<typeof memoryStore>,
  searchAnalyticsClient: Awaited<ReturnType<typeof fixtureClient>>,
) {
  return {
    targetLoader: async () => ({
      workspaceId,
      siteId,
      bindingId,
      connectionId,
      propertyUri: "sc-domain:example.com",
    }),
    tokenBroker: {
      async getAccessToken() {
        return "access-token";
      },
    },
    searchAnalyticsClient,
    observationStore: store.port,
    now: () => collectedAt,
  };
}

test("collector는 14일 date aggregate와 current top query/page를 수집하고 stable key로 멱등 upsert한다", async () => {
  const store = memoryStore();
  const collector = createGscWeeklyCollector(
    baseDependencies(store, await fixtureClient()),
  );
  const input = {
    workspaceId,
    siteId,
    bindingId,
    executedAt: new Date("2026-08-09T23:00:00.000Z"),
    providerCallIds,
  };

  const first = await collector.collect(input);
  const firstKeys = first.observations.map((observation) => observation.observationKey);
  const second = await collector.collect(input);

  assert.equal(first.status, "succeeded");
  assert.deepEqual(first.windows, {
    current: { startDate: "2026-07-31", endDate: "2026-08-06" },
    comparison: { startDate: "2026-07-24", endDate: "2026-07-30" },
  });
  assert.equal(first.observations.length, 6);
  assert.equal(store.values.size, 6);
  assert.deepEqual(
    second.observations.map((observation) => observation.observationKey),
    firstKeys,
  );
  assert.equal(new Set(firstKeys).size, 6);
  assert.ok(first.observations.every((observation) => /^[a-f0-9]{64}$/u.test(observation.dimensionHash)));
  assert.ok(first.observations.every((observation) => observation.collectedAt === collectedAt.toISOString()));

  const aggregate = first.observations.find(
    (observation) => observation.dimensions.date === "2026-07-30",
  );
  assert.equal(aggregate?.dataDate, "2026-07-30");
  assert.equal(aggregate?.providerCallId, providerCallIds.aggregate);
  const query = first.observations.find(
    (observation) => observation.dimensions.query === "semforge",
  );
  assert.equal(query?.dataDate, "2026-08-06");
  assert.equal(query?.providerCallId, providerCallIds.topQueries);
  const page = first.observations.find(
    (observation) => observation.dimensions.page === "https://example.com/",
  );
  assert.equal(page?.providerCallId, providerCallIds.topPages);
  assert.deepEqual(
    first.providerCalls.map(({ operation, providerCallId, status }) => ({
      operation,
      providerCallId,
      status,
    })),
    [
      { operation: "aggregate", providerCallId: providerCallIds.aggregate, status: "succeeded" },
      { operation: "top_queries", providerCallId: providerCallIds.topQueries, status: "succeeded" },
      { operation: "top_pages", providerCallId: providerCallIds.topPages, status: "succeeded" },
    ],
  );
});

test("collector는 한 provider 호출 실패 시 성공 행만 저장하고 원문 없는 partial provenance를 반환한다", async () => {
  const store = memoryStore();
  const collector = createGscWeeklyCollector(
    baseDependencies(store, await fixtureClient({ failPages: true })),
  );

  const result = await collector.collect({
    workspaceId,
    siteId,
    bindingId,
    executedAt: new Date("2026-08-09T23:00:00.000Z"),
    providerCallIds,
  });

  assert.equal(result.status, "partial");
  assert.equal(store.values.size, 4);
  const failed = result.providerCalls.find((call) => call.operation === "top_pages");
  assert.deepEqual(failed, {
    provider: "google-search-console",
    operation: "top_pages",
    providerCallId: providerCallIds.topPages,
    collectedAt: collectedAt.toISOString(),
    status: "retryable",
    errorCode: "RATE_LIMITED",
  });
  assert.doesNotMatch(JSON.stringify(result.providerCalls), /provider raw|access-token/u);
});
