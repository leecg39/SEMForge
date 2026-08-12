// @TASK P5-PRIVACY-BARRIER - Actual PostgreSQL 16 erasure/worker concurrency proof
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST bash scripts/test-privacy-barrier-pg16.sh
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { Pool, type PoolClient } from "pg";

import { defineJobHandler, jobSucceeded } from "@/server/jobs/contracts";
import { PostgresJobQueue, type SqlQueryable } from "@/server/jobs/queue";
import {
  createWorkspacePrivacyWorkerExecutionScope,
  PostgresWorkspacePrivacyFence,
  type WorkspacePrivacyFenceConnection,
} from "@/server/privacy/fence";
import { WorkerRuntime } from "@/worker/runtime";

const databaseUrl = process.env.PG16_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("PG16_TEST_DATABASE_URL is required; run scripts/test-privacy-barrier-pg16.sh");
}

const admin = new Pool({
  connectionString: databaseUrl,
  application_name: "pg16-privacy-barrier-admin",
  max: 4,
  ssl: false,
});

after(async () => {
  await admin.end();
});

interface Deferred<T = void> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function roleDatabaseUrl(role: string): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

function rolePool(role: string, applicationName: string): Pool {
  return new Pool({
    connectionString: roleDatabaseUrl(role),
    application_name: applicationName,
    max: 1,
    ssl: false,
  });
}

async function waitFor<T>(
  operation: () => Promise<T | undefined>,
  description: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${description}`, { cause: lastError });
}

async function applicationPid(applicationName: string): Promise<number | undefined> {
  const result = await admin.query<{ pid: number }>(
    `select pid
       from pg_stat_activity
      where datname = current_database() and application_name = $1
      order by backend_start desc
      limit 1`,
    [applicationName],
  );
  return result.rows[0]?.pid;
}

async function advisoryLockCount(applicationPrefix: string): Promise<number> {
  const result = await admin.query<{ count: number }>(
    `select count(*)::int as count
       from pg_locks lock
       join pg_stat_activity activity on activity.pid = lock.pid
      where lock.locktype = 'advisory'
        and activity.application_name like $1`,
    [`${applicationPrefix}%`],
  );
  return result.rows[0]!.count;
}

async function openApprovedDeletion(input: {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly operatorId: string;
}): Promise<string> {
  const operator = rolePool("semforge_operator", "pg16-privacy-barrier-operator");
  const privacy = rolePool("semforge_privacy", "pg16-privacy-barrier-prepare");
  try {
    const opened = await operator.query<{ id: string }>(
      `select id::text
         from privacy_open_request($1::uuid, $2::text, 'deletion', $3::text, now())`,
      [input.workspaceId, input.requestId, input.operatorId],
    );
    const requestUuid = opened.rows[0]!.id;
    const client = await privacy.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.workspace_id', $1, true)", [input.workspaceId]);
      await client.query(
        `select *
           from privacy_claim_request($1::uuid, $2::text, 'deletion', $3::text, now())`,
        [input.workspaceId, input.requestId, input.operatorId],
      );
      await client.query(
        `select privacy_set_request_storage_manifest(
           $1::uuid, $2::uuid, $3::text,
           jsonb_build_object('storagePrefix', 'reports/' || $1::text || '/', 'storageKeyHashes', '[]'::jsonb)
         )`,
        [input.workspaceId, requestUuid, input.operatorId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return requestUuid;
  } finally {
    await Promise.all([operator.end(), privacy.end()]);
  }
}

test("PostgreSQL 16 worker shared fence와 승인 삭제 retry는 crash 뒤에도 원자 장벽을 보장한다", {
  timeout: 60_000,
}, async () => {
  const version = await admin.query<{ server_version: string }>("show server_version");
  assert.match(version.rows[0]!.server_version, /^16\./u);

  const workspaceId = "fb000000-0000-4000-8000-000000000001";
  const requestId = "pg16-privacy-barrier-delete";
  const operatorId = "operator:pg16-barrier";
  await admin.query(
    `insert into workspaces (id, name, slug)
     values ($1, 'PG16 Privacy Barrier', 'pg16-privacy-barrier')`,
    [workspaceId],
  );
  const requestUuid = await openApprovedDeletion({ workspaceId, requestId, operatorId });

  const dispatcher = rolePool("semforge_dispatcher", "pg16-privacy-barrier-dispatcher");
  const tenant = rolePool("semforge_worker", "pg16-privacy-barrier-tenant");
  const activeFencePool = rolePool("semforge_worker", "pg16-privacy-barrier-active-fence");
  const lateDispatcher = rolePool("semforge_dispatcher", "pg16-privacy-barrier-late-dispatcher");
  const lateTenant = rolePool("semforge_worker", "pg16-privacy-barrier-late-tenant");
  const lateFencePool = rolePool("semforge_worker", "pg16-privacy-barrier-late-fence");
  const privacyPool = rolePool("semforge_privacy", "pg16-privacy-barrier-delete");
  const pools = [
    dispatcher, tenant, activeFencePool, lateDispatcher, lateTenant, lateFencePool, privacyPool,
  ];

  try {
    const delegateStarted = deferred();
    const releaseDelegate = deferred();
    const finalizationEntered = deferred();
    const releaseFinalization = deferred();
    let activeDelegates = 0;
    let activeProviders = 0;
    let lateDelegates = 0;
    let lateProviders = 0;

    const finalizationBarrierDatabase: SqlQueryable = {
      async query<T = unknown>(text: string, values?: readonly unknown[]) {
        if (/set status = 'succeeded'/u.test(text)) {
          finalizationEntered.resolve();
          await releaseFinalization.promise;
        }
        return dispatcher.query(text, values ? [...values] : undefined) as unknown as Promise<{ rows: T[] }>;
      },
    };
    const activeHandler = defineJobHandler(async () => {
      activeDelegates += 1;
      activeProviders += 1;
      delegateStarted.resolve();
      await releaseDelegate.promise;
      return jobSucceeded({ barrier: "active" });
    });
    const activeRuntime = new WorkerRuntime({
      database: finalizationBarrierDatabase,
      tenantDatabase: tenant,
      handlers: { "privacy.barrier": activeHandler },
      executionScope: createWorkspacePrivacyWorkerExecutionScope(
        new PostgresWorkspacePrivacyFence(activeFencePool),
      ),
      workerId: "pg16-privacy-barrier-active",
      leaseMs: 30_000,
      heartbeatMs: 10_000,
    });
    const activeQueue = new PostgresJobQueue(dispatcher);
    const activeJob = await activeQueue.enqueue({
      workspaceId,
      type: "privacy.barrier",
      payload: { sequence: 1 },
      idempotencyKey: "pg16-privacy-barrier-active",
    });
    const activeRun = activeRuntime.runOnce();
    await delegateStarted.promise;
    const activeFencePid = await waitFor(
      () => applicationPid("pg16-privacy-barrier-active-fence"),
      "active worker fence backend",
    );

    let firstExternalCalls = 0;
    const fence = new PostgresWorkspacePrivacyFence(privacyPool);
    const firstDelete = fence.withExclusiveErasure({
      workspaceId,
      requestUuid,
      operatorId,
      now: new Date(),
    }, async () => {
      firstExternalCalls += 1;
      return "unexpected";
    }).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );

    await waitFor(async () => {
      const state = await admin.query<{ state: string }>(
        "select state from workspace_privacy_controls where workspace_id = $1",
        [workspaceId],
      );
      return state.rows[0]?.state === "blocking" ? state.rows[0].state : undefined;
    }, "durable blocking state");
    const firstDeletePid = await waitFor(
      () => applicationPid("pg16-privacy-barrier-delete"),
      "first deletion backend",
    );
    const firstWait = await waitFor(async () => {
      const result = await admin.query<{ blockers: number[]; wait_event: string | null }>(
        "select pg_blocking_pids($1) blockers, wait_event from pg_stat_activity where pid = $1",
        [firstDeletePid],
      );
      const row = result.rows[0];
      return row?.blockers.includes(activeFencePid) ? row : undefined;
    }, "exclusive deletion waiting on active shared worker");
    assert.equal(firstWait.wait_event, "advisory");
    assert.equal((await admin.query<{ terminated: boolean }>(
      "select pg_terminate_backend($1) terminated",
      [firstDeletePid],
    )).rows[0]!.terminated, true);
    const crashedDeletion = await firstDelete;
    assert.ok(crashedDeletion.error instanceof Error);
    assert.equal(firstExternalCalls, 0);
    assert.equal((await admin.query<{ state: string }>(
      "select state from workspace_privacy_controls where workspace_id = $1",
      [workspaceId],
    )).rows[0]!.state, "blocking");

    const lateQueue = new PostgresJobQueue(lateDispatcher);
    await lateQueue.enqueue({
      workspaceId,
      type: "privacy.barrier",
      payload: { sequence: 2 },
      idempotencyKey: "pg16-privacy-barrier-late",
    });
    const lateRuntime = new WorkerRuntime({
      database: lateDispatcher,
      tenantDatabase: lateTenant,
      handlers: {
        "privacy.barrier": defineJobHandler(async () => {
          lateDelegates += 1;
          lateProviders += 1;
          return jobSucceeded();
        }),
      },
      executionScope: createWorkspacePrivacyWorkerExecutionScope(
        new PostgresWorkspacePrivacyFence(lateFencePool),
      ),
      workerId: "pg16-privacy-barrier-late",
      leaseMs: 30_000,
      heartbeatMs: 10_000,
    });
    assert.deepEqual(await lateRuntime.runOnce(), {
      claimed: 1,
      succeeded: 1,
      retryable: 0,
      dead: 0,
      leaseLost: 0,
    });
    assert.equal(lateDelegates, 0);
    assert.equal(lateProviders, 0);

    releaseDelegate.resolve();
    await finalizationEntered.promise;
    assert.equal((await activeQueue.get(workspaceId, activeJob.id))!.status, "leased");

    let retryExternalCalls = 0;
    const retriedDelete = fence.withExclusiveErasure({
      workspaceId,
      requestUuid,
      operatorId,
      now: new Date(),
    }, async () => {
      retryExternalCalls += 1;
      return "external-erasure-complete";
    });
    const retryDeletePid = await waitFor(
      () => applicationPid("pg16-privacy-barrier-delete"),
      "retry deletion backend",
    );
    const finalizationWait = await waitFor(async () => {
      const result = await admin.query<{ blockers: number[] }>(
        "select pg_blocking_pids($1) blockers from pg_stat_activity where pid = $1",
        [retryDeletePid],
      );
      const row = result.rows[0];
      return row?.blockers.includes(activeFencePid) ? row.blockers : undefined;
    }, "retry deletion waiting through queue finalization");
    assert.ok(finalizationWait.includes(activeFencePid));
    assert.equal(activeFencePool.totalCount, 1);
    assert.ok(tenant.totalCount <= 1);
    assert.ok(privacyPool.totalCount <= 1);

    releaseFinalization.resolve();
    assert.deepEqual(await activeRun, {
      claimed: 1,
      succeeded: 1,
      retryable: 0,
      dead: 0,
      leaseLost: 0,
    });
    assert.equal(await retriedDelete, "external-erasure-complete");
    assert.equal(activeDelegates, 1);
    assert.equal(activeProviders, 1);
    assert.equal(retryExternalCalls, 1);

    const atomic = await admin.query<{
      state: string;
      request_status: string;
      local_status: string;
      control_xmin: string;
      request_xmin: string;
      step_xmin: string;
    }>(
      `select control.state,
              request.status request_status,
              step.status local_status,
              control.xmin::text control_xmin,
              request.xmin::text request_xmin,
              step.xmin::text step_xmin
         from workspace_privacy_controls control
         join privacy_requests request
           on request.workspace_id = control.workspace_id
          and request.id = control.deletion_request_id
         join privacy_request_steps step
           on step.workspace_id = request.workspace_id
          and step.request_id = request.id
          and step.step_key = 'local.erasure'
        where control.workspace_id = $1`,
      [workspaceId],
    );
    assert.deepEqual(atomic.rows[0], {
      state: "erased",
      request_status: "completed",
      local_status: "succeeded",
      control_xmin: atomic.rows[0]!.control_xmin,
      request_xmin: atomic.rows[0]!.control_xmin,
      step_xmin: atomic.rows[0]!.control_xmin,
    });

    const erasedFence = new PostgresWorkspacePrivacyFence(lateFencePool);
    let afterErasureDelegates = 0;
    assert.deepEqual(await erasedFence.withShared(workspaceId, async () => {
      afterErasureDelegates += 1;
      return "unexpected";
    }), { disposition: "skipped", state: "erased" });
    assert.equal(afterErasureDelegates, 0);

    const privacyClient = await privacyPool.connect();
    try {
      await privacyClient.query("begin");
      await privacyClient.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      await assert.rejects(
        privacyClient.query(
          "select privacy_block_workspace($1::uuid, $2::uuid, $3::text, now())",
          [workspaceId, requestUuid, operatorId],
        ),
      );
      await privacyClient.query("rollback");
    } finally {
      privacyClient.release();
    }
    assert.equal(await advisoryLockCount("pg16-privacy-barrier-"), 0);
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    assert.ok(pools.every((pool) => pool.totalCount === 0));
  }
});

test("PostgreSQL 16 backend crash와 unlock 검증 실패는 advisory lock을 pool에 남기지 않는다", {
  timeout: 30_000,
}, async () => {
  const crashWorkspaceId = "fb000000-0000-4000-8000-000000000002";
  const seamWorkspaceId = "fb000000-0000-4000-8000-000000000003";
  await admin.query(
    `insert into workspaces (id, name, slug)
     values ($1, 'PG16 Crash Fence', 'pg16-crash-fence'),
            ($2, 'PG16 Unlock Seam', 'pg16-unlock-seam')`,
    [crashWorkspaceId, seamWorkspaceId],
  );

  const crashPool = rolePool("semforge_worker", "pg16-privacy-barrier-crash-fence");
  const operationStarted = deferred<number>();
  const releaseOperation = deferred();
  try {
    const crashResult = new PostgresWorkspacePrivacyFence(crashPool).withShared(
      crashWorkspaceId,
      async (database) => {
        // pg emits a client-level error when an otherwise-idle checked-out
        // backend is terminated. The following COMMIT still supplies the
        // rejected promise asserted by this crash scenario.
        (database as unknown as { on(event: "error", handler: () => void): void })
          .on("error", () => undefined);
        const pid = (await database.query<{ pid: number }>(
          "select pg_backend_pid() pid",
        )).rows[0]!.pid;
        operationStarted.resolve(pid);
        await releaseOperation.promise;
        return "finished";
      },
    ).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );
    const crashPid = await operationStarted.promise;
    assert.equal(await advisoryLockCount("pg16-privacy-barrier-crash-fence"), 1);
    assert.equal((await admin.query<{ terminated: boolean }>(
      "select pg_terminate_backend($1) terminated",
      [crashPid],
    )).rows[0]!.terminated, true);
    await waitFor(async () =>
      (await advisoryLockCount("pg16-privacy-barrier-crash-fence")) === 0 ? 0 : undefined,
    "backend crash advisory auto-release");
    releaseOperation.resolve();
    assert.ok((await crashResult).error instanceof Error);
  } finally {
    releaseOperation.resolve();
    await crashPool.end();
    assert.equal(crashPool.totalCount, 0);
  }

  const rawPool = rolePool("semforge_worker", "pg16-privacy-barrier-unlock-seam");
  let destroyed = false;
  const wrappedPool = {
    async connect(): Promise<WorkspacePrivacyFenceConnection> {
      const client: PoolClient = await rawPool.connect();
      return {
        async query<T = unknown>(text: string, values?: readonly unknown[]) {
          if (/pg_advisory_unlock_shared/u.test(text)) {
            return { rows: [{ unlocked: false }] as T[] };
          }
          return client.query(text, values ? [...values] : undefined) as unknown as Promise<{ rows: T[] }>;
        },
        release(destroy?: boolean | Error) {
          destroyed = Boolean(destroy);
          client.release(destroy ? new Error("destroy unlock-uncertain session") : undefined);
        },
      };
    },
  };
  await assert.rejects(
    new PostgresWorkspacePrivacyFence(wrappedPool).withShared(seamWorkspaceId, async () => "done"),
    /WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED/u,
  );
  assert.equal(destroyed, true);
  await waitFor(async () =>
    (await advisoryLockCount("pg16-privacy-barrier-unlock-seam")) === 0 ? 0 : undefined,
  "destroyed unlock-failure session release");
  await rawPool.end();
  assert.equal(rawPool.totalCount, 0);
});
