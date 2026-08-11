// @TASK P3-C1-T1 - PostgreSQL Google observation upsert contract
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/collectors/google/observation-store.integration.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { createPostgresGoogleObservationRepository } from "@/server/collectors/google/observation-store";
import type { GoogleObservationBatch } from "@/server/collectors/google/collector";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const workspaceA = "40000000-0000-4000-8000-000000000001";
const workspaceB = "40000000-0000-4000-8000-000000000002";
const siteA = "40000000-0000-4000-8000-000000000011";
const siteB = "40000000-0000-4000-8000-000000000012";
const rankA = "40000000-0000-4000-8000-000000000021";
const aioA = "40000000-0000-4000-8000-000000000022";
const rankB = "40000000-0000-4000-8000-000000000023";
const providerCallA = "40000000-0000-4000-8000-000000000031";
const providerCallB = "40000000-0000-4000-8000-000000000032";
const providerCallWrongProvider = "40000000-0000-4000-8000-000000000033";
const providerCallWrongOperation = "40000000-0000-4000-8000-000000000034";
const providerCallStarted = "40000000-0000-4000-8000-000000000035";
const observedAt = "2026-08-09T09:00:00.000Z";

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    `insert into workspaces (id, name, slug) values
       ($1, 'Google Collector A', 'google-collector-a'),
       ($2, 'Google Collector B', 'google-collector-b')`,
    [workspaceA, workspaceB],
  );
  await pg.query(
    `insert into sites (id, workspace_id, name, domain) values
       ($1, $2, 'Site A', 'a.example.com'),
       ($3, $4, 'Site B', 'b.example.com')`,
    [siteA, workspaceA, siteB, workspaceB],
  );
  await pg.query(
    `insert into tracked_queries
       (id, workspace_id, site_id, type, query, normalized_query) values
       ($1, $2, $3, 'rank', 'Rank A', 'rank a'),
       ($4, $2, $3, 'aio', 'AIO A', 'aio a'),
       ($5, $6, $7, 'rank', 'Rank B', 'rank b')`,
    [rankA, workspaceA, siteA, aioA, rankB, workspaceB, siteB],
  );
  await pg.query(
    `insert into provider_calls
       (id, workspace_id, provider, operation, idempotency_key, request_hash, status) values
       ($1, $2, 'talordata', 'google_serp_aio', 'call-a', 'hash-a', 'succeeded'),
       ($3, $4, 'talordata', 'google_serp_rank', 'call-b', 'hash-b', 'succeeded')`,
    [providerCallA, workspaceA, providerCallB, workspaceB],
  );
  await pg.query(
    `insert into provider_calls
       (id, workspace_id, provider, operation, idempotency_key, request_hash, status) values
       ($1, $2, 'naver', 'blog_search', 'wrong-provider', 'hash-wrong-provider', 'succeeded'),
       ($3, $2, 'talordata', 'naver_blog', 'wrong-operation', 'hash-wrong-operation', 'succeeded'),
       ($4, $2, 'talordata', 'google_serp_rank', 'started-call', 'hash-started', 'started')`,
    [
      providerCallWrongProvider,
      workspaceA,
      providerCallWrongOperation,
      providerCallStarted,
    ],
  );
});

after(async () => pg.close());

function batch(overrides: Partial<GoogleObservationBatch> = {}): GoogleObservationBatch {
  return {
    workspaceId: workspaceA,
    siteId: siteA,
    providerCallId: providerCallA,
    observedAt,
    collectedAt: "2026-08-09T09:00:03.000Z",
    provenance: {
      source: "talordata",
      engine: "google",
      country: "kr",
      language: "ko",
      device: "desktop",
      window: 100,
    },
    rankObservations: [
      {
        trackedQueryId: rankA,
        position: 37,
        outsideTop100: false,
        resultUrl: "https://a.example.com/rank",
        resultTitle: "Rank A",
      },
    ],
    aioObservations: [
      {
        trackedQueryId: aioA,
        presence: "present",
        answerText: null,
        citations: [
          { url: "https://a.example.com/aio", title: "A", position: 1 },
          { url: "https://source.example/aio", title: "Source", position: 2 },
        ],
      },
    ],
    ...overrides,
  };
}

test("동일 관측 시각 재실행은 rank/AIO 행을 늘리지 않고 인용을 원자적으로 교체한다", async () => {
  const repository = createPostgresGoogleObservationRepository(pg);
  await repository.upsert(batch());
  await repository.upsert(
    batch({
      rankObservations: [
        {
          trackedQueryId: rankA,
          position: null,
          outsideTop100: true,
          resultUrl: null,
          resultTitle: null,
        },
      ],
      aioObservations: [
        {
          trackedQueryId: aioA,
          presence: "unknown",
          answerText: null,
          citations: [
            { url: "https://replacement.example/aio", title: "Replacement", position: 1 },
          ],
        },
      ],
    }),
  );

  const ranks = await pg.query<{
    position: number | null;
    result_url: string | null;
  }>("select position, result_url from rank_observations where workspace_id = $1", [workspaceA]);
  const aio = await pg.query<{ id: string; presence: string }>(
    "select id::text, presence from aio_observations where workspace_id = $1",
    [workspaceA],
  );
  const citations = await pg.query<{ url: string; position: number }>(
    "select url, position from aio_citations where workspace_id = $1 order by position",
    [workspaceA],
  );

  assert.deepEqual(ranks.rows, [{ position: null, result_url: null }]);
  assert.equal(aio.rows.length, 1);
  assert.equal(aio.rows[0]?.presence, "unknown");
  assert.deepEqual(citations.rows, [
    { url: "https://replacement.example/aio", position: 1 },
  ]);
});

test("upsert conflict 경로도 다른 workspace의 site/query/provider call을 혼합하지 못한다", async () => {
  const repository = createPostgresGoogleObservationRepository(pg);
  await assert.rejects(
    repository.upsert(
      batch({
        siteId: siteB,
        providerCallId: providerCallB,
        rankObservations: [
          {
            trackedQueryId: rankB,
            position: 1,
            outsideTop100: false,
            resultUrl: "https://b.example.com",
            resultTitle: "Cross tenant",
          },
        ],
        aioObservations: [],
      }),
    ),
    /workspace\/site\/query\/provider boundary/i,
  );

  const count = await pg.query<{ count: number }>(
    "select count(*)::int as count from rank_observations where workspace_id = $1",
    [workspaceB],
  );
  assert.equal(count.rows[0]?.count, 0);
});

test("같은 workspace라도 TalorData Google succeeded call이 아니면 관측값에 연결하지 않는다", async () => {
  const repository = createPostgresGoogleObservationRepository(pg);
  for (const [providerCallId, suffix] of [
    [providerCallWrongProvider, "wrong-provider"],
    [providerCallWrongOperation, "wrong-operation"],
    [providerCallStarted, "started"],
  ] as const) {
    await assert.rejects(
      repository.upsert(
        batch({
          providerCallId,
          observedAt: `2026-08-${suffix === "wrong-provider" ? "10" : suffix === "wrong-operation" ? "11" : "12"}T09:00:00.000Z`,
          aioObservations: [],
        }),
      ),
      /workspace\/site\/query\/provider boundary/i,
    );
  }
});

test("pg Pool source는 하나의 leased client에서 BEGIN, RLS 설정, 쓰기, COMMIT을 끝내고 release한다", async () => {
  const events: string[] = [];
  const client = {
    async query<T = unknown>(text: string): Promise<{ rows: T[] }> {
      events.push(text.replace(/\s+/gu, " ").trim());
      if (text.includes("as site_found")) {
        return { rows: [{ site_found: true, provider_found: true }] as T[] };
      }
      return { rows: [] };
    },
    release() {
      events.push("release");
    },
  };
  const pool = {
    async query<T = unknown>(): Promise<{ rows: T[] }> {
      throw new Error("top-level pool.query must not be used inside a transaction");
    },
    async connect() {
      events.push("connect");
      return client;
    },
  };

  const repository = createPostgresGoogleObservationRepository(pool);
  await repository.upsert(batch({ rankObservations: [], aioObservations: [] }));

  assert.equal(events[0], "connect");
  assert.equal(events[1], "begin");
  assert.match(events[2] ?? "", /set_config\('app\.workspace_id'/u);
  assert.match(events[3] ?? "", /as site_found/u);
  assert.equal(events[4], "commit");
  assert.equal(events[5], "release");
});

test("leased client의 경계 검증 실패는 같은 client에서 rollback 후 반드시 release한다", async () => {
  const events: string[] = [];
  const client = {
    async query<T = unknown>(text: string): Promise<{ rows: T[] }> {
      events.push(text.replace(/\s+/gu, " ").trim());
      if (text.includes("as site_found")) {
        return { rows: [{ site_found: false, provider_found: true }] as T[] };
      }
      return { rows: [] };
    },
    release() {
      events.push("release");
    },
  };
  const pool = {
    async query<T = unknown>(): Promise<{ rows: T[] }> {
      throw new Error("top-level pool.query must not be used inside a transaction");
    },
    async connect() {
      events.push("connect");
      return client;
    },
  };

  const repository = createPostgresGoogleObservationRepository(pool);
  await assert.rejects(
    repository.upsert(batch({ rankObservations: [], aioObservations: [] })),
    /workspace\/site\/query\/provider boundary/i,
  );

  assert.equal(events.at(-2), "rollback");
  assert.equal(events.at(-1), "release");
});
