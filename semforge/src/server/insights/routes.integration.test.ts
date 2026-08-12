// @TASK P5-READ-API - NAVER and Google AIO read model API contracts
// @SPEC docs/planning/06-tasks.md#api-v1
// @TEST src/server/insights/routes.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { BillingAccessAuthorizer } from "@/server/billing/access";
import { createInsightRouteHandlers } from "@/server/insights/routes";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

const workspaceId = "65000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "65000000-0000-4000-8000-000000000002";
const siteId = "65000000-0000-4000-8000-000000000101";
const otherSiteId = "65000000-0000-4000-8000-000000000102";
const rankQueryId = "65000000-0000-4000-8000-000000000201";
const aioQueryId = "65000000-0000-4000-8000-000000000202";
const userId = "65000000-0000-4000-8000-000000000301";

const allowBillingAccess: BillingAccessAuthorizer = async () => ({
  allowed: true,
  mode: "full",
  reason: "active",
  reportPeriodEndBefore: null,
});

async function readEnvelope(response: Response): Promise<{
  data: unknown;
  error: null | { code: string; message: string };
  requestId: string;
}> {
  return response.json() as Promise<{
    data: unknown;
    error: null | { code: string; message: string };
    requestId: string;
  }>;
}

function handlersFor(
  workspace = workspaceId,
  authorizeBilling: BillingAccessAuthorizer = allowBillingAccess,
) {
  return createInsightRouteHandlers({
    db: pg,
    authorizeBilling,
    resolveSession: async () => ({
      workspaceId: workspace,
      userId,
      role: "owner",
      requestId: "insights-route-test-session",
    }),
  });
}

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    `insert into workspaces (id, name, slug) values
       ($1, 'Insights Agency', 'insights-agency'),
       ($2, 'Other Insights Agency', 'other-insights-agency')`,
    [workspaceId, otherWorkspaceId],
  );
  await pg.query(
    `insert into sites (id, workspace_id, name, domain) values
       ($1, $2, 'Insights Site', 'insights.example.com'),
       ($3, $4, 'Other Site', 'other-insights.example.com')`,
    [siteId, workspaceId, otherSiteId, otherWorkspaceId],
  );
  await pg.query(
    `insert into tracked_queries
       (id, workspace_id, site_id, type, query, normalized_query) values
       ($1, $2, $3, 'rank', '검색엔진최적화', '검색엔진최적화'),
       ($4, $2, $3, 'aio', 'AI Overview SEO', 'ai overview seo')`,
    [rankQueryId, workspaceId, siteId, aioQueryId],
  );
  await pg.query(
    `insert into tracked_queries
       (id, workspace_id, site_id, type, query, normalized_query) values
       ('65000000-0000-4000-8000-000000000299', $1, $2, 'rank', 'Other Query', 'other query')`,
    [otherWorkspaceId, otherSiteId],
  );
  await pg.query(
    `insert into provider_calls
       (id, workspace_id, provider, operation, idempotency_key, request_hash, status, response_metadata, completed_at)
     values
       ('65000000-0000-4000-8000-000000000401', $1, 'naver-search-ads', 'monthly', 'naver-read-monthly', 'hash-naver-monthly', 'succeeded', '{"source":"naver-search-ads-relkwdstat"}'::jsonb, '2026-08-09T09:01:00.000Z'),
       ('65000000-0000-4000-8000-000000000402', $1, 'talordata', 'google_serp_aio', 'aio-read', 'hash-aio-read', 'succeeded', '{"providerRequestId":"td_123"}'::jsonb, '2026-08-09T09:02:00.000Z')`,
    [workspaceId],
  );
  await pg.query(
    `insert into naver_observations
       (id, workspace_id, site_id, tracked_query_id, observed_at, collected_at,
        monthly_pc_search_volume, monthly_mobile_search_volume, blog_result_count, trend, demographics)
     values
       ('65000000-0000-4000-8000-000000000501', $1, $2, $3, '2026-08-02T09:00:00.000Z', '2026-08-02T09:01:00.000Z', 1, 2, 3, '[{"period":"2026-07-01","ratio":10}]'::jsonb, '{"gender":[],"age":[]}'::jsonb),
       ('65000000-0000-4000-8000-000000000502', $1, $2, $3, '2026-08-09T09:00:00.000Z', '2026-08-09T09:01:00.000Z', 10, 120, 3456, '[{"period":"2026-08-01","ratio":42.5}]'::jsonb, '{"gender":[{"group":"f","ratio":55}],"age":[{"group":"30","ratio":44}]}'::jsonb)`,
    [workspaceId, siteId, rankQueryId],
  );
  await pg.query(
    `insert into naver_observation_sources
       (workspace_id, observation_id, source, status, provider_call_id, collected_at, error_code, metadata)
     values
       ($1, '65000000-0000-4000-8000-000000000502', 'search_ads_monthly_volume', 'succeeded', '65000000-0000-4000-8000-000000000401', '2026-08-09T09:01:00.000Z', null, '{"providerSource":"naver-search-ads-relkwdstat"}'::jsonb),
       ($1, '65000000-0000-4000-8000-000000000502', 'datalab_trend', 'retryable', null, '2026-08-09T09:01:30.000Z', 'NAVER_RATE_LIMITED', '{"providerSource":"naver-datalab-search"}'::jsonb),
       ($1, '65000000-0000-4000-8000-000000000502', 'datalab_gender', 'succeeded', null, '2026-08-09T09:01:31.000Z', null, '{"providerSource":"naver-datalab-search"}'::jsonb),
       ($1, '65000000-0000-4000-8000-000000000502', 'datalab_age', 'unavailable', null, '2026-08-09T09:01:32.000Z', 'NAVER_OPEN_API_UNAVAILABLE', '{"providerSource":"naver-datalab-search"}'::jsonb),
       ($1, '65000000-0000-4000-8000-000000000502', 'search_api_blog_total', 'succeeded', null, '2026-08-09T09:01:33.000Z', null, '{"providerSource":"naver-search-api-blog"}'::jsonb)`,
    [workspaceId],
  );
  await pg.query(
    `insert into aio_observations
       (id, workspace_id, site_id, tracked_query_id, provider_call_id, observed_at, presence, answer_text)
     values
       ('65000000-0000-4000-8000-000000000601', $1, $2, $3, '65000000-0000-4000-8000-000000000402', '2026-08-09T09:00:00.000Z', 'present', '요약 답변')`,
    [workspaceId, siteId, aioQueryId],
  );
  await pg.query(
    `insert into aio_citations
       (workspace_id, observation_id, url, title, position)
     values
       ($1, '65000000-0000-4000-8000-000000000601', 'https://source.example/aio', 'Source', 2),
       ($1, '65000000-0000-4000-8000-000000000601', 'https://insights.example.com/aio', 'Owned', 1)`,
    [workspaceId],
  );
});

after(async () => pg.close());

test("GET /api/v1/insights/naver는 tenant site의 최신 NAVER observation과 source provenance만 반환한다", async () => {
  const response = await handlersFor().naver.GET(
    new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteId}`, {
      headers: { "x-request-id": "naver-latest-read" },
    }),
    undefined,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const envelope = await readEnvelope(response);
  assert.equal(envelope.error, null);
  assert.equal(envelope.requestId, "naver-latest-read");
  const data = envelope.data as {
    siteId: string;
    items: Array<{
      tracking: { id: string; query: string };
      observation: {
        observedAt: string;
        monthlySearchVolume: { pc: number | null; mobile: number | null; total: number | null };
        trend: unknown[];
        demographics: Record<string, unknown>;
        blogResultCount: number | null;
        sources: Array<{ source: string; status: string; errorCode: string | null; providerSource: string | null }>;
      };
    }>;
  };
  assert.equal(data.siteId, siteId);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0]?.tracking.id, rankQueryId);
  assert.equal(data.items[0]?.observation.observedAt, "2026-08-09T09:00:00.000Z");
  assert.deepEqual(data.items[0]?.observation.monthlySearchVolume, { pc: 10, mobile: 120, total: 130 });
  assert.equal(data.items[0]?.observation.blogResultCount, 3456);
  assert.equal(data.items[0]?.observation.sources.find((source) => source.source === "datalab_age")?.status, "unavailable");
  assert.equal(data.items[0]?.observation.sources.find((source) => source.source === "datalab_age")?.errorCode, "NAVER_OPEN_API_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(envelope.data), /competition|ppc|naverRank|rankPosition|경쟁도|네이버\s*순위/iu);
});

test("GET /api/v1/insights/naver는 observedTo 범위 안의 최신 관측값만 선택한다", async () => {
  const response = await handlersFor().naver.GET(
    new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteId}&observedTo=2026-08-02T23:59:59.000Z`),
    undefined,
  );

  assert.equal(response.status, 200);
  const envelope = await readEnvelope(response);
  const data = envelope.data as { items: Array<{ observation: { observedAt: string; blogResultCount: number | null } }> };
  assert.equal(data.items[0]?.observation.observedAt, "2026-08-02T09:00:00.000Z");
  assert.equal(data.items[0]?.observation.blogResultCount, 3);
});

test("GET /api/v1/visibility/aio는 Google AIO presence와 citation provenance를 tenant 안에서 반환한다", async () => {
  const response = await handlersFor().aio.GET(
    new Request(`https://app.semforge.test/api/v1/visibility/aio?siteId=${siteId}`, {
      headers: { "x-request-id": "aio-latest-read" },
    }),
    undefined,
  );

  assert.equal(response.status, 200);
  const envelope = await readEnvelope(response);
  assert.equal(envelope.error, null);
  assert.equal(envelope.requestId, "aio-latest-read");
  const data = envelope.data as {
    siteId: string;
    items: Array<{
      tracking: { id: string; query: string };
      observation: {
        observedAt: string;
        presence: "present" | "absent" | "unknown";
        answerText: string | null;
        citations: Array<{ url: string; title: string | null; position: number }>;
        provenance: { source: string; engine: string; country: string; language: string; device: string; window: number; collectedAt: string | null };
      };
    }>;
  };
  assert.equal(data.siteId, siteId);
  assert.equal(data.items[0]?.tracking.id, aioQueryId);
  assert.equal(data.items[0]?.observation.presence, "present");
  assert.deepEqual(data.items[0]?.observation.citations.map((citation) => citation.position), [1, 2]);
  assert.equal(data.items[0]?.observation.provenance.source, "talordata");
  assert.equal(data.items[0]?.observation.provenance.engine, "google");
  assert.equal(data.items[0]?.observation.provenance.country, "kr");
  assert.equal(data.items[0]?.observation.provenance.language, "ko");
  assert.equal(data.items[0]?.observation.provenance.device, "desktop");
  assert.equal(data.items[0]?.observation.provenance.window, 100);
});

test("NAVER/AIO 읽기 API는 다른 workspace site를 404로 숨기고 past_due grace 직접 조회를 403으로 차단한다", async () => {
  const attacker = handlersFor(otherWorkspaceId);
  const hiddenNaver = await attacker.naver.GET(
    new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteId}`),
    undefined,
  );
  const hiddenAio = await attacker.aio.GET(
    new Request(`https://app.semforge.test/api/v1/visibility/aio?siteId=${siteId}`),
    undefined,
  );
  assert.equal(hiddenNaver.status, 404);
  assert.equal(hiddenAio.status, 404);

  const billingCalls: string[] = [];
  const denied = handlersFor(workspaceId, async ({ capability }) => {
    billingCalls.push(capability);
    return {
      allowed: false,
      mode: "past_reports_only",
      reason: "past_due_grace",
      reportPeriodEndBefore: new Date("2026-08-01T00:00:00.000Z"),
    };
  });
  const deniedNaver = await denied.naver.GET(
    new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteId}`),
    undefined,
  );
  const deniedAio = await denied.aio.GET(
    new Request(`https://app.semforge.test/api/v1/visibility/aio?siteId=${siteId}`),
    undefined,
  );

  assert.equal(deniedNaver.status, 403);
  assert.equal((await readEnvelope(deniedNaver)).error?.code, "FORBIDDEN");
  assert.equal(deniedAio.status, 403);
  assert.deepEqual(billingCalls, ["workspace:read", "workspace:read"]);
});

test("NAVER/AIO 읽기 API는 siteId와 observation 범위를 검증하고 수동 refresh 입력을 받지 않는다", async () => {
  const handlers = handlersFor();
  const missingSite = await handlers.naver.GET(
    new Request("https://app.semforge.test/api/v1/insights/naver"),
    undefined,
  );
  const invalidRange = await handlers.aio.GET(
    new Request(`https://app.semforge.test/api/v1/visibility/aio?siteId=${siteId}&observedFrom=2026-08-10T00:00:00.000Z&observedTo=2026-08-01T00:00:00.000Z`),
    undefined,
  );
  const refreshAttempt = await handlers.naver.GET(
    new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteId}&refresh=true`),
    undefined,
  );

  assert.equal(missingSite.status, 400);
  assert.equal(invalidRange.status, 400);
  assert.equal(refreshAttempt.status, 400);
});
