// @TASK P3-W1-T1 - PostgreSQL lease job queue integration contract
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/queue.ts
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { PostgresJobQueue } from "@/server/jobs/queue";

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
  await database.query("insert into workspaces (id, name, slug) values ($1, $2, $3)", [
    workspaceId,
    `Workspace ${slug}`,
    slug,
  ]);
  return database;
}

test("동일한 canonical enqueue replay와 claim은 workspace가 고정된 lease를 반환한다", async () => {
  const workspaceId = "50000000-0000-4000-8000-000000000001";
  const database = await createDatabase(workspaceId, "queue-enqueue");
  const queue = new PostgresJobQueue(database);
  const availableAt = new Date("2026-08-12T00:00:00.000Z");

  const first = await queue.enqueue({
    workspaceId,
    type: "collect.google",
    payload: { siteId: "site-original" },
    idempotencyKey: "weekly:site-1:2026-08-10",
    availableAt,
  });
  const replay = await queue.enqueue({
    workspaceId,
    type: "collect.google",
    payload: { siteId: "site-original" },
    idempotencyKey: "weekly:site-1:2026-08-10",
    availableAt,
  });

  assert.equal(replay.id, first.id);
  assert.deepEqual(replay.payload, { siteId: "site-original" });

  const claimed = await queue.claim({
    workerId: "worker-a",
    limit: 1,
    leaseMs: 60_000,
    now: availableAt,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]!.workspaceId, workspaceId);
  assert.equal(claimed[0]!.status, "leased");
  assert.equal(claimed[0]!.attempts, 1);
  assert.equal(claimed[0]!.lease.owner, "worker-a");
  assert.equal(claimed[0]!.lease.generation, 1);
  assert.equal(claimed[0]!.lease.expiresAt.toISOString(), "2026-08-12T00:01:00.000Z");
});

test("동시 worker 중 하나만 claim하고 만료 뒤 재임대한 generation이 이전 worker를 fence한다", async () => {
  const workspaceId = "50000000-0000-4000-8000-000000000002";
  const database = await createDatabase(workspaceId, "queue-fencing");
  const queue = new PostgresJobQueue(database);
  const queuedAt = new Date("2026-08-12T01:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.naver",
    payload: { siteId: "site-2" },
    idempotencyKey: "weekly:site-2:2026-08-10",
    availableAt: queuedAt,
  });

  const competing = await Promise.all([
    queue.claim({ workerId: "worker-a", now: queuedAt, leaseMs: 60_000 }),
    queue.claim({ workerId: "worker-b", now: queuedAt, leaseMs: 60_000 }),
  ]);
  assert.deepEqual(competing.map((jobs) => jobs.length).sort(), [0, 1]);
  const firstLease = competing.flat()[0]!;

  const reclaimed = await queue.claim({
    workerId: "worker-c",
    now: new Date("2026-08-12T01:01:00.000Z"),
    leaseMs: 60_000,
  });
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0]!.id, job.id);
  assert.equal(reclaimed[0]!.attempts, 2);
  assert.equal(reclaimed[0]!.lease.generation, 2);
  assert.notEqual(reclaimed[0]!.lease.token, firstLease.lease.token);

  await assert.rejects(
    queue.succeed(firstLease, { now: new Date("2026-08-12T01:01:01.000Z") }),
    /LEASE_LOST/,
  );

  const heartbeat = await queue.heartbeat(reclaimed[0]!, {
    now: new Date("2026-08-12T01:01:30.000Z"),
    leaseMs: 60_000,
  });
  assert.equal(heartbeat.lease.expiresAt.toISOString(), "2026-08-12T01:02:30.000Z");

  const succeeded = await queue.succeed(heartbeat, {
    now: new Date("2026-08-12T01:02:00.000Z"),
    metadata: { observations: 4 },
  });
  assert.equal(succeeded.status, "succeeded");
  assert.equal((await queue.get(workspaceId, job.id))?.status, "succeeded");
});

test("retryable 작업은 backoff 뒤 재시도하고 max attempts와 crash expiry에서 DLQ로 간다", async () => {
  const workspaceId = "50000000-0000-4000-8000-000000000003";
  const database = await createDatabase(workspaceId, "queue-retry-dead");
  const queue = new PostgresJobQueue(database);
  const startedAt = new Date("2026-08-12T02:00:00.000Z");
  const retryAt = new Date("2026-08-12T02:02:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.gsc",
    payload: { siteId: "site-3" },
    idempotencyKey: "weekly:site-3:2026-08-10",
    availableAt: startedAt,
    maxAttempts: 2,
  });

  const first = (await queue.claim({ workerId: "worker-a", now: startedAt, leaseMs: 60_000 }))[0]!;
  const retryable = await queue.fail(first, {
    now: new Date("2026-08-12T02:00:30.000Z"),
    error: "PROVIDER_RATE_LIMITED",
    retryAt,
    retryable: true,
  });
  assert.equal(retryable.status, "retryable");
  assert.equal(retryable.availableAt.toISOString(), retryAt.toISOString());
  assert.equal((await queue.claim({ workerId: "worker-b", now: new Date("2026-08-12T02:01:59.000Z") })).length, 0);

  const second = (await queue.claim({ workerId: "worker-b", now: retryAt, leaseMs: 60_000 }))[0]!;
  const dead = await queue.fail(second, {
    now: new Date("2026-08-12T02:02:10.000Z"),
    error: "PROVIDER_RATE_LIMITED",
    retryable: true,
  });
  assert.equal(dead.status, "dead");
  assert.equal(dead.attempts, 2);
  assert.equal((await queue.get(workspaceId, job.id))?.lastError, "PROVIDER_RATE_LIMITED");
  assert.equal((await queue.claim({ workerId: "worker-c", now: new Date("2026-08-13T00:00:00.000Z") })).length, 0);

  const crashed = await queue.enqueue({
    workspaceId,
    type: "collect.naver",
    payload: { siteId: "site-crash" },
    idempotencyKey: "weekly:site-crash:2026-08-10",
    availableAt: startedAt,
    maxAttempts: 1,
  });
  await queue.claim({ workerId: "worker-crash", now: startedAt, leaseMs: 60_000 });
  await database.query("update jobs set last_error = 'PROVIDER_RATE_LIMITED' where id = $1", [
    crashed.id,
  ]);
  const recovered = await queue.recoverExpired({ now: new Date("2026-08-12T02:01:00.000Z") });
  assert.deepEqual(recovered.map((record) => [record.id, record.status]), [[crashed.id, "dead"]]);
  assert.equal(recovered[0]!.lastError, "LEASE_EXPIRED");
  const recoveryAudit = await database.query<{
    request_id: string | null;
    metadata: Record<string, unknown>;
  }>(
    "select request_id, metadata from audit_events where entity_id = $1 and action = 'job.dead' order by created_at desc limit 1",
    [crashed.id],
  );
  assert.deepEqual(recoveryAudit.rows, [{
    request_id: "worker-crash",
    metadata: {
      attempt: 1,
      leaseGeneration: 1,
      previousError: "PROVIDER_RATE_LIMITED",
      reason: "LEASE_EXPIRED",
    },
  }]);
});

test("같은 idempotency key의 canonical 요청이 다르면 기존 job을 재사용하지 않는다", async () => {
  const workspaceId = "50000000-0000-4000-8000-000000000004";
  const database = await createDatabase(workspaceId, "queue-idempotency-conflict");
  const queue = new PostgresJobQueue(database);
  const input = {
    workspaceId,
    type: "collect.google",
    payload: { siteId: "site-original", observedAt: "2026-08-12T00:00:00.000Z" },
    idempotencyKey: "weekly:site-1:2026-08-10",
    maxAttempts: 5,
    priority: 100,
  } as const;
  const first = await queue.enqueue(input);
  assert.match(first.requestHash, /^[0-9a-f]{64}$/u);

  await assert.rejects(
    queue.enqueue({ ...input, payload: { ...input.payload, siteId: "site-conflict" } }),
    /IDEMPOTENCY_CONFLICT/u,
  );
  await assert.rejects(
    queue.enqueue({ ...input, maxAttempts: 6 }),
    /IDEMPOTENCY_CONFLICT/u,
  );
  assert.deepEqual((await queue.get(workspaceId, first.id))?.payload, input.payload);
});
