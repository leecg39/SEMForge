// @TASK P3-W1-T1 - Real PostgreSQL 16 multi-session queue/provider/outbox verification
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST npm run test:pg16:docker
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { Pool, type PoolClient } from "pg";

import { PostgresProviderCallCoordinator } from "@/server/jobs/provider-calls";
import { PostgresJobQueue } from "@/server/jobs/queue";
import { PostgresOutboxRelay } from "@/server/outbox/relay";
import {
  defineJobHandler,
  jobSucceeded,
  type JobExecutionContext,
  type JobHandlerInput,
} from "@/server/jobs/contracts";
import { createPostgresBillingStore } from "@/server/billing/postgres-store";
import { createBillingAccessGuardedJobHandler } from "@/worker/billing-gate";
import {
  PostgresWeeklyCollectionScheduler,
  PostgresWeeklyReportScheduler,
} from "@/worker/scheduler";

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
    await Promise.all([
      firstClient.query("set local role semforge_dispatcher"),
      secondClient.query("set local role semforge_dispatcher"),
    ]);
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

    const initialTime = new Date("2026-08-12T03:00:00.000Z");
    await pool.query(
      `insert into outbox (workspace_id, topic, payload, idempotency_key, available_at)
       values ($1, 'collection.google.weekly', '{"siteId":"pg16"}'::jsonb, 'pg16-crash', $2)`,
      [workspaceA, initialTime],
    );
    await firstClient.query("begin");
    await firstClient.query("set local role semforge_dispatcher");
    const firstLease = (await new PostgresOutboxRelay(firstClient).claim({
      workerId: "pg16-relay-crashed",
      now: initialTime,
      leaseMs: 1_000,
    }))[0]!;
    await firstClient.query("commit");
    await secondClient.query("begin");
    await secondClient.query("set local role semforge_dispatcher");
    const recovered = await new PostgresOutboxRelay(secondClient).recoverExpired({
      now: new Date("2026-08-12T03:00:02.000Z"),
    });
    await secondClient.query("commit");
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]!.record.id, firstLease.id);
    assert.equal(recovered[0]!.dead, false);
    const retryTime = new Date("2026-08-12T03:00:03.000Z");
    await firstClient.query("begin");
    await firstClient.query("set local role semforge_dispatcher");
    const recoveredRelay = new PostgresOutboxRelay(firstClient);
    const recoveredLease = (await recoveredRelay.claim({
      workerId: "pg16-relay-recovered",
      now: retryTime,
      leaseMs: 10_000,
    }))[0]!;
    const published = await recoveredRelay.publish(recoveredLease, {
      jobType: "collect.google",
      now: retryTime,
    });
    await firstClient.query("commit");
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

test("PostgreSQL 16 실제 role은 구독 후보·report 동시 멱등·billing gate와 최소 권한을 강제한다", async () => {
  const schedulerA = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_scheduler",
  });
  const schedulerB = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_scheduler",
  });
  const worker = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_worker",
  });
  const web = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_web",
  });

  const candidates = [
    { suffix: "101", status: "active", periodEnd: null, allowed: true },
    { suffix: "102", status: "cancel_at_period_end", periodEnd: "2026-08-18T00:00:00.000Z", allowed: true },
    { suffix: "103", status: "cancel_at_period_end", periodEnd: "2026-08-16T22:59:59.000Z", allowed: false },
    { suffix: "104", status: "past_due", periodEnd: "2026-09-01T00:00:00.000Z", allowed: false },
    { suffix: "105", status: "account_created", periodEnd: null, allowed: false },
  ] as const;

  try {
    for (const candidate of candidates) {
      const workspaceId = `f4000000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
      const customerId = `f4100000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
      const subscriptionId = `f4200000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
      const siteId = `f4300000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
      const queryId = `f4400000-0000-4000-8000-${candidate.suffix.padStart(12, "0")}`;
      await pool.query(
        "insert into workspaces (id, name, slug) values ($1, $2, $3)",
        [workspaceId, `PG16 billing ${candidate.suffix}`, `pg16-billing-${candidate.suffix}`],
      );
      await pool.query(
        "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, $3)",
        [customerId, workspaceId, `pg16-${candidate.suffix}`],
      );
      await pool.query(
        `insert into subscriptions
           (id, workspace_id, billing_customer_id, status, current_period_start, current_period_end, grace_ends_at)
         values ($1, $2, $3, $4, '2026-08-01T00:00:00.000Z', $5, '2026-08-30T00:00:00.000Z')`,
        [subscriptionId, workspaceId, customerId, candidate.status, candidate.periodEnd],
      );
      await pool.query(
        "insert into sites (id, workspace_id, name, domain) values ($1, $2, $3, $4)",
        [siteId, workspaceId, `Site ${candidate.suffix}`, `pg16-${candidate.suffix}.example`],
      );
      await pool.query(
        `insert into tracked_queries
           (id, workspace_id, site_id, type, query, normalized_query)
         values ($1, $2, $3, 'rank', $4, $5)`,
        [queryId, workspaceId, siteId, `query ${candidate.suffix}`, `query ${candidate.suffix}`],
      );
    }

    const executedAt = new Date("2026-08-16T09:00:00.000Z");
    assert.deepEqual(
      await new PostgresWeeklyCollectionScheduler(schedulerA).schedule({ executedAt }),
      { google: 3, naver: 3, gsc: 0 },
    );
    assert.deepEqual(
      await new PostgresWeeklyCollectionScheduler(schedulerA).schedule({ executedAt }),
      { google: 0, naver: 0, gsc: 0 },
    );

    const reportAt = new Date("2026-08-16T23:00:00.000Z");
    const reportBarrier = barrier(2);
    const scheduled = await Promise.all([
      (async () => {
        await reportBarrier();
        return new PostgresWeeklyReportScheduler(schedulerA).schedule({ executedAt: reportAt });
      })(),
      (async () => {
        await reportBarrier();
        return new PostgresWeeklyReportScheduler(schedulerB).schedule({ executedAt: reportAt });
      })(),
    ]);
    assert.equal(scheduled.reduce((total, result) => total + result.reports, 0), 2);
    assert.ok(scheduled.every((result) => result.cycleMonday === "2026-08-17"));

    const reportRows = await pool.query<{ count: number }>(
      `select count(*)::int as count from outbox
        where topic = 'report.snapshot' and workspace_id::text like 'f4000000-%'`,
    );
    assert.equal(reportRows.rows[0]!.count, 2);

    const schedulerClient = await schedulerA.connect();
    try {
      await schedulerClient.query("begin");
      await schedulerClient.query("savepoint arbitrary_topic");
      await assert.rejects(
        schedulerClient.query(
          `insert into outbox (workspace_id, topic, payload, idempotency_key)
           values ('f4000000-0000-4000-8000-000000000101', 'billing.charge',
             '{"siteId":"f4300000-0000-4000-8000-000000000101"}'::jsonb, 'arbitrary')`,
        ),
        /row-level security|permission denied/i,
      );
      await schedulerClient.query("rollback to savepoint arbitrary_topic");
      await schedulerClient.query("savepoint cross_tenant");
      await assert.rejects(
        schedulerClient.query(
          `insert into outbox (workspace_id, topic, payload, idempotency_key)
           values ('f4000000-0000-4000-8000-000000000101', 'report.snapshot',
             '{"siteId":"f4300000-0000-4000-8000-000000000102","cycleMonday":"2026-08-17"}'::jsonb,
             'cross-tenant')`,
        ),
        /row-level security|permission denied/i,
      );
      await schedulerClient.query("rollback to savepoint cross_tenant");
      await assert.rejects(
        schedulerClient.query("select payload from outbox limit 1"),
        /permission denied/i,
      );
      await schedulerClient.query("rollback");
    } finally {
      schedulerClient.release();
    }

    const webClient = await web.connect();
    try {
      await webClient.query("begin");
      await webClient.query(
        "select set_config('app.workspace_id', 'f4000000-0000-4000-8000-000000000101', true)",
      );
      const forbidden = [
        ...["billing_customers", "payment_methods", "subscriptions"].flatMap((table) => [
          `select * from ${table}`,
          `insert into ${table} default values`,
          `update ${table} set workspace_id = workspace_id`,
          `delete from ${table}`,
        ]),
      ];
      for (const [index, statement] of forbidden.entries()) {
        await webClient.query(`savepoint web_billing_${index}`);
        await assert.rejects(webClient.query(statement), /permission denied/i);
        await webClient.query(`rollback to savepoint web_billing_${index}`);
      }
      await webClient.query("rollback");
    } finally {
      webClient.release();
    }

    let providerCalls = 0;
    const audits: string[] = [];
    const guarded = createBillingAccessGuardedJobHandler({
      database: worker,
      delegate: defineJobHandler(async () => {
        providerCalls += 1;
        return jobSucceeded();
      }),
    });
    const job: JobHandlerInput = {
      id: "f4500000-0000-4000-8000-000000000104",
      workspaceId: "f4000000-0000-4000-8000-000000000104",
      type: "collect.google",
      payload: {},
      idempotencyKey: "actual-pg-billing-gate",
      attempt: 1,
      maxAttempts: 5,
    };
    const context: JobExecutionContext = {
      workspaceId: job.workspaceId,
      jobId: job.id,
      attempt: 1,
      maxAttempts: 5,
      lease: { owner: "pg16", token: "token", generation: 1, expiresAt: new Date("2026-08-17T00:10:00.000Z") },
      signal: new AbortController().signal,
      providerCalls: {} as JobExecutionContext["providerCalls"],
      now: () => new Date("2026-08-17T00:00:00.000Z"),
      audit: async (action) => { audits.push(action); },
    };
    for (const type of ["collect.google", "report.snapshot"] as const) {
      const skipped = await guarded({ ...job, type }, context);
      assert.deepEqual(skipped, {
        status: "succeeded",
        metadata: { skipped: true, skipReason: "past_due_grace" },
      });
    }
    assert.equal(providerCalls, 0);
    assert.deepEqual(audits, ["job.billing_access.skipped", "job.billing_access.skipped"]);
  } finally {
    await Promise.all([schedulerA.end(), schedulerB.end(), worker.end(), web.end()]);
  }
});

test("PostgreSQL 16 실제 tenant billing role은 설정된 workspace만 허용하고 global role만 대사한다", async () => {
  const workspaceA = "f5000000-0000-4000-8000-000000000001";
  const workspaceB = "f5000000-0000-4000-8000-000000000002";
  const customerA = "f5100000-0000-4000-8000-000000000001";
  const customerB = "f5100000-0000-4000-8000-000000000002";
  const paymentMethodA = "f5200000-0000-4000-8000-000000000001";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'PG billing tenant A', 'pg-billing-tenant-a'), ($2, 'PG billing tenant B', 'pg-billing-tenant-b')",
    [workspaceA, workspaceB],
  );
  await pool.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'pg-billing-tenant-a'), ($3, $4, 'pg-billing-tenant-b')",
    [customerA, workspaceA, customerB, workspaceB],
  );
  await pool.query(
    "insert into subscriptions (workspace_id, billing_customer_id, status) values ($1, $2, 'account_created'), ($3, $4, 'account_created')",
    [workspaceA, customerA, workspaceB, customerB],
  );

  const tenant = await pool.connect();
  const global = await pool.connect();
  try {
    await tenant.query("begin");
    await tenant.query("set local role semforge_billing_tenant");
    assert.deepEqual((await tenant.query("select workspace_id from subscriptions")).rows, []);
    await tenant.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    assert.deepEqual(
      (await tenant.query<{ workspace_id: string }>("select workspace_id::text from subscriptions")).rows,
      [{ workspace_id: workspaceA }],
    );
    assert.deepEqual(
      (await tenant.query("update subscriptions set status = 'billing_authorized' where workspace_id = $1 returning id", [workspaceB])).rows,
      [],
    );
    await tenant.query("savepoint tenant_escape");
    await assert.rejects(
      tenant.query(
        `insert into payment_methods
          (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint)
         values ('f5200000-0000-4000-8000-000000000001', $1, $2,
           'enc:v1:key:iviviviviviviviv:tagtagtagtagtagtagta:cipher', repeat('b', 64))`,
        [workspaceB, customerB],
      ),
      /row-level security/i,
    );
    await tenant.query("rollback to savepoint tenant_escape");

    await global.query("begin");
    await global.query("set local role semforge_billing");
    const globalRows = await global.query<{ workspace_id: string }>(
      "select workspace_id::text from subscriptions where workspace_id in ($1, $2) order by workspace_id",
      [workspaceA, workspaceB],
    );
    assert.deepEqual(globalRows.rows, [{ workspace_id: workspaceA }, { workspace_id: workspaceB }]);
    for (const [savepoint, statement] of [
      ["global_sessions_denied", "select token_hash from sessions"],
      ["global_memberships_denied", "select role from memberships"],
    ] as const) {
      await global.query(`savepoint ${savepoint}`);
      await assert.rejects(global.query(statement), /permission denied/i);
      await global.query(`rollback to savepoint ${savepoint}`);
    }
  } finally {
    await Promise.all([
      tenant.query("rollback").catch(() => undefined),
      global.query("rollback").catch(() => undefined),
    ]);
    tenant.release();
    global.release();
  }

  const tenantRuntimePool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_billing_tenant",
  });
  const globalRuntimePool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_billing",
  });
  const fingerprintSecret = "pg16-billing-fingerprint-secret-32-bytes";
  try {
    const tenantStore = createPostgresBillingStore({
      pool: tenantRuntimePool,
      fingerprintSecret,
      scope: "tenant",
    });
    const saved = await tenantStore.savePaymentMethod({
      workspaceId: workspaceA,
      expectedCustomerKey: "pg-billing-tenant-a",
      paymentMethod: {
        id: paymentMethodA,
        workspaceId: workspaceA,
        billingCustomerId: customerA,
        billingKeyEncrypted:
          "enc:v1:key:iviviviviviviviv:tagtagtagtagtagtagta:cipher",
        billingKeyFingerprint: "a".repeat(64),
        cardBrand: "TEST",
        cardLast4: "1234",
        active: true,
        replacedAt: null,
      },
      ledger: {
        id: "f5300000-0000-4000-8000-000000000001",
        workspaceId: workspaceA,
        type: "payment_method.authorized",
        entityId: paymentMethodA,
        actorUserId: null,
        requestId: "pg16-tenant-store",
        occurredAt: new Date("2026-08-12T03:00:00.000Z"),
      },
    });
    assert.equal(saved.created, true);
    assert.equal(saved.account.subscription.workspaceId, workspaceA);
    assert.equal(saved.account.paymentMethod?.id, paymentMethodA);
    await assert.rejects(
      tenantStore.findPaymentByOrderId("global-only-order"),
      /global billing store/u,
    );

    const globalStore = createPostgresBillingStore({
      pool: globalRuntimePool,
      fingerprintSecret,
      scope: "global",
    });
    assert.equal((await globalStore.getAccount(workspaceB))?.subscription.workspaceId, workspaceB);
    await assert.rejects(
      globalRuntimePool.query(
        `insert into payment_methods
          (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint)
         values ('f5200000-0000-4000-8000-000000000002', $1, $2,
           'enc:v1:key:iviviviviviviviv:tagtagtagtagtagtagta:cipher', repeat('b', 64))`,
        [workspaceB, customerB],
      ),
      /permission denied/i,
    );
  } finally {
    await Promise.all([tenantRuntimePool.end(), globalRuntimePool.end()]);
  }
});

// @TASK P5-PRIVACY - Privacy erasure database authorization and tenant lifecycle
// @SPEC docs/ops/privacy-erasure-runbook.md
test("PostgreSQL 16 privacy erasure procedure는 PUBLIC과 일반 runtime role을 거부하고 privacy role만 허용한다", async () => {
  const functionAcl = await pool.query<{
    public_execute: boolean;
  }>(
    `select exists (
       select 1
         from pg_proc procedure
         join pg_namespace namespace on namespace.oid = procedure.pronamespace
         cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
        where namespace.nspname = 'public'
          and procedure.oid = 'public.privacy_erase_workspace(uuid,uuid,text)'::regprocedure
          and acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
     ) as public_execute`,
  );
  assert.deepEqual(functionAcl.rows, [{ public_execute: false }]);

  const runtimeRoles = [
    "semforge_auth",
    "semforge_billing",
    "semforge_billing_tenant",
    "semforge_dispatcher",
    "semforge_operator",
    "semforge_scheduler",
    "semforge_secret_scrubber",
    "semforge_web",
    "semforge_worker",
  ];
  const rolePrivileges = await pool.query<{
    rolname: string;
    can_execute: boolean;
  }>(
    `select rolname,
            has_function_privilege(
              oid,
              'public.privacy_erase_workspace(uuid,uuid,text)'::regprocedure,
              'EXECUTE'
            ) as can_execute
       from pg_roles
      where rolname = any($1::text[])
      order by rolname`,
    [runtimeRoles],
  );
  assert.deepEqual(
    rolePrivileges.rows,
    [...runtimeRoles].sort().map((rolname) => ({ rolname, can_execute: false })),
  );

  const privacyPrivilege = await pool.query<{ can_execute: boolean }>(
    `select has_function_privilege(
       (select oid from pg_roles where rolname = 'semforge_privacy'),
       'public.privacy_erase_workspace(uuid,uuid,text)'::regprocedure,
       'EXECUTE'
     ) as can_execute`,
  );
  assert.deepEqual(privacyPrivilege.rows, [{ can_execute: true }]);

  for (const role of runtimeRoles) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await assert.rejects(
        client.query(
          "select privacy_erase_workspace('f6000000-0000-4000-8000-000000000001'::uuid, 'f6000000-0000-4000-8000-000000000002'::uuid, 'unauthorized')",
        ),
        /permission denied for function privacy_erase_workspace/i,
      );
    } finally {
      await rollback(client);
      client.release();
    }
  }
});

test("PostgreSQL 16 privacy erasure procedure는 workspace의 실행 중 deletion 요청과 operator가 정확히 일치해야 한다", async () => {
  const workspaceId = "f6100000-0000-4000-8000-000000000001";
  const runningDeletionId = "f6100000-0000-4000-8000-000000000002";
  const exportId = "f6100000-0000-4000-8000-000000000003";
  const completedDeletionId = "f6100000-0000-4000-8000-000000000004";
  const arbitraryId = "f6100000-0000-4000-8000-000000000005";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Privacy request validation', 'privacy-request-validation')",
    [workspaceId],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, requested_at, completed_at)
     values
       ($1, $4, 'running-deletion', 'deletion', 'running', 'privacy-operator', now(), null),
       ($2, $4, 'running-export', 'export', 'running', 'privacy-operator', now(), null),
       ($3, $4, 'completed-deletion', 'deletion', 'completed', 'privacy-operator', now(), now())`,
    [runningDeletionId, exportId, completedDeletionId, workspaceId],
  );

  for (const [requestId, operatorId] of [
    [arbitraryId, "privacy-operator"],
    [exportId, "privacy-operator"],
    [completedDeletionId, "privacy-operator"],
    [runningDeletionId, "different-operator"],
  ] as const) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role semforge_privacy");
      await assert.rejects(
        client.query("select privacy_erase_workspace($1::uuid, $2::uuid, $3::text)", [
          workspaceId,
          requestId,
          operatorId,
        ]),
        /matching running deletion request/i,
      );
    } finally {
      await rollback(client);
      client.release();
    }
  }

  const untouched = await pool.query<{
    name: string;
    slug: string;
    request_count: number;
  }>(
    `select name, slug,
            (select count(*)::int from privacy_requests where workspace_id = workspaces.id) as request_count
       from workspaces
      where id = $1`,
    [workspaceId],
  );
  assert.deepEqual(untouched.rows, [{
    name: "Privacy request validation",
    slug: "privacy-request-validation",
    request_count: 3,
  }]);
});

test("PostgreSQL 16 workspace 파기는 공유 계정을 보존하고 전용 계정과 tenant PII만 지운다", async () => {
  const workspaceA = "f6200000-0000-4000-8000-000000000001";
  const workspaceB = "f6200000-0000-4000-8000-000000000002";
  const sharedUser = "f6200000-0000-4000-8000-000000000003";
  const exclusiveUser = "f6200000-0000-4000-8000-000000000004";
  const requestId = "f6200000-0000-4000-8000-000000000005";
  const sharedReset = "f6200000-0000-4000-8000-000000000006";
  const exclusiveReset = "f6200000-0000-4000-8000-000000000007";
  await pool.query(
    `insert into users (id, email, password_hash, display_name, email_verified_at)
     values ($1, 'shared@privacy.test', 'scrypt:shared', 'Shared User', now()),
            ($2, 'exclusive@privacy.test', 'scrypt:exclusive', 'Exclusive User', now())`,
    [sharedUser, exclusiveUser],
  );
  await pool.query(
    `insert into workspaces (id, name, slug, logo_url, accent_color)
     values ($1, 'Workspace PII A', 'workspace-pii-a', 'https://assets.example.test/a.png', '#123456'),
            ($2, 'Workspace B', 'workspace-b-preserved', 'https://assets.example.test/b.png', '#654321')`,
    [workspaceA, workspaceB],
  );
  await pool.query(
    `insert into memberships (workspace_id, user_id, role)
     values ($1, $3, 'owner'), ($1, $4, 'member'), ($2, $3, 'owner')`,
    [workspaceA, workspaceB, sharedUser, exclusiveUser],
  );
  await pool.query(
    `insert into legal_acceptances
       (workspace_id, user_id, terms_version, terms_sha256, privacy_version, privacy_sha256, presented_at, accepted_at)
     values ($1, $2, 'terms-v1', repeat('a', 64), 'privacy-v1', repeat('b', 64), now(), now()),
            ($1, $3, 'terms-v1', repeat('a', 64), 'privacy-v1', repeat('b', 64), now(), now())`,
    [workspaceA, sharedUser, exclusiveUser],
  );
  await pool.query(
    `insert into sessions (workspace_id, user_id, token_hash, expires_at)
     values ($1, $3, repeat('1', 64), now() + interval '1 day'),
            ($1, $4, repeat('2', 64), now() + interval '1 day'),
            ($2, $3, repeat('3', 64), now() + interval '1 day')`,
    [workspaceA, workspaceB, sharedUser, exclusiveUser],
  );
  await pool.query(
    `insert into password_resets (id, user_id, token_hash, expires_at)
     values ($1, $3, repeat('4', 64), now() + interval '1 hour'),
            ($2, $4, repeat('5', 64), now() + interval '1 hour')`,
    [sharedReset, exclusiveReset, sharedUser, exclusiveUser],
  );
  await pool.query(
    `insert into audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, 'privacy.test', 'user', 'shared@privacy.test', '{"email":"shared@privacy.test"}'::jsonb)`,
    [workspaceA, sharedUser],
  );
  await pool.query(
    `insert into invites
       (email, token_hash, workspace_name, workspace_slug, release_target, role, expires_at,
        accepted_at, accepted_workspace_id, accepted_by_user_id)
     values ('shared@privacy.test', repeat('6', 64), 'Workspace PII A', 'workspace-pii-a', 'paid-production',
       'owner', now() + interval '1 day', now(), $1, $2)`,
    [workspaceA, sharedUser],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, metadata, requested_at)
     values ($1, $2, 'workspace-delete', 'deletion', 'running', 'privacy-operator',
       '{"storageKeys":["reports/a.pdf","reports/b.pdf"]}'::jsonb, now())`,
    [requestId, workspaceA],
  );

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select privacy_erase_workspace($1::uuid, $2::uuid, 'privacy-operator')", [
      workspaceA,
      requestId,
    ]);
    await privacy.query("commit");
  } catch (error) {
    await rollback(privacy);
    throw error;
  } finally {
    privacy.release();
  }

  const users = await pool.query<{
    id: string;
    email: string;
    display_name: string | null;
    disabled: boolean;
  }>(
    `select id::text, email, display_name, disabled_at is not null as disabled
       from users where id in ($1, $2) order by id`,
    [sharedUser, exclusiveUser],
  );
  assert.deepEqual(users.rows, [
    { id: sharedUser, email: "shared@privacy.test", display_name: "Shared User", disabled: false },
    { id: exclusiveUser, email: users.rows[1]!.email, display_name: null, disabled: true },
  ]);
  assert.match(users.rows[1]!.email, /^erased\+[0-9a-f]{64}@privacy\.semforge\.invalid$/u);

  const isolation = await pool.query<{
    target_memberships: number;
    other_memberships: number;
    target_legal: number;
    target_sessions: number;
    other_sessions: number;
    shared_reset: number;
    exclusive_reset: number;
    target_invites: number;
  }>(
    `select
       (select count(*)::int from memberships where workspace_id = $1) target_memberships,
       (select count(*)::int from memberships where workspace_id = $2 and user_id = $3) other_memberships,
       (select count(*)::int from legal_acceptances where workspace_id = $1) target_legal,
       (select count(*)::int from sessions where workspace_id = $1) target_sessions,
       (select count(*)::int from sessions where workspace_id = $2 and user_id = $3) other_sessions,
       (select count(*)::int from password_resets where id = $4) shared_reset,
       (select count(*)::int from password_resets where id = $5) exclusive_reset,
       (select count(*)::int from invites where accepted_workspace_id = $1) target_invites`,
    [workspaceA, workspaceB, sharedUser, sharedReset, exclusiveReset],
  );
  assert.deepEqual(isolation.rows, [{
    target_memberships: 0,
    other_memberships: 1,
    target_legal: 0,
    target_sessions: 0,
    other_sessions: 1,
    shared_reset: 1,
    exclusive_reset: 0,
    target_invites: 0,
  }]);

  const tombstoned = await pool.query<{
    name: string;
    slug: string;
    logo_url: string | null;
    accent_color: string;
    storage_keys: unknown;
  }>(
    `select workspace.name, workspace.slug, workspace.logo_url, workspace.accent_color,
            marker.metadata->'storageKeys' as storage_keys
       from workspaces workspace
       join backup_deletion_markers marker on marker.workspace_id = workspace.id
      where workspace.id = $1 and marker.request_id = $2`,
    [workspaceA, requestId],
  );
  assert.match(tombstoned.rows[0]!.name, /^erased:[0-9a-f]{64}$/u);
  assert.match(tombstoned.rows[0]!.slug, /^erased-[0-9a-f]{32}$/u);
  assert.equal(tombstoned.rows[0]!.logo_url, null);
  assert.equal(tombstoned.rows[0]!.accent_color, "#667085");
  assert.deepEqual(tombstoned.rows[0]!.storage_keys, ["reports/a.pdf", "reports/b.pdf"]);

  const audit = await pool.query<{ actor_user_id: string | null; entity_id: string; metadata: unknown }>(
    "select actor_user_id::text, entity_id, metadata from audit_events where workspace_id = $1",
    [workspaceA],
  );
  assert.equal(audit.rows[0]!.actor_user_id, null);
  assert.match(audit.rows[0]!.entity_id, /^[0-9a-f]{64}$/u);
  assert.deepEqual(audit.rows[0]!.metadata, { privacyErased: true, requestId });
});

test("PostgreSQL 16 email suppression은 privacy request에 귀속되고 worker가 현재 tenant에서 읽기만 할 수 있다", async () => {
  const workspaceA = "f6300000-0000-4000-8000-000000000001";
  const workspaceB = "f6300000-0000-4000-8000-000000000002";
  const requestA = "f6300000-0000-4000-8000-000000000003";
  const requestB = "f6300000-0000-4000-8000-000000000004";
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Suppression A', 'suppression-a'), ($2, 'Suppression B', 'suppression-b')",
    [workspaceA, workspaceB],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, requested_at)
     values ($1, $3, 'suppression-a', 'deletion', 'running', 'privacy-operator', now()),
            ($2, $4, 'suppression-b', 'deletion', 'running', 'privacy-operator', now())`,
    [requestA, requestB, workspaceA, workspaceB],
  );

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query(
      `insert into email_suppressions (workspace_id, recipient_hash, request_id)
       values ($1, $2, $3), ($4, $5, $6)`,
      [workspaceA, hashA, requestA, workspaceB, hashB, requestB],
    );
    await privacy.query("savepoint invalid_hash");
    await assert.rejects(
      privacy.query(
        "insert into email_suppressions (workspace_id, recipient_hash, request_id) values ($1, 'ABC', $2)",
        [workspaceA, requestA],
      ),
      /email_suppressions_hash_ck/i,
    );
    await privacy.query("rollback to savepoint invalid_hash");
    await privacy.query("savepoint cross_workspace_request");
    await assert.rejects(
      privacy.query(
        "insert into email_suppressions (workspace_id, recipient_hash, request_id) values ($1, $2, $3)",
        [workspaceA, "c".repeat(64), requestB],
      ),
      /email_suppressions_request_fk/i,
    );
    await privacy.query("rollback to savepoint cross_workspace_request");
    await privacy.query("commit");
  } catch (error) {
    await rollback(privacy);
    throw error;
  } finally {
    privacy.release();
  }

  const grants = await pool.query<{ grantee: string; privilege_type: string }>(
    `select grantee, privilege_type
       from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'email_suppressions'
        and grantee in ('semforge_auth', 'semforge_privacy', 'semforge_worker')
      order by grantee, privilege_type`,
  );
  assert.deepEqual(grants.rows, [
    { grantee: "semforge_privacy", privilege_type: "DELETE" },
    { grantee: "semforge_privacy", privilege_type: "INSERT" },
    { grantee: "semforge_privacy", privilege_type: "SELECT" },
    { grantee: "semforge_worker", privilege_type: "SELECT" },
  ]);

  const worker = await pool.connect();
  try {
    await worker.query("begin");
    await worker.query("set local role semforge_worker");
    assert.deepEqual((await worker.query("select workspace_id from email_suppressions")).rows, []);
    await worker.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    assert.deepEqual(
      (await worker.query<{ workspace_id: string; recipient_hash: string }>(
        "select workspace_id::text, recipient_hash from email_suppressions",
      )).rows,
      [{ workspace_id: workspaceA, recipient_hash: hashA }],
    );
    await worker.query("savepoint worker_write");
    await assert.rejects(
      worker.query(
        "insert into email_suppressions (workspace_id, recipient_hash, request_id) values ($1, $2, $3)",
        [workspaceA, "d".repeat(64), requestA],
      ),
      /permission denied/i,
    );
    await worker.query("rollback to savepoint worker_write");
  } finally {
    await rollback(worker);
    worker.release();
  }

  const privacyErase = await pool.connect();
  try {
    await privacyErase.query("begin");
    await privacyErase.query("set local role semforge_privacy");
    await privacyErase.query(
      "select privacy_erase_workspace($1::uuid, $2::uuid, 'privacy-operator')",
      [workspaceA, requestA],
    );
    await privacyErase.query("commit");
  } catch (error) {
    await rollback(privacyErase);
    throw error;
  } finally {
    privacyErase.release();
  }
  const preserved = await pool.query<{ count: number }>(
    "select count(*)::int as count from email_suppressions where workspace_id = $1 and recipient_hash = $2",
    [workspaceA, hashA],
  );
  assert.deepEqual(preserved.rows, [{ count: 1 }]);
  await assert.rejects(
    pool.query("delete from privacy_requests where workspace_id = $1 and id = $2", [workspaceB, requestB]),
    /email_suppressions_request_fk/i,
  );
});
