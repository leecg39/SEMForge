// @TASK P3-C2-T1 - PostgreSQL GSC observation idempotent upsert
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/observation-store.ts
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { GscObservation } from "@/server/collectors/gsc/collector";
import { createPostgresGscObservationStore } from "@/server/collectors/gsc/observation-store";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const workspaceId = "53000000-0000-4000-8000-000000000001";
const siteId = "53000000-0000-4000-8000-000000000101";
const connectionId = "53000000-0000-4000-8000-000000000201";
const bindingId = "53000000-0000-4000-8000-000000000301";
const providerCallId = "53000000-0000-4000-8000-000000000401";

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
  await pg.query(
    "insert into workspaces (id, name, slug) values ($1, 'GSC Store', 'gsc-store')",
    [workspaceId],
  );
  await pg.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Site', 'example.com')",
    [siteId, workspaceId],
  );
  await pg.query(
    `insert into gsc_connections
       (id, workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at)
     values ($1, $2, 'GSC', 'enc:v1:test:a:b:c', 'enc:v1:test:a:b:c', now() + interval '1 hour')`,
    [connectionId, workspaceId],
  );
  await pg.query(
    `insert into gsc_property_bindings (id, workspace_id, site_id, connection_id, property_uri)
     values ($1, $2, $3, $4, 'sc-domain:example.com')`,
    [bindingId, workspaceId, siteId, connectionId],
  );
  await pg.query(
    `insert into provider_calls
       (id, workspace_id, provider, operation, idempotency_key, request_hash, status)
     values ($1, $2, 'google-search-console', 'aggregate', 'gsc-store-call', 'hash', 'succeeded')`,
    [providerCallId, workspaceId],
  );
});

after(async () => pg.close());

test("동일 workspace/binding/date/dimension은 한 행으로 upsert되고 provenance와 최신 metrics를 유지한다", async () => {
  const store = createPostgresGscObservationStore(pg);
  const base: GscObservation = {
    observationKey: "key-not-persisted",
    workspaceId,
    siteId,
    bindingId,
    providerCallId,
    collectedAt: "2026-08-09T23:01:00.000Z",
    dataDate: "2026-08-06",
    dimensionHash: "a".repeat(64),
    dimensions: { date: "2026-08-06" },
    clicks: 18,
    impressions: 120,
    ctr: 0.15,
    position: 5.5,
  };

  await store.upsertMany([base]);
  await store.upsertMany([{ ...base, clicks: 19, impressions: 125, ctr: 0.152 }]);

  const result = await pg.query<{
    count: string;
    clicks: number;
    impressions: number;
    ctr: number;
    provider_call_id: string;
    collected_at: Date | string;
  }>(
    `select count(*) over ()::text as count, clicks, impressions, ctr,
            provider_call_id::text, collected_at
       from gsc_observations
      where workspace_id = $1 and binding_id = $2`,
    [workspaceId, bindingId],
  );
  assert.equal(result.rows[0]?.count, "1");
  assert.equal(result.rows[0]?.clicks, 19);
  assert.equal(result.rows[0]?.impressions, 125);
  assert.equal(result.rows[0]?.ctr, 0.152);
  assert.equal(result.rows[0]?.provider_call_id, providerCallId);
  assert.equal(
    new Date(result.rows[0]!.collected_at).toISOString(),
    "2026-08-09T23:01:00.000Z",
  );
});
