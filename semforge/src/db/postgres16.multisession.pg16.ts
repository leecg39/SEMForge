// @TASK P3-W1-T1 - Real PostgreSQL 16 multi-session queue/provider/outbox verification
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST npm run test:pg16:docker
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { Pool, type PoolClient } from "pg";

import { PostgresProviderCallCoordinator } from "@/server/jobs/provider-calls";
import { PostgresJobQueue } from "@/server/jobs/queue";
import { PostgresOutboxRelay } from "@/server/outbox/relay";

const databaseUrl = process.env.PG16_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("PG16_TEST_DATABASE_URL is required; run npm run test:pg16:docker");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 8,
  ssl: false,
});

after(async () => {
  await pool.end();
});

function barrier(participants: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === participants) release();
    await ready;
  };
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("rollback").catch(() => undefined);
}

test("PostgreSQL 16 실제 세션은 SKIP LOCKED, provider canonical visibility, outbox crash recovery와 RLS 경계를 보장한다", async () => {
  const version = await pool.query<{ server_version: string }>("show server_version");
  assert.match(version.rows[0]!.server_version, /^16\./);

  const workspaceA = "f3000000-0000-4000-8000-000000000001";
  const workspaceB = "f3000000-0000-4000-8000-000000000002";
  await pool.query(
    `insert into workspaces (id, name, slug)
     values ($1, 'PG16 A', 'pg16-a'), ($2, 'PG16 B', 'pg16-b')`,
    [workspaceA, workspaceB],
  );
  await pool.query(
    `insert into sites (id, workspace_id, name, domain)
     values ('f3000000-0000-4000-8000-000000000011', $1, 'A', 'a.example'),
            ('f3000000-0000-4000-8000-000000000012', $2, 'B', 'b.example')`,
    [workspaceA, workspaceB],
  );

  const queue = new PostgresJobQueue(pool);
  const queued = await Promise.all([
    queue.enqueue({
      workspaceId: workspaceA,
      type: "pg16.claim",
      payload: { order: 1 },
      idempotencyKey: "claim-1",
    }),
    queue.enqueue({
      workspaceId: workspaceB,
      type: "pg16.claim",
      payload: { order: 2 },
      idempotencyKey: "claim-2",
    }),
  ]);

  const firstClient = await pool.connect();
  const secondClient = await pool.connect();
  try {
    const pids = await Promise.all([
      firstClient.query<{ pid: number }>("select pg_backend_pid() as pid"),
      secondClient.query<{ pid: number }>("select pg_backend_pid() as pid"),
    ]);
    assert.notEqual(pids[0].rows[0]!.pid, pids[1].rows[0]!.pid);

    await Promise.all([firstClient.query("begin"), secondClient.query("begin")]);
    const claimBarrier = barrier(2);
    const claims = await Promise.all([
      (async () => {
        await claimBarrier();
        return new PostgresJobQueue(firstClient).claim({ workerId: "pg16-worker-a", limit: 1 });
      })(),
      (async () => {
        await claimBarrier();
        return new PostgresJobQueue(secondClient).claim({ workerId: "pg16-worker-b", limit: 1 });
      })(),
    ]);
    assert.equal(claims[0].length, 1);
    assert.equal(claims[1].length, 1);
    assert.notEqual(claims[0][0]!.id, claims[1][0]!.id);
    assert.deepEqual(
      new Set(claims.flat().map((job) => job.id)),
      new Set(queued.map((job) => job.id)),
    );
    await Promise.all([firstClient.query("commit"), secondClient.query("commit")]);

    const providerA = new Pool({ connectionString: databaseUrl, max: 1, ssl: false });
    const providerB = new Pool({ connectionString: databaseUrl, max: 1, ssl: false });
    try {
      const request = {
        provider: "talordata",
        operation: "google.serp",
        idempotencyKey: "pg16:canonical-visibility",
        requestHash: "sha256:pg16-canonical-visibility",
        resource: "serp",
        units: 1,
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-01T00:00:00.000Z"),
        reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
      } as const;
      const reserveBarrier = barrier(2);
      const reservations = await Promise.all([
        (async () => {
          await reserveBarrier();
          return new PostgresProviderCallCoordinator(providerA, {
            workspaceId: workspaceA,
            jobId: queued[0]!.id,
            workerId: "pg16-provider-a",
          }).reserve(request);
        })(),
        (async () => {
          await reserveBarrier();
          return new PostgresProviderCallCoordinator(providerB, {
            workspaceId: workspaceA,
            jobId: queued[0]!.id,
            workerId: "pg16-provider-b",
          }).reserve(request);
        })(),
      ]);
      assert.deepEqual(
        reservations.map(({ disposition }) => disposition).sort(),
        ["execute", "in_doubt"],
      );
      assert.equal(reservations[0]!.providerCallId, reservations[1]!.providerCallId);
      assert.equal(reservations[0]!.usageReservationId, reservations[1]!.usageReservationId);
    } finally {
      await Promise.all([providerA.end(), providerB.end()]);
    }

    await pool.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key)
       values ($1, 'collection.google.weekly', '{"siteId":"pg16"}'::jsonb, 'pg16-crash')`,
      [workspaceA],
    );
    const relay = new PostgresOutboxRelay(pool);
    const initialTime = new Date("2026-08-12T00:00:00.000Z");
    const firstLease = (await relay.claim({
      workerId: "pg16-relay-crashed",
      now: initialTime,
      leaseMs: 1_000,
    }))[0]!;
    const recovered = await relay.recoverExpired({
      now: new Date("2026-08-12T00:00:02.000Z"),
    });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]!.record.id, firstLease.id);
    assert.equal(recovered[0]!.dead, false);
    const retryTime = new Date("2026-08-12T00:00:03.000Z");
    const recoveredLease = (await relay.claim({
      workerId: "pg16-relay-recovered",
      now: retryTime,
      leaseMs: 10_000,
    }))[0]!;
    const published = await relay.publish(recoveredLease, {
      jobType: "collect.google",
      now: retryTime,
    });
    assert.equal(published.type, "collect.google");
    const outboxState = await pool.query<{ published: boolean }>(
      "select published_at is not null as published from outbox where id = $1",
      [recoveredLease.id],
    );
    assert.equal(outboxState.rows[0]!.published, true);

    await firstClient.query("begin");
    await firstClient.query("set local role semforge_worker");
    await firstClient.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    const workerVisible = await firstClient.query<{ workspace_id: string }>(
      "select workspace_id::text from sites order by workspace_id",
    );
    assert.deepEqual(workerVisible.rows, [{ workspace_id: workspaceA }]);
    await assert.rejects(firstClient.query("select id from jobs limit 1"), /permission denied/);
    await rollback(firstClient);

    await secondClient.query("begin");
    await secondClient.query("set local role semforge_dispatcher");
    assert.ok((await secondClient.query("select id from jobs")).rows.length >= 1);
    await assert.rejects(secondClient.query("select id from sites limit 1"), /permission denied/);
    await rollback(secondClient);
  } finally {
    await rollback(firstClient);
    await rollback(secondClient);
    firstClient.release();
    secondClient.release();
  }
});
