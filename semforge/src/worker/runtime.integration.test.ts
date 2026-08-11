// @TASK P3-W1-T1 - Worker runtime competition and graceful shutdown contract
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/worker/runtime.ts
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { defineJobHandler, jobRetryable, jobSucceeded } from "@/server/jobs/contracts";
import { PostgresJobQueue } from "@/server/jobs/queue";
import { WorkerRuntime } from "@/worker/runtime";

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

test("두 runtime이 경쟁해도 handler는 한 번만 실행되고 workspace audit과 succeeded가 남는다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000001";
  const database = await createDatabase(workspaceId, "runtime-race");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T06:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.test",
    payload: { siteId: "site-runtime" },
    idempotencyKey: "runtime-race",
    availableAt: now,
  });
  let executions = 0;
  const handler = defineJobHandler(async (_input, context) => {
    executions += 1;
    await context.audit("collector.test.completed", { resultCount: 1 });
    return jobSucceeded({ resultCount: 1 });
  });
  const options = {
    database,
    handlers: { "collect.test": handler },
    concurrency: 1,
    leaseMs: 60_000,
    heartbeatMs: 10_000,
    clock: () => now,
  } as const;
  const workerA = new WorkerRuntime({ ...options, workerId: "runtime-a" });
  const workerB = new WorkerRuntime({ ...options, workerId: "runtime-b" });

  const results = await Promise.all([workerA.runOnce(), workerB.runOnce()]);
  assert.equal(results.reduce((sum, result) => sum + result.claimed, 0), 1);
  assert.equal(executions, 1);
  assert.equal((await queue.get(workspaceId, job.id))?.status, "succeeded");

  const audit = await database.query<{ action: string; workspace_id: string }>(
    "select action, workspace_id::text from audit_events where entity_id = $1 and action = 'collector.test.completed'",
    [job.id],
  );
  assert.deepEqual(audit.rows, [{ action: "collector.test.completed", workspace_id: workspaceId }]);
});

test("shutdown은 새 claim을 중단하고 grace 안에 끝난 handler는 성공시키며 다음 job은 queued로 둔다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000002";
  const database = await createDatabase(workspaceId, "runtime-shutdown");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T07:00:00.000Z");
  const first = await queue.enqueue({
    workspaceId,
    type: "collect.slow",
    payload: { sequence: 1 },
    idempotencyKey: "runtime-shutdown-1",
    availableAt: now,
    priority: 1,
  });
  const second = await queue.enqueue({
    workspaceId,
    type: "collect.slow",
    payload: { sequence: 2 },
    idempotencyKey: "runtime-shutdown-2",
    availableAt: now,
    priority: 2,
  });
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const handler = defineJobHandler(async () => {
    notifyStarted();
    await new Promise((resolve) => setTimeout(resolve, 25));
    return jobSucceeded();
  });
  const runtime = new WorkerRuntime({
    database,
    handlers: { "collect.slow": handler },
    workerId: "runtime-shutdown",
    concurrency: 1,
    leaseMs: 60_000,
    heartbeatMs: 10_000,
    pollMs: 5,
    shutdownGraceMs: 100,
    clock: () => now,
  });
  const controller = new AbortController();
  const running = runtime.start(controller.signal);
  await started;
  controller.abort();
  await running;

  assert.equal((await queue.get(workspaceId, first.id))?.status, "succeeded");
  assert.equal((await queue.get(workspaceId, second.id))?.status, "queued");
});

test("grace를 넘긴 handler는 abort되어 retryable로 복구되고 다음 runtime이 성공시킨다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000003";
  const database = await createDatabase(workspaceId, "runtime-crash");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T08:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.crash",
    payload: { sequence: 1 },
    idempotencyKey: "runtime-crash",
    availableAt: now,
    maxAttempts: 2,
  });
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const hanging = defineJobHandler(async (_input, context) => {
    notifyStarted();
    await new Promise<void>((resolve) => {
      context.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    return jobSucceeded();
  });
  const firstRuntime = new WorkerRuntime({
    database,
    handlers: { "collect.crash": hanging },
    workerId: "runtime-crash-a",
    concurrency: 1,
    leaseMs: 60_000,
    heartbeatMs: 10_000,
    shutdownGraceMs: 10,
    clock: () => now,
  });
  const controller = new AbortController();
  const running = firstRuntime.start(controller.signal);
  await started;
  controller.abort();
  await running;
  assert.equal((await queue.get(workspaceId, job.id))?.status, "retryable");

  const recovering = new WorkerRuntime({
    database,
    handlers: { "collect.crash": defineJobHandler(async () => jobSucceeded()) },
    workerId: "runtime-crash-b",
    concurrency: 1,
    leaseMs: 60_000,
    heartbeatMs: 10_000,
    clock: () => now,
  });
  assert.equal((await recovering.runOnce()).claimed, 1);
  assert.equal((await queue.get(workspaceId, job.id))?.status, "succeeded");
});

test("등록되지 않은 job type은 실행하지 않고 즉시 DLQ로 보낸다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000004";
  const database = await createDatabase(workspaceId, "runtime-unknown");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T09:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.unknown",
    payload: { siteId: "site-unknown" },
    idempotencyKey: "runtime-unknown",
    availableAt: now,
  });
  const runtime = new WorkerRuntime({
    database,
    handlers: {},
    workerId: "runtime-unknown",
    clock: () => now,
  });

  const result = await runtime.runOnce();

  assert.deepEqual(result, {
    claimed: 1,
    succeeded: 0,
    retryable: 0,
    dead: 1,
    leaseLost: 0,
  });
  assert.equal((await queue.get(workspaceId, job.id))?.lastError, "HANDLER_NOT_REGISTERED");
});

test("handler context는 고정 workspace의 audit, providerCalls, clock과 lease를 연결한다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000005";
  const database = await createDatabase(workspaceId, "runtime-context");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T10:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.context",
    payload: { siteId: "site-context" },
    idempotencyKey: "runtime-context",
    availableAt: now,
  });
  const handler = defineJobHandler(async (input, context) => {
    assert.equal(input.id, context.jobId);
    assert.equal(input.workspaceId, context.workspaceId);
    assert.equal(context.workspaceId, workspaceId);
    assert.equal(context.attempt, 1);
    assert.equal(context.lease.owner, "runtime-context");
    assert.equal(context.now().toISOString(), now.toISOString());
    const reservation = await context.providerCalls.reserve({
      provider: "talordata",
      operation: "google.serp",
      idempotencyKey: "runtime-context:serp",
      requestHash: "sha256:runtime-context",
      resource: "serp",
      units: 1,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
    });
    assert.equal(reservation.disposition, "execute");
    await context.providerCalls.succeed({
      providerCallId: reservation.providerCallId,
      usageReservationId: reservation.usageReservationId,
      responseMetadata: { source: "runtime-context" },
      costUnits: 1,
    });
    await context.audit("collector.context.completed", { siteId: input.payload.siteId });
    return jobSucceeded({ providerCallId: reservation.providerCallId });
  });
  const runtime = new WorkerRuntime({
    database,
    handlers: { "collect.context": handler },
    workerId: "runtime-context",
    clock: () => now,
  });

  const result = await runtime.runOnce();

  assert.equal(result.succeeded, 1);
  assert.equal((await queue.get(workspaceId, job.id))?.status, "succeeded");
  const state = await database.query<{
    call_status: string;
    reservation_status: string;
    audit_workspace_id: string;
  }>(
    `select
       (select status from provider_calls where workspace_id = $1) as call_status,
       (select status from usage_reservations where workspace_id = $1) as reservation_status,
       (select workspace_id::text from audit_events
         where action = 'collector.context.completed' and entity_id = $2) as audit_workspace_id`,
    [workspaceId, job.id],
  );
  assert.deepEqual(state.rows, [{
    call_status: "succeeded",
    reservation_status: "consumed",
    audit_workspace_id: workspaceId,
  }]);
});

test("heartbeat가 lease fence를 잃으면 handler signal을 abort하고 stale 완료를 기록하지 않는다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000006";
  const database = await createDatabase(workspaceId, "runtime-lease-lost");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T11:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.lease-lost",
    payload: { siteId: "site-lease-lost" },
    idempotencyKey: "runtime-lease-lost",
    availableAt: now,
  });
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let handlerAborted = false;
  const handler = defineJobHandler(async (_input, context) => {
    notifyStarted();
    await new Promise<void>((resolve) => {
      context.signal.addEventListener("abort", () => {
        handlerAborted = true;
        resolve();
      }, { once: true });
    });
    return jobSucceeded();
  });
  const runtime = new WorkerRuntime({
    database,
    handlers: { "collect.lease-lost": handler },
    workerId: "runtime-lease-lost",
    leaseMs: 1_000,
    heartbeatMs: 5,
    clock: () => now,
  });

  const running = runtime.runOnce();
  await started;
  await database.query(
    `update jobs
        set lease_owner = 'runtime-stealer', lease_token = gen_random_uuid(),
            lease_generation = lease_generation + 1,
            lease_expires_at = $2
      where id = $1`,
    [job.id, new Date("2026-08-12T11:01:00.000Z")],
  );
  const result = await running;

  assert.equal(handlerAborted, true);
  assert.equal(result.leaseLost, 1);
  assert.equal(result.succeeded, 0);
  const stored = await database.query<{ status: string; lease_owner: string | null }>(
    "select status, lease_owner from jobs where id = $1",
    [job.id],
  );
  assert.deepEqual(stored.rows, [{ status: "leased", lease_owner: "runtime-stealer" }]);
});

test("retryable 결과는 지수 backoff를 적용하고 maxAttempts에서는 dead가 된다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000007";
  const database = await createDatabase(workspaceId, "runtime-backoff");
  const queue = new PostgresJobQueue(database);
  let now = new Date("2026-08-12T12:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.retry",
    payload: { siteId: "site-retry" },
    idempotencyKey: "runtime-backoff",
    availableAt: now,
    maxAttempts: 2,
  });
  const runtime = new WorkerRuntime({
    database,
    handlers: { "collect.retry": defineJobHandler(async () => jobRetryable("RATE_LIMITED")) },
    workerId: "runtime-backoff",
    retryBackoffMs: 100,
    maxRetryBackoffMs: 100,
    clock: () => now,
  });

  const first = await runtime.runOnce();
  assert.equal(first.retryable, 1);
  const retryable = await queue.get(workspaceId, job.id);
  assert.equal(retryable?.availableAt.toISOString(), "2026-08-12T12:00:00.100Z");

  now = new Date("2026-08-12T12:00:00.100Z");
  const second = await runtime.runOnce();
  assert.equal(second.dead, 1);
  assert.equal((await queue.get(workspaceId, job.id))?.status, "dead");
});

test("shutdown은 여러 inflight를 grace 동안 함께 완료하고 미claim 작업을 남긴다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000008";
  const database = await createDatabase(workspaceId, "runtime-multi-shutdown");
  const queue = new PostgresJobQueue(database);
  const now = new Date("2026-08-12T13:00:00.000Z");
  const jobs = await Promise.all([1, 2, 3].map((sequence) => queue.enqueue({
    workspaceId,
    type: "collect.multi",
    payload: { sequence },
    idempotencyKey: `runtime-multi-${sequence}`,
    availableAt: now,
    priority: sequence,
  })));
  let startedCount = 0;
  let notifyInflight!: () => void;
  const inflight = new Promise<void>((resolve) => {
    notifyInflight = resolve;
  });
  const handler = defineJobHandler(async () => {
    startedCount += 1;
    if (startedCount === 2) notifyInflight();
    await new Promise((resolve) => setTimeout(resolve, 25));
    return jobSucceeded();
  });
  const runtime = new WorkerRuntime({
    database,
    handlers: { "collect.multi": handler },
    workerId: "runtime-multi",
    concurrency: 2,
    pollMs: 5,
    shutdownGraceMs: 100,
    clock: () => now,
  });
  const controller = new AbortController();
  const running = runtime.start(controller.signal);
  await inflight;
  controller.abort();
  await running;

  assert.equal(startedCount, 2);
  assert.equal((await queue.get(workspaceId, jobs[0]!.id))?.status, "succeeded");
  assert.equal((await queue.get(workspaceId, jobs[1]!.id))?.status, "succeeded");
  assert.equal((await queue.get(workspaceId, jobs[2]!.id))?.status, "queued");
});

test("crashed worker의 만료 lease를 다음 runtime이 회수해 성공시킨다", async () => {
  const workspaceId = "53000000-0000-4000-8000-000000000009";
  const database = await createDatabase(workspaceId, "runtime-expired-recovery");
  const queue = new PostgresJobQueue(database);
  const leasedAt = new Date("2026-08-12T14:00:00.000Z");
  const job = await queue.enqueue({
    workspaceId,
    type: "collect.recover",
    payload: { siteId: "site-recover" },
    idempotencyKey: "runtime-expired-recovery",
    availableAt: leasedAt,
    maxAttempts: 2,
  });
  await queue.claim({ workerId: "runtime-crashed", now: leasedAt, leaseMs: 1_000 });
  const recoveredAt = new Date("2026-08-12T14:00:01.000Z");
  const runtime = new WorkerRuntime({
    database,
    handlers: { "collect.recover": defineJobHandler(async () => jobSucceeded()) },
    workerId: "runtime-recovery",
    leaseMs: 1_000,
    clock: () => recoveredAt,
  });

  const result = await runtime.runOnce();

  assert.equal(result.claimed, 1);
  assert.equal(result.succeeded, 1);
  const stored = await queue.get(workspaceId, job.id);
  assert.equal(stored?.status, "succeeded");
  assert.equal(stored?.attempts, 2);
});
