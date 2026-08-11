// @TASK P3-P1-FIX - DB-canonical weekly collection scheduling contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { PostgresWeeklyCollectionScheduler } from "@/worker/scheduler";

const database = new PGlite();

before(async () => {
  await database.waitReady;
  await migrate(drizzle(database), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
});

after(async () => database.close());

test("scheduler는 DB의 active site/query/binding만 canonical payload로 outbox에 멱등 예약한다", async () => {
  const workspaceId = "54000000-0000-4000-8000-000000000001";
  const siteId = "54000000-0000-4000-8000-000000000002";
  const rankId = "54000000-0000-4000-8000-000000000003";
  const aioId = "54000000-0000-4000-8000-000000000004";
  const connectionId = "54000000-0000-4000-8000-000000000005";
  const bindingId = "54000000-0000-4000-8000-000000000006";
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Scheduler', 'scheduler')",
    [workspaceId],
  );
  await database.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Canonical', 'Example.COM.')",
    [siteId, workspaceId],
  );
  await database.query(
    `insert into tracked_queries
       (id, workspace_id, site_id, type, query, normalized_query)
     values ($1, $3, $4, 'rank', '  Weekly   SEO  ', 'weekly seo'),
            ($2, $3, $4, 'aio', 'AI Overview', 'ai overview')`,
    [rankId, aioId, workspaceId, siteId],
  );
  await database.query(
    `insert into gsc_connections
       (id, workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at)
     values ($1, $2, 'Canonical', 'enc:v1:key:iv:tag:cipher', 'enc:v1:key:iv:tag:cipher', $3)`,
    [connectionId, workspaceId, new Date("2026-09-01T00:00:00.000Z")],
  );
  await database.query(
    `insert into gsc_property_bindings
       (id, workspace_id, site_id, connection_id, property_uri)
     values ($1, $2, $3, $4, 'sc-domain:example.com')`,
    [bindingId, workspaceId, siteId, connectionId],
  );
  const scheduler = new PostgresWeeklyCollectionScheduler(database);
  const executedAt = new Date("2026-08-12T00:00:00.000Z");

  assert.deepEqual(await scheduler.schedule({ executedAt }), {
    google: 1,
    naver: 1,
    gsc: 1,
  });
  assert.deepEqual(await scheduler.schedule({ executedAt }), {
    google: 0,
    naver: 0,
    gsc: 0,
  });

  const events = await database.query<{
    topic: string;
    payload: Record<string, unknown>;
    request_hash: string;
  }>("select topic, payload, request_hash from outbox order by topic");
  assert.equal(events.rows.length, 3);
  assert.ok(events.rows.every((event) => /^[0-9a-f]{64}$/u.test(event.request_hash)));
  const google = events.rows.find((event) => event.topic === "collection.google.weekly")!;
  assert.deepEqual(google.payload, {
    siteId,
    siteDomain: "Example.COM.",
    observedAt: executedAt.toISOString(),
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    reservationExpiresAt: "2026-08-13T00:00:00.000Z",
    maxProviderCalls: 2,
    maxBillableUnits: 3,
    queries: [
      { workspaceId, siteId, trackedQueryId: rankId, type: "rank", query: "Weekly SEO" },
      { workspaceId, siteId, trackedQueryId: aioId, type: "aio", query: "AI Overview" },
    ],
  });
  const gsc = events.rows.find((event) => event.topic === "collection.gsc.weekly")!;
  assert.deepEqual(gsc.payload, { siteId, bindingId, executedAt: executedAt.toISOString() });
});
