// @TASK P3-W1-T1 - Transactional outbox relay integration contract
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/outbox/relay.ts
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { PostgresOutboxRelay } from "@/server/outbox/relay";
import { CollectionOutboxRelayRuntime } from "@/worker/relay-runtime";

const databases: PGlite[] = [];
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function createDatabase(workspaceId: string, slug: string): Promise<PGlite> {
  const database = new PGlite();
  databases.push(database);
  await database.waitReady;
  await migrate(drizzle(database), { migrationsFolder });
  await database.exec(`
    create table if not exists workspace_privacy_controls (
      workspace_id uuid primary key references workspaces(id) on delete cascade,
      state text not null default 'active'
        check (state in ('active', 'blocking', 'erased'))
    );
    create or replace function privacy_workspace_lock_key(candidate uuid) returns bigint
    language sql immutable as $$
      select hashtextextended(candidate::text, 0)
    $$;
    create or replace function test_create_workspace_privacy_control() returns trigger
    language plpgsql as $$
    begin
      insert into workspace_privacy_controls (workspace_id)
      values (new.id)
      on conflict (workspace_id) do nothing;
      return new;
    end;
    $$;
    create trigger test_workspaces_create_privacy_control
      after insert on workspaces
      for each row execute function test_create_workspace_privacy_control();
  `);
  await database.query("insert into workspaces (id, name, slug) values ($1, $2, $3)", [
    workspaceId,
    `Workspace ${slug}`,
    slug,
  ]);
  return database;
}

test("동시 relay 중 하나만 outbox를 claim하고 publish replay에도 job 하나만 남는다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000001";
  const database = await createDatabase(workspaceId, "outbox-publish");
  const now = new Date("2026-08-12T03:00:00.000Z");
  const inserted = await database.query<{ id: string }>(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'tracking.created', '{"trackingId":"tracking-1"}'::jsonb, 'tracking:create:1', $2)
     returning id::text`,
    [workspaceId, now],
  );
  const relay = new PostgresOutboxRelay(database);

  const competing = await Promise.all([
    relay.claim({ workerId: "relay-a", now, leaseMs: 60_000 }),
    relay.claim({ workerId: "relay-b", now, leaseMs: 60_000 }),
  ]);
  assert.deepEqual(competing.map((events) => events.length).sort(), [0, 1]);
  const event = competing.flat()[0]!;
  assert.equal(event.id, inserted.rows[0]!.id);
  assert.equal(event.attempts, 1);

  const first = await relay.publish(event, {
    jobType: "collect.google",
    now: new Date("2026-08-12T03:00:10.000Z"),
  });
  const replay = await relay.publish(event, {
    jobType: "collect.google",
    now: new Date("2026-08-12T03:00:11.000Z"),
  });
  assert.equal(replay.id, first.id);
  assert.equal(first.workspaceId, workspaceId);
  assert.deepEqual(first.payload, { trackingId: "tracking-1" });

  const state = await database.query<{ published_at: Date | string; job_count: number }>(
    `select outbox.published_at,
            (select count(*)::int from jobs where workspace_id = $1 and type = 'collect.google') as job_count
       from outbox where id = $2`,
    [workspaceId, event.id],
  );
  assert.ok(state.rows[0]!.published_at);
  assert.equal(state.rows[0]!.job_count, 1);
});

test("job insert 뒤 publish crash가 발생해도 transaction 전체가 rollback되고 같은 lease로 복구된다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000002";
  const database = await createDatabase(workspaceId, "outbox-crash");
  const now = new Date("2026-08-12T04:00:00.000Z");
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'site.created', '{"siteId":"site-crash"}'::jsonb, 'site:create:crash', $2)`,
    [workspaceId, now],
  );
  const relay = new PostgresOutboxRelay(database);
  const event = (await relay.claim({ workerId: "relay-crash", now, leaseMs: 60_000 }))[0]!;

  await database.exec(`
    create function fail_outbox_publish() returns trigger language plpgsql as $$
    begin
      if new.published_at is not null then
        raise exception 'CRASH_AFTER_JOB_INSERT';
      end if;
      return new;
    end;
    $$;
    create trigger outbox_publish_crash before update on outbox
      for each row execute function fail_outbox_publish();
  `);
  await assert.rejects(
    relay.publish(event, {
      jobType: "collect.google",
      now: new Date("2026-08-12T04:00:10.000Z"),
    }),
    /CRASH_AFTER_JOB_INSERT/,
  );

  const rolledBack = await database.query<{ published: boolean; job_count: number }>(
    `select published_at is not null as published,
            (select count(*)::int from jobs where workspace_id = $1) as job_count
       from outbox where id = $2`,
    [workspaceId, event.id],
  );
  assert.deepEqual(rolledBack.rows, [{ published: false, job_count: 0 }]);

  await database.exec(`
    drop trigger outbox_publish_crash on outbox;
    drop function fail_outbox_publish();
  `);
  const recovered = await relay.publish(event, {
    jobType: "collect.google",
    now: new Date("2026-08-12T04:00:20.000Z"),
  });
  assert.equal(recovered.status, "queued");
});

test("만료된 마지막 outbox attempt는 명시적 DLQ가 되고 다시 claim되지 않는다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000003";
  const database = await createDatabase(workspaceId, "outbox-dead");
  const now = new Date("2026-08-12T05:00:00.000Z");
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at, max_attempts)
     values ($1, 'tracking.created', '{"trackingId":"tracking-dead"}'::jsonb, 'tracking:dead', $2, 1)`,
    [workspaceId, now],
  );
  const relay = new PostgresOutboxRelay(database);
  const event = (await relay.claim({ workerId: "relay-dead", now, leaseMs: 60_000 }))[0]!;
  await database.query("update outbox set last_error = 'PUBLISH_TIMEOUT' where id = $1", [event.id]);

  const recovered = await relay.recoverExpired({ now: new Date("2026-08-12T05:01:00.000Z") });
  assert.deepEqual(recovered.map((result) => [result.record.id, result.dead]), [[event.id, true]]);
  assert.equal(recovered[0]!.record.lastError, "LEASE_EXPIRED");
  assert.deepEqual((await relay.listDead({ workspaceId })).map((record) => record.id), [event.id]);
  assert.equal((await relay.claim({ workerId: "relay-next", now: new Date("2026-08-13T00:00:00.000Z") })).length, 0);
  const audit = await database.query<{ request_id: string | null; metadata: Record<string, unknown> }>(
    "select request_id, metadata from audit_events where entity_id = $1 and action = 'outbox.dead' order by created_at desc limit 1",
    [event.id],
  );
  assert.deepEqual(audit.rows, [{
    request_id: "relay-dead",
    metadata: {
      attempt: 1,
      leaseGeneration: 1,
      previousError: "PUBLISH_TIMEOUT",
      reason: "LEASE_EXPIRED",
    },
  }]);
});

test("job 생성 전 마지막 password reset relay lease가 만료되면 outbox 암호문을 scrub한다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000013";
  const resetId = "51000000-0000-4000-8000-000000000014";
  const database = await createDatabase(workspaceId, "password-reset-outbox-dead");
  const now = new Date("2026-08-12T05:00:00.000Z");
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at, max_attempts)
     values ($1, 'email.password_reset', $2::jsonb, $3, $4, 1)`,
    [workspaceId, JSON.stringify({
      kind: "password_reset",
      resetId,
      encryptedDelivery: "enc:v1:test:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:YWJj",
      expiresAt: "2026-08-12T05:30:00.000Z",
    }), `password-reset:${resetId}`, now],
  );
  const relay = new PostgresOutboxRelay(database);
  assert.equal(
    (await relay.claim({ workerId: "password-reset-relay-dead", now, leaseMs: 60_000 })).length,
    1,
  );

  const recovered = await relay.recoverExpired({ now: new Date("2026-08-12T05:01:00.000Z") });
  assert.equal(recovered[0]?.dead, true);
  assert.deepEqual(recovered[0]?.record.payload, {
    kind: "password_reset_scrubbed",
    resetId,
    state: "retry_exhausted",
    scrubbedAt: "2026-08-12T05:01:00+00:00",
  });
  assert.equal(JSON.stringify(recovered[0]?.record.payload).includes("enc:v1"), false);
});

test("기존 job과 canonical 요청이 충돌하면 outbox는 unpublished 상태를 유지한다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000004";
  const database = await createDatabase(workspaceId, "outbox-idempotency-conflict");
  const now = new Date("2026-08-12T06:00:00.000Z");
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'collection.google.weekly', '{"siteId":"canonical"}'::jsonb, 'weekly:conflict', $2)`,
    [workspaceId, now],
  );
  await database.query(
    `insert into jobs
       (workspace_id, type, payload, idempotency_key, priority, available_at, max_attempts)
     values ($1, 'collect.google', '{"siteId":"different"}'::jsonb,
             'outbox:collection.google.weekly:weekly:conflict', 100, $2, 5)`,
    [workspaceId, now],
  );
  const relay = new PostgresOutboxRelay(database);
  const event = (await relay.claim({ workerId: "relay-conflict", now, leaseMs: 60_000 }))[0]!;

  await assert.rejects(
    relay.publish(event, { jobType: "collect.google", maxAttempts: 5, priority: 100, now }),
    /IDEMPOTENCY_CONFLICT/u,
  );
  const state = await database.query<{ published_at: Date | null; payload: Record<string, unknown> }>(
    `select event.published_at, job.payload
       from outbox event
       join jobs job on job.workspace_id = event.workspace_id
      where event.id = $1`,
    [event.id],
  );
  assert.equal(state.rows[0]?.published_at, null);
  assert.deepEqual(state.rows[0]?.payload, { siteId: "different" });
});

test("production relay는 collection과 암호화 password reset topic을 canonical job으로 publish한다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000005";
  const database = await createDatabase(workspaceId, "outbox-production-topics");
  const now = new Date("2026-08-12T07:00:00.000Z");
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'collection.google.weekly', '{"siteId":"site-google"}'::jsonb, 'google-weekly', $2),
            ($1, 'email.password_reset', '{"kind":"password_reset","resetId":"51000000-0000-4000-8000-000000000099","encryptedDelivery":"enc:v1:test:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:YWJj","expiresAt":"2026-08-12T07:30:00.000Z"}'::jsonb, 'password-reset:51000000-0000-4000-8000-000000000099', $2)`,
    [workspaceId, now],
  );
  const runtime = new CollectionOutboxRelayRuntime({
    database,
    relayId: "relay-production",
    clock: () => now,
  });

  assert.deepEqual(await runtime.runOnce(), { claimed: 2, published: 2, failed: 0 });
  const jobs = await database.query<{ type: string; payload: Record<string, unknown> }>(
    "select type, payload from jobs where workspace_id = $1",
    [workspaceId],
  );
  assert.deepEqual(jobs.rows.map((row) => row.type).sort(), [
    "collect.google",
    "email.password_reset",
  ]);
  assert.equal(JSON.stringify(jobs.rows).includes("user@example.com"), false);
  const events = await database.query<{ topic: string; published: boolean }>(
    "select topic, published_at is not null as published from outbox order by topic",
  );
  assert.deepEqual(events.rows, [
    { topic: "collection.google.weekly", published: true },
    { topic: "email.password_reset", published: true },
  ]);
});

test("production relay는 report PDF·email outbox payload를 그대로 canonical jobs로 publish한다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000006";
  const database = await createDatabase(workspaceId, "outbox-production-reports");
  const now = new Date("2026-08-12T08:00:00.000Z");
  const reportId = "51000000-0000-4000-8000-000000000007";
  const siteId = "51000000-0000-4000-8000-000000000008";
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'report.pdf.render', $2::jsonb, 'report-pdf', $4),
            ($1, 'report.email.deliver', $3::jsonb, 'report-email', $4),
            ($1, 'report.snapshot', $5::jsonb, 'report-snapshot', $4),
            ($1, 'arbitrary.worker.topic', '{}'::jsonb, 'arbitrary', $4)`,
    [
      workspaceId,
      JSON.stringify({ reportId }),
      JSON.stringify({ reportId, recipient: "owner@example.test" }),
      now,
      JSON.stringify({ siteId, cycleMonday: "2026-08-17" }),
    ],
  );
  const runtime = new CollectionOutboxRelayRuntime({
    database,
    relayId: "relay-production-reports",
    clock: () => now,
  });

  assert.deepEqual(await runtime.runOnce(), { claimed: 3, published: 3, failed: 0 });
  const jobs = await database.query<{ type: string; payload: Record<string, unknown> }>(
    "select type, payload from jobs where workspace_id = $1 order by type",
    [workspaceId],
  );
  assert.deepEqual(jobs.rows, [{
    type: "report.email.deliver",
    payload: { reportId, recipient: "owner@example.test" },
  }, {
    type: "report.pdf.render",
    payload: { reportId },
  }, {
    type: "report.snapshot",
    payload: { siteId, cycleMonday: "2026-08-17" },
  }]);
  const events = await database.query<{ topic: string; published: boolean }>(
    "select topic, published_at is not null as published from outbox where workspace_id = $1 order by topic",
    [workspaceId],
  );
  assert.deepEqual(events.rows, [
    { topic: "arbitrary.worker.topic", published: false },
    { topic: "report.email.deliver", published: true },
    { topic: "report.pdf.render", published: true },
    { topic: "report.snapshot", published: true },
  ]);
});

// @TASK P5-PRIVACY-FENCE - Suppress blocked/erased workspace outbox publication
// @SPEC docs/ops/privacy-erasure-runbook.md
test("production relay는 blocking 또는 control 누락 outbox를 terminal suppression하고 job을 만들지 않는다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000020";
  const missingWorkspaceId = "51000000-0000-4000-8000-000000000022";
  const database = await createDatabase(workspaceId, "outbox-privacy-blocking");
  const now = new Date("2026-08-12T09:00:00.000Z");
  await database.query(
    "update workspace_privacy_controls set state = 'blocking' where workspace_id = $1",
    [workspaceId],
  );
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Missing control', 'outbox-privacy-missing')",
    [missingWorkspaceId],
  );
  await database.query(
    "delete from workspace_privacy_controls where workspace_id = $1",
    [missingWorkspaceId],
  );
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'collection.google.weekly', '{"siteId":"blocked-site"}'::jsonb, 'blocked-google', $3),
            ($2, 'collection.google.weekly', '{"siteId":"missing-site"}'::jsonb, 'missing-google', $3)`,
    [workspaceId, missingWorkspaceId, now],
  );
  const runtime = new CollectionOutboxRelayRuntime({
    database,
    relayId: "relay-privacy-blocking",
    clock: () => now,
  });

  assert.deepEqual(await runtime.runOnce(), { claimed: 0, published: 0, failed: 0 });
  const state = await database.query<{
    published: boolean;
    last_error: string | null;
    job_count: number;
  }>(
    `select published_at is not null as published, last_error,
            (select count(*)::int from jobs where workspace_id in ($1, $2)) as job_count
       from outbox where workspace_id in ($1, $2)
       order by workspace_id`,
    [workspaceId, missingWorkspaceId],
  );
  assert.deepEqual(state.rows, [
    { published: true, last_error: "WORKSPACE_PRIVACY_SUPPRESSED", job_count: 0 },
    { published: true, last_error: "WORKSPACE_PRIVACY_SUPPRESSED", job_count: 0 },
  ]);
  assert.deepEqual(await runtime.runOnce(), { claimed: 0, published: 0, failed: 0 });
});

test("production relay는 claim 직후 workspace가 erased로 전환되어도 publish 재검증으로 job을 만들지 않는다", async () => {
  const workspaceId = "51000000-0000-4000-8000-000000000021";
  const database = await createDatabase(workspaceId, "outbox-privacy-race");
  const now = new Date("2026-08-12T10:00:00.000Z");
  await database.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
     values ($1, 'collection.google.weekly', '{"siteId":"racing-site"}'::jsonb, 'racing-google', $2)`,
    [workspaceId, now],
  );
  let erasedAfterClaim = false;
  const racingDatabase = {
    async query<T = unknown>(text: string, values?: readonly unknown[]) {
      const result = await database.query<T>(text, values as unknown[] | undefined);
      if (!erasedAfterClaim && text.includes("'outbox.leased'") && result.rows.length === 1) {
        erasedAfterClaim = true;
        await database.query(
          "update workspace_privacy_controls set state = 'erased' where workspace_id = $1",
          [workspaceId],
        );
      }
      return result;
    },
  };
  const runtime = new CollectionOutboxRelayRuntime({
    database: racingDatabase,
    relayId: "relay-privacy-race",
    clock: () => now,
  });

  assert.deepEqual(await runtime.runOnce(), { claimed: 1, published: 0, failed: 0 });
  assert.equal(erasedAfterClaim, true);
  const state = await database.query<{
    published: boolean;
    last_error: string | null;
    lease_owner: string | null;
    job_count: number;
  }>(
    `select published_at is not null as published, last_error, lease_owner,
            (select count(*)::int from jobs where workspace_id = $1) as job_count
       from outbox where workspace_id = $1`,
    [workspaceId],
  );
  assert.deepEqual(state.rows, [{
    published: true,
    last_error: "WORKSPACE_PRIVACY_SUPPRESSED",
    lease_owner: null,
    job_count: 0,
  }]);
  assert.deepEqual(await runtime.runOnce(), { claimed: 0, published: 0, failed: 0 });
});
