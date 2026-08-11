// @TASK P3-C2-T1 - NAVER PostgreSQL observation store contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/naver/postgres-store.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { NaverObservationRecord } from "@/server/collectors/naver/collector";
import { createPostgresNaverObservationStore } from "@/server/collectors/naver/postgres-store";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const workspaceId = "54000000-0000-4000-8000-000000000001";
const siteId = "54000000-0000-4000-8000-000000000101";
const trackedQueryId = "54000000-0000-4000-8000-000000000201";
const monthlyCallId = "54000000-0000-4000-8000-000000000301";
const trendCallId = "54000000-0000-4000-8000-000000000302";
const blogCallId = "54000000-0000-4000-8000-000000000303";
const ageCallId = "54000000-0000-4000-8000-000000000304";
const collectedAt = "2026-08-09T09:01:00.000Z";

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'NAVER Store', 'naver-store')",
    [workspaceId],
  );
  await pg.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Site', 'naver.example')",
    [siteId, workspaceId],
  );
  await pg.query(
    `insert into tracked_queries (id, workspace_id, site_id, type, query, normalized_query)
     values ($1, $2, $3, 'rank', '검색엔진최적화', '검색엔진최적화')`,
    [trackedQueryId, workspaceId, siteId],
  );
  await pg.query(
    `insert into provider_calls
       (id, workspace_id, provider, operation, idempotency_key, request_hash, status)
     values ($1, $4, 'naver-search-ads', 'monthly', 'naver-monthly', 'hash-monthly', 'succeeded'),
            ($2, $4, 'naver-open-api', 'trend', 'naver-trend', 'hash-trend', 'succeeded'),
            ($3, $4, 'naver-open-api', 'blog', 'naver-blog', 'hash-blog', 'succeeded'),
            ($5, $4, 'naver-open-api', 'age', 'naver-age', 'hash-age', 'failed')`,
    [monthlyCallId, trendCallId, blogCallId, workspaceId, ageCallId],
  );
});

after(async () => pg.close());

function initialRecord(): NaverObservationRecord {
  return {
    observationKey: "naver:v1:" + "a".repeat(64),
    workspaceId,
    siteId,
    trackedQueryId,
    query: "검색엔진최적화",
    observedAt: "2026-08-09T09:00:00.000Z",
    collectedAt,
    range: { startDate: "2026-07-01", endDate: "2026-07-31", timeUnit: "date" },
    status: "partial",
    callsUsed: 16,
    sources: {
      search_ads_monthly_volume: {
        status: "succeeded",
        value: {
          pc: { relation: "lt", min: 0, maxExclusive: 10, display: "<10" },
          mobile: { relation: "exact", value: 120, min: 120, maxExclusive: 121, display: "120" },
          source: "naver-search-ads-relkwdstat",
          collectedAt,
        },
        providerCallId: monthlyCallId,
        provenance: { source: "naver-search-ads-relkwdstat", collectedAt },
        errorCode: null,
      },
      datalab_trend: {
        status: "retryable",
        value: null,
        providerCallId: trendCallId,
        provenance: null,
        errorCode: "NAVER_RATE_LIMITED",
      },
      datalab_gender: {
        status: "unavailable",
        value: null,
        providerCallId: null,
        provenance: null,
        errorCode: "NAVER_OPEN_API_UNAVAILABLE",
      },
      datalab_age: {
        status: "failed",
        value: null,
        providerCallId: ageCallId,
        provenance: null,
        errorCode: "NAVER_PROVIDER_REJECTED",
      },
      search_api_blog_total: {
        status: "unavailable",
        value: null,
        providerCallId: null,
        provenance: null,
        errorCode: "NAVER_CALL_BUDGET_EXCEEDED",
      },
    },
  };
}

test("DB 멱등 경계로 partial source를 보강하고 <10 qualifier/provenance를 보존한다", async () => {
  const store = createPostgresNaverObservationStore(pg);
  const initial = initialRecord();
  await store.upsert(initial);

  const initialSources = await pg.query<{
    source: string;
    status: string;
    provider_call_id: string | null;
    collected_at: Date | string | null;
    error_code: string | null;
  }>(
    `select source, status, provider_call_id::text, collected_at, error_code
       from naver_observation_sources
      where workspace_id = $1
      order by source`,
    [workspaceId],
  );
  assert.deepEqual(
    initialSources.rows.map((row) => ({
      ...row,
      collected_at: row.collected_at ? new Date(row.collected_at).toISOString() : null,
    })),
    [
      {
        source: "datalab_age",
        status: "failed",
        provider_call_id: ageCallId,
        collected_at: collectedAt,
        error_code: "NAVER_PROVIDER_REJECTED",
      },
      {
        source: "datalab_gender",
        status: "unavailable",
        provider_call_id: null,
        collected_at: collectedAt,
        error_code: "NAVER_OPEN_API_UNAVAILABLE",
      },
      {
        source: "datalab_trend",
        status: "retryable",
        provider_call_id: trendCallId,
        collected_at: collectedAt,
        error_code: "NAVER_RATE_LIMITED",
      },
      {
        source: "search_ads_monthly_volume",
        status: "succeeded",
        provider_call_id: monthlyCallId,
        collected_at: collectedAt,
        error_code: null,
      },
      {
        source: "search_api_blog_total",
        status: "unavailable",
        provider_call_id: null,
        collected_at: collectedAt,
        error_code: "NAVER_CALL_BUDGET_EXCEEDED",
      },
    ],
  );

  await store.upsert({
    ...initial,
    query: "retry에서 바뀐 표현",
    collectedAt: "2026-08-09T09:03:00.000Z",
    range: { startDate: "2026-06-01", endDate: "2026-06-30", timeUnit: "month" },
    sources: {
      ...initial.sources,
      search_ads_monthly_volume: {
        status: "retryable",
        value: null,
        providerCallId: null,
        provenance: null,
        errorCode: "NAVER_RATE_LIMITED",
      },
      datalab_trend: {
        status: "succeeded",
        value: {
          points: [{ period: "2026-07-01", ratio: 50 }],
          source: "naver-datalab-search",
          collectedAt,
        },
        providerCallId: trendCallId,
        provenance: { source: "naver-datalab-search", collectedAt },
        errorCode: null,
      },
      search_api_blog_total: {
        status: "succeeded",
        value: { total: 100, source: "naver-search-blog", collectedAt },
        providerCallId: blogCallId,
        provenance: { source: "naver-search-blog", collectedAt },
        errorCode: null,
      },
    },
  });

  const observations = await pg.query<{
    count: string;
    monthly_pc_search_volume: number | null;
    monthly_mobile_search_volume: number | null;
    blog_result_count: number | null;
    trend: unknown;
  }>(
    `select count(*) over ()::text as count, monthly_pc_search_volume,
            monthly_mobile_search_volume, blog_result_count, trend
       from naver_observations
      where workspace_id = $1 and tracked_query_id = $2`,
    [workspaceId, trackedQueryId],
  );
  assert.equal(observations.rows[0]?.count, "1");
  assert.equal(observations.rows[0]?.monthly_pc_search_volume, null);
  assert.equal(observations.rows[0]?.monthly_mobile_search_volume, 120);
  assert.equal(Number(observations.rows[0]?.blog_result_count), 100);
  assert.deepEqual(observations.rows[0]?.trend, [{ period: "2026-07-01", ratio: 50 }]);

  const sources = await pg.query<{
    source: string;
    status: string;
    provider_call_id: string | null;
    error_code: string | null;
    metadata: Record<string, unknown>;
  }>(
    `select source, status, provider_call_id::text, error_code, metadata
       from naver_observation_sources
      where workspace_id = $1
      order by source`,
    [workspaceId],
  );
  assert.equal(sources.rows.length, 5);
  const monthly = sources.rows.find((row) => row.source === "search_ads_monthly_volume");
  assert.equal(monthly?.status, "succeeded", "성공 source는 retryable로 downgrade하지 않는다");
  assert.equal(monthly?.provider_call_id, monthlyCallId);
  assert.equal((monthly?.metadata.pc as { relation?: string })?.relation, "lt");
  assert.equal((monthly?.metadata.pc as { maxExclusive?: number })?.maxExclusive, 10);
  const trend = sources.rows.find((row) => row.source === "datalab_trend");
  assert.equal(trend?.status, "succeeded");
  assert.equal(trend?.error_code, null);
});

test("Pool에서는 connect로 얻은 단일 client에서 BEGIN/SET LOCAL/upsert/COMMIT 후 release한다", async () => {
  const statements: string[] = [];
  let poolQueries = 0;
  let releases = 0;
  const client = {
    query: async <T>(text: string): Promise<{ rows: T[] }> => {
      statements.push(text.trim().replace(/\s+/g, " "));
      if (/returning id::text/i.test(text)) {
        return { rows: [{ id: "54000000-0000-4000-8000-000000000999" }] as T[] };
      }
      return { rows: [] };
    },
    release: () => { releases += 1; },
  };
  const pool = {
    query: async <T>(): Promise<{ rows: T[] }> => {
      poolQueries += 1;
      throw new Error("pool.query must not be used inside a transaction");
    },
    connect: async () => client,
  };

  await createPostgresNaverObservationStore(pool).upsert(initialRecord());

  assert.equal(poolQueries, 0);
  assert.equal(releases, 1);
  assert.equal(statements[0]?.toLowerCase(), "begin");
  assert.match(statements[1] ?? "", /set_config\('app\.workspace_id'/i);
  assert.match(statements.at(-1) ?? "", /^commit$/i);
  assert.equal(statements.filter((statement) => /naver_observation_sources/i.test(statement)).length, 5);
});
