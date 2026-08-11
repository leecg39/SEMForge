// @TASK P3-C2-T1 - GSC worker handler seam
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/collectors/gsc/handler.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretCrypto } from "@/lib/crypto";
import { createGscSearchAnalyticsClient } from "@/server/collectors/gsc/client";
import {
  createGscWeeklyCollector,
  type GscWeeklyCollectionInput,
  type GscWeeklyCollectionResult,
  type GscWeeklyCollector,
} from "@/server/collectors/gsc/collector";
import { createPostgresGscObservationStore } from "@/server/collectors/gsc/observation-store";
import { GscCollectorAccessError } from "@/server/collectors/gsc/target";
import { loadGscCollectionTarget } from "@/server/collectors/gsc/target";
import { createGscTokenBroker } from "@/server/collectors/gsc/token-broker";
import {
  GSC_WEEKLY_COLLECTION_JOB,
  createGscCollectionJobHandler,
  createDedicatedGscCollectionJobHandler,
} from "@/server/collectors/gsc/handler";
import { GSC_SCOPE } from "@/server/gsc/oauth";
import type {
  JobExecutionContext,
  ProviderCallRequest,
  ProviderCallSuccess,
  ProviderCallFailure,
} from "@/server/jobs/contracts";

const workspaceId = "54000000-0000-4000-8000-000000000001";
const siteId = "54000000-0000-4000-8000-000000000101";
const bindingId = "54000000-0000-4000-8000-000000000201";
const operations = ["aggregate", "top_queries", "top_pages"] as const;
const providerCallIdByOperation = {
  aggregate: "54000000-0000-4000-8000-000000000301",
  top_queries: "54000000-0000-4000-8000-000000000302",
  top_pages: "54000000-0000-4000-8000-000000000303",
} as const;

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "54000000-0000-4000-8000-000000000401",
    workspaceId,
    type: GSC_WEEKLY_COLLECTION_JOB,
    payload: {
      siteId,
      bindingId,
      executedAt: "2026-08-09T23:00:00.000Z",
    },
    idempotencyKey: "weekly:gsc:2026-08-10",
    attempt: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

function successfulResult(input: GscWeeklyCollectionInput): GscWeeklyCollectionResult {
  const selected = input.operations ?? operations;
  return {
    status: "succeeded",
    windows: {
      current: { startDate: "2026-07-31", endDate: "2026-08-06" },
      comparison: { startDate: "2026-07-24", endDate: "2026-07-30" },
    },
    observations: [],
    providerCalls: selected.map((operation) => ({
      provider: "google-search-console" as const,
      operation,
      providerCallId:
        operation === "aggregate"
          ? input.providerCallIds.aggregate
          : operation === "top_queries"
            ? input.providerCallIds.topQueries
            : input.providerCallIds.topPages,
      collectedAt: "2026-08-09T23:01:00.000Z",
      status: "succeeded" as const,
    })),
  };
}

function context(options: {
  disposition?: Partial<Record<(typeof operations)[number], "execute" | "replay" | "in_doubt">>;
  collected?: GscWeeklyCollectionInput[];
}) {
  const requests: ProviderCallRequest[] = [];
  const successes: ProviderCallSuccess[] = [];
  const failures: ProviderCallFailure[] = [];
  const audits: Array<{ action: string; metadata?: Readonly<Record<string, unknown>> }> = [];
  const executionContext: JobExecutionContext = {
    workspaceId,
    jobId: "54000000-0000-4000-8000-000000000401",
    attempt: 1,
    maxAttempts: 5,
    lease: {
      owner: "worker-gsc",
      token: "54000000-0000-4000-8000-000000000501",
      generation: 1,
      expiresAt: new Date("2026-08-09T23:10:00.000Z"),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-08-09T23:00:00.000Z"),
    audit: async (action, metadata) => {
      audits.push(metadata ? { action, metadata } : { action });
    },
    providerCalls: {
      reserve: async (request) => {
        requests.push(request);
        const operation = request.operation.replace("search_analytics.", "") as (typeof operations)[number];
        const disposition = options.disposition?.[operation] ?? "execute";
        return {
          disposition,
          providerCallId: providerCallIdByOperation[operation],
          usageReservationId: `usage-${operation}`,
          responseMetadata: disposition === "replay"
            ? {
                operation,
                collectedAt: "2026-08-09T22:59:00.000Z",
              }
            : null,
        };
      },
      succeed: async (result) => {
        successes.push(result);
      },
      fail: async (result) => {
        failures.push(result);
      },
    },
  };
  return { executionContext, requests, successes, failures, audits };
}

test("handler는 세 provider call을 안정 키로 예약하고 providerCallId를 collector·success에 연결한다", async () => {
  const collected: GscWeeklyCollectionInput[] = [];
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      collected.push(input);
      return successfulResult(input);
    },
  };
  const state = context({ collected });
  const handler = createGscCollectionJobHandler({ collector });

  const result = await handler(job(), state.executionContext);

  assert.equal(result.status, "succeeded");
  assert.equal(state.requests.length, 3);
  assert.deepEqual(
    state.requests.map((request) => request.operation),
    operations.map((operation) => `search_analytics.${operation}`),
  );
  assert.ok(state.requests.every((request) => /^sha256:[a-f0-9]{64}$/u.test(request.requestHash)));
  assert.deepEqual(collected[0]?.providerCallIds, {
    aggregate: providerCallIdByOperation.aggregate,
    topQueries: providerCallIdByOperation.top_queries,
    topPages: providerCallIdByOperation.top_pages,
  });
  assert.deepEqual(collected[0]?.operations, operations);
  assert.deepEqual(
    state.successes.map((success) => success.providerCallId),
    Object.values(providerCallIdByOperation),
  );
  assert.equal(state.failures.length, 0);
  assert.deepEqual(state.audits.map((audit) => audit.action), [
    "collector.gsc.started",
    "collector.gsc.finished",
  ]);
  const finished = state.audits.find((audit) => audit.action === "collector.gsc.finished");
  assert.deepEqual(finished?.metadata?.providerCalls, operations.map((operation) => ({
    provider: "google-search-console",
    operation,
    providerCallId: providerCallIdByOperation[operation],
    collectedAt: "2026-08-09T23:01:00.000Z",
    status: "succeeded",
    errorCode: null,
    replayed: false,
  })));
});

test("handler는 replay를 재호출하지 않고 execute operation만 collector에 전달한다", async () => {
  const collected: GscWeeklyCollectionInput[] = [];
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      collected.push(input);
      return successfulResult(input);
    },
  };
  const state = context({
    disposition: { aggregate: "replay", top_queries: "execute", top_pages: "replay" },
    collected,
  });

  const result = await createGscCollectionJobHandler({ collector })(
    job(),
    state.executionContext,
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(collected[0]?.operations, ["top_queries"]);
  assert.deepEqual(state.successes.map((value) => value.providerCallId), [
    providerCallIdByOperation.top_queries,
  ]);
  const finished = state.audits.find((audit) => audit.action === "collector.gsc.finished");
  const providerCalls = finished?.metadata?.providerCalls as Array<Record<string, unknown>>;
  assert.deepEqual(
    providerCalls.map((call) => ({
      operation: call.operation,
      providerCallId: call.providerCallId,
      collectedAt: call.collectedAt,
      status: call.status,
      errorCode: call.errorCode,
      replayed: call.replayed,
    })),
    [
      {
        operation: "top_queries",
        providerCallId: providerCallIdByOperation.top_queries,
        collectedAt: "2026-08-09T23:01:00.000Z",
        status: "succeeded",
        errorCode: null,
        replayed: false,
      },
      ...(["aggregate", "top_pages"] as const).map((operation) => ({
        operation,
        providerCallId: providerCallIdByOperation[operation],
        collectedAt: "2026-08-09T22:59:00.000Z",
        status: "succeeded",
        errorCode: null,
        replayed: true,
      })),
    ],
  );
});

test("handler는 모든 reservation이 replay면 collector 외부 호출 없이 성공 처리한다", async () => {
  let calls = 0;
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      calls += 1;
      return successfulResult(input);
    },
  };
  const state = context({
    disposition: {
      aggregate: "replay",
      top_queries: "replay",
      top_pages: "replay",
    },
  });

  const result = await createGscCollectionJobHandler({ collector })(
    job(),
    state.executionContext,
  );

  assert.equal(result.status, "succeeded");
  assert.equal(calls, 0);
  assert.equal(state.successes.length, 0);
  assert.equal(state.failures.length, 0);
  const finished = state.audits.find((audit) => audit.action === "collector.gsc.finished");
  const providerCalls = finished?.metadata?.providerCalls as Array<Record<string, unknown>>;
  assert.equal(providerCalls.length, 3);
  assert.ok(providerCalls.every((call) =>
    call.replayed === true &&
    call.status === "succeeded" &&
    call.errorCode === null &&
    call.collectedAt === "2026-08-09T22:59:00.000Z"
  ));
});

test("replay provenance에 원 수집시각이 없으면 성공으로 위장하지 않는다", async () => {
  const state = context({
    disposition: {
      aggregate: "replay",
      top_queries: "replay",
      top_pages: "replay",
    },
  });
  const reserve = state.executionContext.providerCalls.reserve;
  const executionContext: JobExecutionContext = {
    ...state.executionContext,
    providerCalls: {
      ...state.executionContext.providerCalls,
      reserve: async (request) => ({
        ...await reserve(request),
        responseMetadata: null,
      }),
    },
  };

  assert.deepEqual(
    await createGscCollectionJobHandler({
      collector: { collect: async (input) => successfulResult(input) },
    })(job(), executionContext),
    { status: "retryable", error: "GSC_REPLAY_METADATA_INVALID" },
  );
  assert.deepEqual(state.audits.map((audit) => audit.action), [
    "collector.gsc.started",
    "collector.gsc.replay_metadata_invalid",
  ]);
});

test("handler는 partial 결과의 성공 call을 확정하고 retryable call을 실패 기록 후 재시도한다", async () => {
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      const result = successfulResult(input);
      return {
        ...result,
        status: "partial",
        providerCalls: result.providerCalls.map((call) =>
          call.operation === "top_pages"
            ? {
                ...call,
                status: "retryable" as const,
                errorCode: "RATE_LIMITED",
              }
            : call
        ),
      };
    },
  };
  const state = context({});

  const result = await createGscCollectionJobHandler({ collector })(
    job(),
    state.executionContext,
  );

  assert.deepEqual(result, { status: "retryable", error: "RATE_LIMITED" });
  assert.deepEqual(state.successes.map((value) => value.providerCallId), [
    providerCallIdByOperation.aggregate,
    providerCallIdByOperation.top_queries,
  ]);
  assert.deepEqual(state.failures, [
    {
      providerCallId: providerCallIdByOperation.top_pages,
      usageReservationId: "usage-top_pages",
      errorCode: "RATE_LIMITED",
    },
  ]);
  const finished = state.audits.find((audit) => audit.action === "collector.gsc.finished");
  const providerCalls = finished?.metadata?.providerCalls as Array<Record<string, unknown>>;
  assert.deepEqual(providerCalls.find((call) => call.operation === "top_pages"), {
    provider: "google-search-console",
    operation: "top_pages",
    providerCallId: providerCallIdByOperation.top_pages,
    collectedAt: "2026-08-09T23:01:00.000Z",
    status: "retryable",
    errorCode: "RATE_LIMITED",
    replayed: false,
  });
});

test("handler는 in_doubt를 재호출하지 않고 retryable로 분류하며 마지막 시도에는 dead로 보낸다", async () => {
  let calls = 0;
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      calls += 1;
      return successfulResult(input);
    },
  };
  const state = context({ disposition: { top_pages: "in_doubt" } });
  const handler = createGscCollectionJobHandler({ collector });

  assert.deepEqual(await handler(job(), state.executionContext), {
    status: "retryable",
    error: "GSC_PROVIDER_CALL_IN_DOUBT",
  });
  assert.equal(calls, 0);
  assert.deepEqual(state.failures, [
    {
      providerCallId: providerCallIdByOperation.aggregate,
      usageReservationId: "usage-aggregate",
      errorCode: "GSC_PROVIDER_CALL_IN_DOUBT",
    },
    {
      providerCallId: providerCallIdByOperation.top_queries,
      usageReservationId: "usage-top_queries",
      errorCode: "GSC_PROVIDER_CALL_IN_DOUBT",
    },
  ]);

  const lastContext = { ...state.executionContext, attempt: 5, maxAttempts: 5 };
  assert.deepEqual(
    await handler(job({ attempt: 5 }), lastContext),
    { status: "dead", error: "GSC_PROVIDER_CALL_IN_DOUBT" },
  );
});

test("후속 reserve 예외는 앞서 execute 예약된 provider call을 실패 처리해 예약 누수를 남기지 않는다", async () => {
  let calls = 0;
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      calls += 1;
      return successfulResult(input);
    },
  };
  const state = context({});
  const baseReserve = state.executionContext.providerCalls.reserve;
  const executionContext: JobExecutionContext = {
    ...state.executionContext,
    providerCalls: {
      ...state.executionContext.providerCalls,
      reserve: async (request) => {
        if (request.operation === "search_analytics.top_queries") {
          throw new Error("reservation storage unavailable and must not leak");
        }
        return baseReserve(request);
      },
    },
  };

  const result = await createGscCollectionJobHandler({ collector })(
    job(),
    executionContext,
  );

  assert.deepEqual(result, {
    status: "retryable",
    error: "GSC_PROVIDER_RESERVATION_FAILED",
  });
  assert.equal(calls, 0);
  assert.deepEqual(state.failures, [
    {
      providerCallId: providerCallIdByOperation.aggregate,
      usageReservationId: "usage-aggregate",
      errorCode: "GSC_PROVIDER_RESERVATION_FAILED",
    },
  ]);
});

test("provider 호출 뒤 collector throw는 reservation을 fail하지 않아 재시도 외부 호출을 in_doubt로 차단한다", async () => {
  let calls = 0;
  const collector: GscWeeklyCollector = {
    collect: async () => {
      calls += 1;
      throw new Error("observation store failed after provider response user@example.com");
    },
  };
  const first = context({});
  const handler = createGscCollectionJobHandler({ collector });

  assert.deepEqual(await handler(job(), first.executionContext), {
    status: "retryable",
    error: "GSC_COLLECTOR_OUTCOME_IN_DOUBT",
  });
  assert.equal(calls, 1);
  assert.equal(first.failures.length, 0);

  const retry = context({
    disposition: {
      aggregate: "in_doubt",
      top_queries: "in_doubt",
      top_pages: "in_doubt",
    },
  });
  assert.deepEqual(await handler(job(), retry.executionContext), {
    status: "retryable",
    error: "GSC_PROVIDER_CALL_IN_DOUBT",
  });
  assert.equal(calls, 1);
  assert.equal(retry.failures.length, 0);
});

test("provider 호출 전 target/token access 실패는 execute reservation을 안전하게 fail한다", async () => {
  const collector: GscWeeklyCollector = {
    collect: async () => {
      throw new GscCollectorAccessError("NOT_FOUND");
    },
  };
  const state = context({});

  assert.deepEqual(
    await createGscCollectionJobHandler({ collector })(job(), state.executionContext),
    { status: "dead", error: "GSC_NOT_FOUND" },
  );
  assert.equal(state.failures.length, 3);
  assert.ok(state.failures.every((failure) => failure.errorCode === "GSC_NOT_FOUND"));
});

test("handler는 payload와 context workspace 불일치를 provider 예약 전에 dead로 거부한다", async () => {
  let collected = false;
  const collector: GscWeeklyCollector = {
    collect: async (input) => {
      collected = true;
      return successfulResult(input);
    },
  };
  const state = context({});
  const handler = createGscCollectionJobHandler({ collector });

  assert.deepEqual(
    await handler(
      job({ payload: { siteId: "bad", bindingId, executedAt: "not-a-date" } }),
      state.executionContext,
    ),
    { status: "dead", error: "GSC_INVALID_PAYLOAD" },
  );
  assert.deepEqual(
    await handler(job(), { ...state.executionContext, workspaceId: "other-workspace" }),
    { status: "dead", error: "GSC_WORKSPACE_MISMATCH" },
  );
  assert.equal(state.requests.length, 0);
  assert.equal(collected, false);
});

test("production wrapper는 job 전체에서 전용 worker client 하나를 collector factory에 전달하고 release한다", async () => {
  const events: string[] = [];
  const client = {
    query: async () => ({ rows: [] }),
    release: () => {
      events.push("release");
    },
  };
  const handler = createDedicatedGscCollectionJobHandler({
    pool: {
      connect: async () => {
        events.push("connect");
        return client;
      },
    },
    createCollector: (connected) => {
      assert.equal(connected, client);
      events.push("factory");
      return {
        collect: async (input) => {
          events.push("collect");
          return successfulResult(input);
        },
      };
    },
  });
  const state = context({});

  const result = await handler(job(), state.executionContext);

  assert.equal(result.status, "succeeded");
  assert.deepEqual(events, ["connect", "factory", "collect", "release"]);
});

test("production GSC 체인은 target·token rotation·공식 HTTP·observation을 동일 pinned physical client에서 처리한다", async () => {
  const connectionId = "54000000-0000-4000-8000-000000000601";
  const crypto = createSecretCrypto({
    currentKeyId: "gsc-pinned-e2e",
    currentSecret: "p".repeat(32),
  });
  const tokenAad = (type: "access-token" | "refresh-token") =>
    `workspace:${workspaceId}:gsc:${connectionId}:${type}`;
  let encryptedAccess = crypto.encrypt("pinned-access", tokenAad("access-token"));
  let encryptedRefresh = crypto.encrypt("pinned-refresh", tokenAad("refresh-token"));
  let tokenExpiresAt = "2026-08-09T23:02:00.000Z";
  const events: string[] = [];
  let directPoolQueries = 0;
  const client = {
    async query<T = unknown>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<{ rows: T[] }> {
      const normalized = text.replace(/\s+/gu, " ").trim().toLowerCase();
      if (["begin", "commit", "rollback"].includes(normalized)) {
        events.push(normalized);
        return { rows: [] };
      }
      if (normalized.startsWith("select set_config")) {
        events.push("set_config");
        return { rows: [] };
      }
      if (normalized.includes("from gsc_property_bindings")) {
        events.push("select_target");
        return {
          rows: [{
            workspace_id: workspaceId,
            site_id: siteId,
            binding_id: bindingId,
            connection_id: connectionId,
            property_uri: "sc-domain:example.com",
          }] as T[],
        };
      }
      if (normalized.includes("from gsc_connections")) {
        events.push("select_connection");
        return {
          rows: [{
            id: connectionId,
            workspace_id: workspaceId,
            label: "Pinned GSC",
            access_token_encrypted: encryptedAccess,
            refresh_token_encrypted: encryptedRefresh,
            token_expires_at: tokenExpiresAt,
            scope: GSC_SCOPE,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          }] as T[],
        };
      }
      if (normalized.startsWith("update gsc_connections")) {
        events.push("update_connection_tokens");
        encryptedAccess = String(values[2]);
        encryptedRefresh = String(values[3]);
        tokenExpiresAt = new Date(values[4] as Date | string).toISOString();
        return {
          rows: [{
            id: connectionId,
            workspace_id: workspaceId,
            label: "Pinned GSC",
            access_token_encrypted: encryptedAccess,
            refresh_token_encrypted: encryptedRefresh,
            token_expires_at: tokenExpiresAt,
            scope: GSC_SCOPE,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-09T23:01:00.000Z",
          }] as T[],
        };
      }
      if (normalized.startsWith("insert into gsc_observations")) {
        events.push("upsert_observations");
        return { rows: [] };
      }
      throw new Error(`UNEXPECTED_GSC_SQL:${normalized}`);
    },
    release() {
      events.push("release");
    },
  };
  const providerOperations: string[] = [];
  const pool = {
    async query() {
      directPoolQueries += 1;
      throw new Error("DIRECT_POOL_QUERY_FORBIDDEN");
    },
    async connect() {
      events.push("connect");
      return client;
    },
  };
  const handler = createDedicatedGscCollectionJobHandler({
    pool,
    createCollector: (connected) => {
      assert.equal(connected, client);
      return createGscWeeklyCollector({
        targetLoader: (input) => loadGscCollectionTarget(connected, input),
        tokenBroker: createGscTokenBroker({
          db: connected,
          crypto,
          oauthConfig: {
            clientId: "google-client",
            clientSecret: "google-secret",
            redirectUri: "https://semforge.invalid/api/v1/integrations/gsc/callback",
          },
          now: () => new Date("2026-08-09T23:01:00.000Z"),
          refreshAccessToken: async (refreshToken) => {
            events.push("refresh_token");
            assert.equal(refreshToken, "pinned-refresh");
            return {
              accessToken: "rotated-access",
              refreshToken: "rotated-refresh",
              expiryMs: Date.parse("2026-08-10T00:01:00.000Z"),
              scope: GSC_SCOPE,
            };
          },
        }),
        searchAnalyticsClient: createGscSearchAnalyticsClient({
          fetchImpl: async (input, init) => {
            assert.equal(
              String(input),
              "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query",
            );
            assert.equal(
              new Headers(init?.headers).get("authorization"),
              "Bearer rotated-access",
            );
            const request = JSON.parse(String(init?.body)) as {
              dimensions: ["date" | "query" | "page"];
              endDate: string;
            };
            const dimension = request.dimensions[0];
            providerOperations.push(dimension);
            events.push(`gsc_http_${dimension}`);
            return Response.json({
              rows: [{
                keys: [dimension === "date" ? request.endDate : `top-${dimension}`],
                clicks: 1,
                impressions: 2,
                ctr: 0.5,
                position: 1,
              }],
            });
          },
        }),
        observationStore: createPostgresGscObservationStore(connected),
        now: () => new Date("2026-08-09T23:01:00.000Z"),
      });
    },
  });
  const state = context({});

  const result = await handler(job(), state.executionContext);

  assert.equal(result.status, "succeeded");
  assert.equal(directPoolQueries, 0);
  assert.deepEqual(providerOperations, ["date", "query", "page"]);
  assert.equal(
    crypto.decrypt(encryptedAccess, tokenAad("access-token")),
    "rotated-access",
  );
  assert.equal(
    crypto.decrypt(encryptedRefresh, tokenAad("refresh-token")),
    "rotated-refresh",
  );
  assert.equal(tokenExpiresAt, "2026-08-10T00:01:00.000Z");
  assert.deepEqual(events, [
    "connect",
    "begin",
    "set_config",
    "select_target",
    "commit",
    "begin",
    "set_config",
    "select_connection",
    "commit",
    "refresh_token",
    "begin",
    "set_config",
    "update_connection_tokens",
    "commit",
    "gsc_http_date",
    "gsc_http_query",
    "gsc_http_page",
    "begin",
    "set_config",
    "upsert_observations",
    "commit",
    "release",
  ]);
});

test("pinned physical GSC chain은 observation 실패를 rollback하고 release하며 호출 결과를 in_doubt로 보존한다", async () => {
  const connectionId = "54000000-0000-4000-8000-000000000602";
  const crypto = createSecretCrypto({
    currentKeyId: "gsc-pinned-rollback",
    currentSecret: "r".repeat(32),
  });
  const tokenAad = (type: "access-token" | "refresh-token") =>
    `workspace:${workspaceId}:gsc:${connectionId}:${type}`;
  const events: string[] = [];
  const client = {
    async query<T = unknown>(text: string): Promise<{ rows: T[] }> {
      const normalized = text.replace(/\s+/gu, " ").trim().toLowerCase();
      if (["begin", "commit", "rollback"].includes(normalized)) {
        events.push(normalized);
        return { rows: [] };
      }
      if (normalized.startsWith("select set_config")) {
        events.push("set_config");
        return { rows: [] };
      }
      if (normalized.includes("from gsc_property_bindings")) {
        events.push("select_target");
        return {
          rows: [{
            workspace_id: workspaceId,
            site_id: siteId,
            binding_id: bindingId,
            connection_id: connectionId,
            property_uri: "sc-domain:rollback.example",
          }] as T[],
        };
      }
      if (normalized.includes("from gsc_connections")) {
        events.push("select_connection");
        return {
          rows: [{
            id: connectionId,
            workspace_id: workspaceId,
            label: "Rollback GSC",
            access_token_encrypted: crypto.encrypt(
              "rollback-access",
              tokenAad("access-token"),
            ),
            refresh_token_encrypted: crypto.encrypt(
              "rollback-refresh",
              tokenAad("refresh-token"),
            ),
            token_expires_at: "2026-08-10T02:00:00.000Z",
            scope: GSC_SCOPE,
            created_at: "2026-08-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
          }] as T[],
        };
      }
      if (normalized.startsWith("insert into gsc_observations")) {
        events.push("upsert_observations_failed");
        throw new Error("observation persistence unavailable");
      }
      throw new Error(`UNEXPECTED_GSC_SQL:${normalized}`);
    },
    release() {
      events.push("release");
    },
  };
  const handler = createDedicatedGscCollectionJobHandler({
    pool: { connect: async () => { events.push("connect"); return client; } },
    createCollector: (connected) => createGscWeeklyCollector({
      targetLoader: (input) => loadGscCollectionTarget(connected, input),
      tokenBroker: createGscTokenBroker({
        db: connected,
        crypto,
        oauthConfig: {
          clientId: "google-client",
          clientSecret: "google-secret",
          redirectUri: "https://semforge.invalid/api/v1/integrations/gsc/callback",
        },
        now: () => new Date("2026-08-09T23:01:00.000Z"),
      }),
      searchAnalyticsClient: createGscSearchAnalyticsClient({
        fetchImpl: async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as {
            dimensions: ["date" | "query" | "page"];
            endDate: string;
          };
          const dimension = request.dimensions[0];
          events.push(`gsc_http_${dimension}`);
          return Response.json({
            rows: [{
              keys: [dimension === "date" ? request.endDate : `top-${dimension}`],
              clicks: 1,
              impressions: 2,
              ctr: 0.5,
              position: 1,
            }],
          });
        },
      }),
      observationStore: createPostgresGscObservationStore(connected),
      now: () => new Date("2026-08-09T23:01:00.000Z"),
    }),
  });
  const state = context({});

  assert.deepEqual(await handler(job(), state.executionContext), {
    status: "retryable",
    error: "GSC_COLLECTOR_OUTCOME_IN_DOUBT",
  });
  assert.equal(state.successes.length, 0);
  assert.equal(state.failures.length, 0);
  assert.deepEqual(events, [
    "connect",
    "begin",
    "set_config",
    "select_target",
    "commit",
    "begin",
    "set_config",
    "select_connection",
    "commit",
    "gsc_http_date",
    "gsc_http_query",
    "gsc_http_page",
    "begin",
    "set_config",
    "upsert_observations_failed",
    "rollback",
    "release",
  ]);
});
