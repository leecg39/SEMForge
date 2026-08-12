// @TASK P3-P1-FIX - DB-canonical weekly collection scheduling contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import {
  PostgresWeeklyCollectionScheduler,
  PostgresWeeklyReportScheduler,
} from "@/worker/scheduler";

const database = new PGlite();

async function insertSubscription(input: {
  workspaceId: string;
  suffix: string;
  status: "active" | "cancel_at_period_end" | "past_due" | "account_created";
  currentPeriodEnd?: Date;
  graceEndsAt?: Date;
}) {
  const customerId = `55000000-0000-4000-8000-${input.suffix.padStart(12, "0")}`;
  const subscriptionId = `56000000-0000-4000-8000-${input.suffix.padStart(12, "0")}`;
  await database.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, $3)",
    [customerId, input.workspaceId, `scheduler-${input.suffix}`],
  );
  await database.query(
    `insert into subscriptions
       (id, workspace_id, billing_customer_id, status, current_period_start, current_period_end, grace_ends_at)
     values ($1, $2, $3, $4, '2026-08-01T00:00:00.000Z', $5, $6)`,
    [
      subscriptionId,
      input.workspaceId,
      customerId,
      input.status,
      input.currentPeriodEnd ?? null,
      input.graceEndsAt ?? null,
    ],
  );
}

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
  await insertSubscription({ workspaceId, suffix: "1", status: "active" });
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
  await database.query("update sites set active = false where id = $1", [siteId]);
});

test("report scheduler는 KST cycleMonday와 active site로 snapshot outbox를 지연 재실행에도 한 건만 예약한다", async () => {
  const workspaceId = "54000000-0000-4000-8000-000000000011";
  const activeSiteIds = [
    "54000000-0000-4000-8000-000000000012",
    "54000000-0000-4000-8000-000000000013",
  ];
  const inactiveSiteId = "54000000-0000-4000-8000-000000000014";
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Report Scheduler', 'report-scheduler')",
    [workspaceId],
  );
  await insertSubscription({ workspaceId, suffix: "11", status: "active" });
  await database.query(
    `insert into sites (id, workspace_id, name, domain, active)
     values ($1, $4, 'Active A', 'report-a.example.com', true),
            ($2, $4, 'Active B', 'report-b.example.com', true),
            ($3, $4, 'Inactive', 'report-off.example.com', false)`,
    [...activeSiteIds, inactiveSiteId, workspaceId],
  );
  const scheduler = new PostgresWeeklyReportScheduler(database);

  assert.deepEqual(
    await scheduler.schedule({ executedAt: new Date("2026-08-16T23:00:00.000Z") }),
    { cycleMonday: "2026-08-17", reports: 2 },
  );
  assert.deepEqual(
    await scheduler.schedule({ executedAt: new Date("2026-08-17T00:30:00.000Z") }),
    { cycleMonday: "2026-08-17", reports: 0 },
  );

  const events = await database.query<{
    workspace_id: string;
    topic: string;
    payload: Record<string, unknown>;
    idempotency_key: string;
    request_hash: string;
  }>(
    `select workspace_id::text, topic, payload, idempotency_key, request_hash
      from outbox
      where workspace_id = $1 and topic = 'report.snapshot'
      order by idempotency_key`,
    [workspaceId],
  );
  assert.deepEqual(events.rows.map((event) => ({
    workspace_id: event.workspace_id,
    topic: event.topic,
    payload: event.payload,
    idempotency_key: event.idempotency_key,
  })), activeSiteIds.map((siteId) => ({
    workspace_id: workspaceId,
    topic: "report.snapshot",
    payload: { siteId, cycleMonday: "2026-08-17" },
    idempotency_key: `weekly:report:2026-08-17:${siteId}`,
  })));
  assert.ok(events.rows.every((event) => /^[0-9a-f]{64}$/u.test(event.request_hash)));
});

test("scheduler는 active 또는 아직 만료되지 않은 cancel_at_period_end workspace만 예약한다", async () => {
  const cases = [
    { suffix: "21", status: "active" as const, expected: true },
    { suffix: "22", status: "cancel_at_period_end" as const, currentPeriodEnd: new Date("2026-08-18T00:00:00.000Z"), expected: true },
    { suffix: "23", status: "cancel_at_period_end" as const, currentPeriodEnd: new Date("2026-08-16T22:59:59.000Z"), expected: false },
    { suffix: "24", status: "past_due" as const, graceEndsAt: new Date("2026-08-30T00:00:00.000Z"), expected: false },
    { suffix: "25", status: "account_created" as const, expected: false },
  ];

  for (const candidate of cases) {
    const workspaceId = `57000000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
    const siteId = `58000000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
    await database.query(
      "insert into workspaces (id, name, slug) values ($1, $2, $3)",
      [workspaceId, `Billing ${candidate.suffix}`, `billing-${candidate.suffix}`],
    );
    await insertSubscription({
      workspaceId,
      suffix: candidate.suffix,
      status: candidate.status,
      currentPeriodEnd: candidate.currentPeriodEnd,
      graceEndsAt: candidate.graceEndsAt,
    });
    await database.query(
      "insert into sites (id, workspace_id, name, domain) values ($1, $2, $3, $4)",
      [siteId, workspaceId, `Site ${candidate.suffix}`, `billing-${candidate.suffix}.example.com`],
    );
  }

  const report = await new PostgresWeeklyReportScheduler(database).schedule({
    executedAt: new Date("2026-08-16T23:00:00.000Z"),
  });
  assert.equal(report.reports, 2);

  const scheduled = await database.query<{ workspace_id: string }>(
    `select workspace_id::text from outbox
      where topic = 'report.snapshot' and workspace_id::text like '57000000-%'
      order by workspace_id`,
  );
  assert.deepEqual(
    scheduled.rows.map((row) => row.workspace_id),
    cases.filter((candidate) => candidate.expected).map(
      (candidate) => `57000000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`,
    ),
  );
});
