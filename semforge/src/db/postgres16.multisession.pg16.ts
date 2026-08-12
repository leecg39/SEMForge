// @TASK P3-W1-T1 - Real PostgreSQL 16 multi-session queue/provider/outbox verification
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST npm run test:pg16:docker
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import {
  PostgresPasswordResetEmailStore,
  PostgresPasswordResetEmailSuppressionPolicy,
} from "@/server/auth/password-reset-email";
import { createBillingAccessGuardedJobHandler } from "@/worker/billing-gate";
import { createInsightRouteHandlers } from "@/server/insights/routes";
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

function roleDatabaseUrl(role: string): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c role=${role}`);
  return url.toString();
}

test("PostgreSQL 16 NAVER/AIO read route는 web-role PoolClient transaction-local RLS로 정상 tenant data만 반환한다", async () => {
  const workspaceA = "f6000000-0000-4000-8000-000000000001";
  const workspaceB = "f6000000-0000-4000-8000-000000000002";
  const siteA = "f6100000-0000-4000-8000-000000000001";
  const siteB = "f6100000-0000-4000-8000-000000000002";
  const rankQuery = "f6200000-0000-4000-8000-000000000001";
  const aioQuery = "f6200000-0000-4000-8000-000000000002";
  const providerCall = "f6300000-0000-4000-8000-000000000001";
  const naverObservation = "f6400000-0000-4000-8000-000000000001";
  const aioObservation = "f6500000-0000-4000-8000-000000000001";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'PG16 Read A', 'pg16-read-a'), ($2, 'PG16 Read B', 'pg16-read-b')",
    [workspaceA, workspaceB],
  );
  await pool.query(
    `insert into sites (id, workspace_id, name, domain)
     values ($1, $2, 'Read A', 'read-a.example'), ($3, $4, 'Read B', 'read-b.example')`,
    [siteA, workspaceA, siteB, workspaceB],
  );
  await pool.query(
    `insert into tracked_queries (id, workspace_id, site_id, type, query, normalized_query)
     values ($1, $2, $3, 'rank', '네이버 검색량', '네이버 검색량'),
            ($4, $2, $3, 'aio', 'AI Overview', 'ai overview')`,
    [rankQuery, workspaceA, siteA, aioQuery],
  );
  await pool.query(
    `insert into provider_calls
       (id, workspace_id, provider, operation, idempotency_key, request_hash, status, response_metadata, completed_at)
     values ($1, $2, 'talordata', 'google_serp_aio', 'pg16-read-aio', 'hash-pg16-read-aio', 'succeeded', '{}'::jsonb, '2026-08-12T01:00:00.000Z')`,
    [providerCall, workspaceA],
  );
  await pool.query(
    `insert into naver_observations
       (id, workspace_id, site_id, tracked_query_id, observed_at, collected_at,
        monthly_pc_search_volume, monthly_mobile_search_volume, blog_result_count, trend, demographics)
     values ($1, $2, $3, $4, '2026-08-12T01:00:00.000Z', '2026-08-12T01:01:00.000Z',
       11, 22, 33, '[]'::jsonb, '{}'::jsonb)`,
    [naverObservation, workspaceA, siteA, rankQuery],
  );
  await pool.query(
    `insert into naver_observation_sources
       (workspace_id, observation_id, source, status, collected_at, metadata)
     values ($1, $2, 'search_ads_monthly_volume', 'succeeded', '2026-08-12T01:01:00.000Z', '{"providerSource":"naver-search-ads-relkwdstat"}'::jsonb)`,
    [workspaceA, naverObservation],
  );
  await pool.query(
    `insert into aio_observations
       (id, workspace_id, site_id, tracked_query_id, provider_call_id, observed_at, presence, answer_text)
     values ($1, $2, $3, $4, $5, '2026-08-12T01:00:00.000Z', 'present', 'PG16 answer')`,
    [aioObservation, workspaceA, siteA, aioQuery, providerCall],
  );
  await pool.query(
    `insert into aio_citations (workspace_id, observation_id, url, title, position)
     values ($1, $2, 'https://read-a.example/aio', 'Owned', 1)`,
    [workspaceA, aioObservation],
  );

  const webPool = new Pool({ connectionString: roleDatabaseUrl("semforge_web"), max: 1, ssl: false });
  try {
    const handlers = createInsightRouteHandlers({
      pool: webPool,
      resolveSession: async () => ({
        workspaceId: workspaceA,
        userId: "f6600000-0000-4000-8000-000000000001",
        role: "owner",
        requestId: "pg16-read-route",
      }),
      authorizeBilling: async () => ({
        allowed: true,
        mode: "full",
        reason: "active",
        reportPeriodEndBefore: null,
      }),
    });

    const naver = await handlers.naver.GET(
      new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteA}`),
      undefined,
    );
    const aio = await handlers.aio.GET(
      new Request(`https://app.semforge.test/api/v1/visibility/aio?siteId=${siteA}`),
      undefined,
    );
    assert.equal(naver.status, 200);
    assert.equal(aio.status, 200);
    assert.match(JSON.stringify((await naver.json()).data), /"total":33/u);
    assert.match(JSON.stringify((await aio.json()).data), /PG16 answer/u);

    const hidden = await handlers.naver.GET(
      new Request(`https://app.semforge.test/api/v1/insights/naver?siteId=${siteB}`),
      undefined,
    );
    assert.equal(hidden.status, 404);
  } finally {
    await webPool.end();
  }
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

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
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

test("PostgreSQL 16 billing settle은 동일 provider payment 동시 재처리에도 ledger를 한 번만 기록한다", async () => {
  const workspaceId = "f5400000-0000-4000-8000-000000000001";
  const customerId = "f5400000-0000-4000-8000-000000000002";
  const subscriptionId = "f5400000-0000-4000-8000-000000000003";
  const paymentId = "f5400000-0000-4000-8000-000000000004";
  const orderId = "pg16-settle-race-order";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'PG billing settle race', 'pg-billing-settle-race')",
    [workspaceId],
  );
  await pool.query(
    "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, 'pg-billing-settle-race')",
    [customerId, workspaceId],
  );
  await pool.query(
    "insert into subscriptions (id, workspace_id, billing_customer_id, status) values ($1, $2, $3, 'charge_pending')",
    [subscriptionId, workspaceId, customerId],
  );
  await pool.query(
    `insert into payments
      (id, workspace_id, subscription_id, order_id, idempotency_key, status, amount_krw,
       billing_period_start, billing_period_end, attempt)
     values ($1, $2, $3, $4, 'pg16-settle-race-idempotency', 'pending', 49000,
       '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 1)`,
    [paymentId, workspaceId, subscriptionId, orderId],
  );

  await pool.query(`
    create or replace function semforge_pg16_sleep_on_billing_settle()
    returns trigger
    language plpgsql
    as $$
    begin
      if old.order_id = 'pg16-settle-race-order' and old.status <> new.status then
        perform pg_sleep(0.2);
      end if;
      return new;
    end;
    $$;
  `);
  await pool.query(`
    create trigger semforge_pg16_sleep_on_billing_settle
    before update of status on payments
    for each row
    execute function semforge_pg16_sleep_on_billing_settle();
  `);

  const globalRuntimePool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    ssl: false,
    options: "-c role=semforge_billing",
  });
  try {
    const globalStore = createPostgresBillingStore({
      pool: globalRuntimePool,
      fingerprintSecret: "pg16-billing-settle-race-secret-32-bytes",
      scope: "global",
    });
    const settleInput = {
      workspaceId,
      orderId,
      status: "paid" as const,
      tossPaymentKey: "toss-pg16-settle-race",
      failureCode: null,
      failureMessage: null,
      paidAt: new Date("2026-08-12T04:00:00.000Z"),
      graceEndsAt: null,
    };
    const [first, second] = await Promise.all([
      globalStore.settleCharge({
        ...settleInput,
        ledger: {
          id: "f5400000-0000-4000-8000-000000000005",
          workspaceId,
          type: "charge.succeeded",
          entityId: paymentId,
          actorUserId: null,
          requestId: "pg16-settle-race-a",
          occurredAt: new Date("2026-08-12T04:00:01.000Z"),
          amountKrw: 49_000,
          orderId,
          paymentStatus: "paid",
        },
      }),
      globalStore.settleCharge({
        ...settleInput,
        ledger: {
          id: "f5400000-0000-4000-8000-000000000006",
          workspaceId,
          type: "charge.succeeded",
          entityId: paymentId,
          actorUserId: null,
          requestId: "pg16-settle-race-b",
          occurredAt: new Date("2026-08-12T04:00:02.000Z"),
          amountKrw: 49_000,
          orderId,
          paymentStatus: "paid",
        },
      }),
    ]);
    assert.deepEqual(
      [first.changed, second.changed].sort(),
      [false, true],
    );
    const ledger = await pool.query<{ count: number; request_ids: string[] }>(
      `select count(*)::int as count, array_agg(request_id order by request_id) as request_ids
       from billing_ledger_events
       where workspace_id = $1 and type = 'charge.succeeded' and order_id = $2`,
      [workspaceId, orderId],
    );
    assert.equal(ledger.rows[0]?.count, 1);
    assert.equal(ledger.rows[0]?.request_ids.length, 1);
    assert.match(ledger.rows[0]!.request_ids[0]!, /^pg16-settle-race-[ab]$/u);
  } finally {
    await globalRuntimePool.end();
    await pool.query("drop trigger if exists semforge_pg16_sleep_on_billing_settle on payments");
    await pool.query("drop function if exists semforge_pg16_sleep_on_billing_settle()");
  }
});

test("PostgreSQL 16 billing settle은 terminal cancel/refund 이후 stale DONE을 no-op 처리한다", async () => {
  const cases = [
    {
      workspaceId: "f5410000-0000-4000-8000-000000000001",
      customerId: "f5410000-0000-4000-8000-000000000002",
      subscriptionId: "f5410000-0000-4000-8000-000000000003",
      paymentId: "f5410000-0000-4000-8000-000000000004",
      slug: "pg-billing-stale-done-canceled",
      orderId: "pg16-stale-done-canceled",
      terminalStatus: "canceled",
    },
    {
      workspaceId: "f5420000-0000-4000-8000-000000000001",
      customerId: "f5420000-0000-4000-8000-000000000002",
      subscriptionId: "f5420000-0000-4000-8000-000000000003",
      paymentId: "f5420000-0000-4000-8000-000000000004",
      slug: "pg-billing-stale-done-refunded",
      orderId: "pg16-stale-done-refunded",
      terminalStatus: "refunded",
    },
  ] as const;

  for (const fixture of cases) {
    await pool.query(
      "insert into workspaces (id, name, slug) values ($1, $2, $3)",
      [fixture.workspaceId, `PG ${fixture.slug}`, fixture.slug],
    );
    await pool.query(
      "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, $3)",
      [fixture.customerId, fixture.workspaceId, fixture.slug],
    );
    await pool.query(
      "insert into subscriptions (id, workspace_id, billing_customer_id, status) values ($1, $2, $3, 'past_due')",
      [fixture.subscriptionId, fixture.workspaceId, fixture.customerId],
    );
    await pool.query(
      `insert into payments
        (id, workspace_id, subscription_id, order_id, idempotency_key, toss_payment_key, status,
         amount_krw, billing_period_start, billing_period_end, attempt)
       values ($1, $2, $3, $4, $5, 'already-terminal', $6, 49000,
         '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 1)`,
      [
        fixture.paymentId,
        fixture.workspaceId,
        fixture.subscriptionId,
        fixture.orderId,
        `${fixture.orderId}-idempotency`,
        fixture.terminalStatus,
      ],
    );
  }

  const globalRuntimePool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: false,
    options: "-c role=semforge_billing",
  });
  try {
    const globalStore = createPostgresBillingStore({
      pool: globalRuntimePool,
      fingerprintSecret: "pg16-billing-stale-done-secret-32-bytes",
      scope: "global",
    });
    for (const fixture of cases) {
      const result = await globalStore.settleCharge({
        workspaceId: fixture.workspaceId,
        orderId: fixture.orderId,
        status: "paid",
        tossPaymentKey: "stale-done-after-terminal",
        failureCode: null,
        failureMessage: null,
        paidAt: new Date("2026-08-12T04:30:00.000Z"),
        graceEndsAt: null,
        ledger: {
          id: fixture.terminalStatus === "canceled"
            ? "f5410000-0000-4000-8000-000000000005"
            : "f5420000-0000-4000-8000-000000000005",
          workspaceId: fixture.workspaceId,
          type: "charge.succeeded",
          entityId: fixture.paymentId,
          actorUserId: null,
          requestId: `${fixture.orderId}-stale-done`,
          occurredAt: new Date("2026-08-12T04:30:01.000Z"),
          amountKrw: 49_000,
          orderId: fixture.orderId,
          paymentStatus: "paid",
        },
      });
      assert.equal(result.changed, false);
    }

    const rows = await pool.query<{ order_id: string; status: string; ledger_count: number }>(
      `select p.order_id, p.status::text, count(ble.id)::int as ledger_count
       from payments p
       left join billing_ledger_events ble
        on ble.workspace_id = p.workspace_id
       and ble.order_id = p.order_id
       and ble.type = 'charge.succeeded'
       where p.order_id in ('pg16-stale-done-canceled', 'pg16-stale-done-refunded')
       group by p.order_id, p.status
       order by p.order_id`,
    );
    assert.deepEqual(rows.rows, [
      { order_id: "pg16-stale-done-canceled", status: "canceled", ledger_count: 0 },
      { order_id: "pg16-stale-done-refunded", status: "refunded", ledger_count: 0 },
    ]);
  } finally {
    await globalRuntimePool.end();
  }
});

test("PostgreSQL 16 billing subscription race는 cancel/disable을 stale settle로 되돌리지 않는다", async () => {
  const fixtures = [
    {
      workspaceId: "f5430000-0000-4000-8000-000000000001",
      customerId: "f5430000-0000-4000-8000-000000000002",
      subscriptionId: "f5430000-0000-4000-8000-000000000003",
      paymentId: "f5430000-0000-4000-8000-000000000004",
      paymentMethodId: "f5430000-0000-4000-8000-000000000005",
      orderId: "pg16-settle-vs-cancel",
      slug: "pg16-settle-vs-cancel",
      mode: "cancel",
      expectedSubscriptionStatus: "cancel_at_period_end",
    },
    {
      workspaceId: "f5440000-0000-4000-8000-000000000001",
      customerId: "f5440000-0000-4000-8000-000000000002",
      subscriptionId: "f5440000-0000-4000-8000-000000000003",
      paymentId: "f5440000-0000-4000-8000-000000000004",
      paymentMethodId: "f5440000-0000-4000-8000-000000000005",
      orderId: "pg16-settle-vs-disable",
      slug: "pg16-settle-vs-disable",
      mode: "disable",
      expectedSubscriptionStatus: "past_due",
    },
  ] as const;

  for (const fixture of fixtures) {
    await pool.query(
      "insert into workspaces (id, name, slug) values ($1, $2, $3)",
      [fixture.workspaceId, `PG ${fixture.slug}`, fixture.slug],
    );
    await pool.query(
      "insert into billing_customers (id, workspace_id, toss_customer_key) values ($1, $2, $3)",
      [fixture.customerId, fixture.workspaceId, fixture.slug],
    );
    await pool.query(
      `insert into payment_methods
        (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint, active)
       values ($1, $2, $3, 'enc:v1:key:iviviviviviviviv:tagtagtagtagtagtagta:cipher', $4, true)`,
      [
        fixture.paymentMethodId,
        fixture.workspaceId,
        fixture.customerId,
        fixture.mode === "cancel" ? "c".repeat(64) : "d".repeat(64),
      ],
    );
    await pool.query(
      `insert into subscriptions
        (id, workspace_id, billing_customer_id, payment_method_id, status)
       values ($1, $2, $3, $4, 'active')`,
      [fixture.subscriptionId, fixture.workspaceId, fixture.customerId, fixture.paymentMethodId],
    );
    await pool.query(
      `insert into payments
        (id, workspace_id, subscription_id, order_id, idempotency_key, status, amount_krw,
         billing_period_start, billing_period_end, attempt)
       values ($1, $2, $3, $4, $5, 'pending', 49000,
         '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 1)`,
      [
        fixture.paymentId,
        fixture.workspaceId,
        fixture.subscriptionId,
        fixture.orderId,
        `${fixture.orderId}-idempotency`,
      ],
    );
  }

  const globalRuntimePool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    ssl: false,
    options: "-c role=semforge_billing",
  });
  try {
    const globalStore = createPostgresBillingStore({
      pool: globalRuntimePool,
      fingerprintSecret: "pg16-billing-subscription-race-secret-32-bytes",
      scope: "global",
    });

    for (const fixture of fixtures) {
      const settle = globalStore.settleCharge({
        workspaceId: fixture.workspaceId,
        orderId: fixture.orderId,
        status: "paid",
        tossPaymentKey: `${fixture.orderId}-payment-key`,
        failureCode: null,
        failureMessage: null,
        paidAt: new Date("2026-08-12T05:00:00.000Z"),
        graceEndsAt: null,
        ledger: {
          id: fixture.mode === "cancel"
            ? "f5430000-0000-4000-8000-000000000006"
            : "f5440000-0000-4000-8000-000000000006",
          workspaceId: fixture.workspaceId,
          type: "charge.succeeded",
          entityId: fixture.paymentId,
          actorUserId: null,
          requestId: `${fixture.orderId}-settle`,
          occurredAt: new Date("2026-08-12T05:00:01.000Z"),
          amountKrw: 49_000,
          orderId: fixture.orderId,
          paymentStatus: "paid",
        },
      });
      const blocker = fixture.mode === "cancel"
        ? globalStore.scheduleCancellation({
            workspaceId: fixture.workspaceId,
            effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
            ledger: {
              id: "f5430000-0000-4000-8000-000000000007",
              workspaceId: fixture.workspaceId,
              type: "subscription.cancel_scheduled",
              entityId: fixture.subscriptionId,
              actorUserId: null,
              requestId: `${fixture.orderId}-cancel`,
              occurredAt: new Date("2026-08-12T05:00:02.000Z"),
            },
          })
        : globalStore.disablePaymentMethod({
            workspaceId: fixture.workspaceId,
            paymentMethodId: fixture.paymentMethodId,
          });
      await Promise.all([settle, blocker]);
    }

    const rows = await pool.query<{
      order_id: string;
      payment_status: string;
      subscription_status: string;
      payment_method_active: boolean | null;
    }>(
      `select p.order_id,
              p.status::text as payment_status,
              s.status::text as subscription_status,
              pm.active as payment_method_active
       from payments p
       join subscriptions s on s.workspace_id = p.workspace_id and s.id = p.subscription_id
       left join payment_methods pm on pm.workspace_id = s.workspace_id and pm.id = $1
       where p.order_id in ('pg16-settle-vs-cancel', 'pg16-settle-vs-disable')
       order by p.order_id`,
      ["f5440000-0000-4000-8000-000000000005"],
    );
    assert.deepEqual(rows.rows.map(({ order_id, payment_status, subscription_status }) => ({
      order_id,
      payment_status,
      subscription_status,
    })), [
      {
        order_id: "pg16-settle-vs-cancel",
        payment_status: "paid",
        subscription_status: "cancel_at_period_end",
      },
      {
        order_id: "pg16-settle-vs-disable",
        payment_status: "paid",
        subscription_status: "past_due",
      },
    ]);
    assert.equal(rows.rows[1]?.payment_method_active, false);
  } finally {
    await globalRuntimePool.end();
  }
});

// @TASK P5-PRIVACY - Privacy erasure database authorization and tenant lifecycle
// @SPEC docs/ops/privacy-erasure-runbook.md
test("PostgreSQL 16 password reset delivery fence는 worker 역할로 suppression을 읽고 dispatcher 역할을 거부한다", async () => {
  const workspaceId = "f5f00000-0000-4000-8000-000000000001";
  const jobId = "f5f00000-0000-4000-8000-000000000002";
  const resetId = "f5f00000-0000-4000-8000-000000000003";
  const encrypted = {
    kind: "password_reset",
    resetId,
    encryptedDelivery: "enc:v1:test:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:YWJj",
    expiresAt: "2030-08-12T06:00:00.000Z",
  };
  const worker = new Pool({ connectionString: roleDatabaseUrl("semforge_worker"), max: 1, ssl: false });
  const dispatcher = new Pool({ connectionString: roleDatabaseUrl("semforge_dispatcher"), max: 1, ssl: false });
  const auth = new Pool({ connectionString: roleDatabaseUrl("semforge_auth"), max: 1, ssl: false });
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Reset fence role', 'reset-fence-role')",
    [workspaceId],
  );
  await pool.query(
    `insert into jobs (id, workspace_id, type, payload, idempotency_key)
     values ($1, $2, 'email.password_reset', $3::jsonb, $4)`,
    [jobId, workspaceId, JSON.stringify(encrypted), `outbox:email.password_reset:password-reset:${resetId}`],
  );
  await pool.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key)
     values ($1, 'email.password_reset', $2::jsonb, $3)`,
    [workspaceId, JSON.stringify(encrypted), `password-reset:${resetId}`],
  );
  try {
    const workerPolicy = new PostgresPasswordResetEmailSuppressionPolicy({
      identityDatabase: auth,
      tenantDatabase: worker,
      deliveryFenceDatabase: worker,
    });
    const dispatcherStore = new PostgresPasswordResetEmailStore(dispatcher);
    const result = await workerPolicy.withDeliveryFence(
      { workspaceId, recipient: "reset-role@example.test" },
      async (_workerDatabase, state) => {
        await dispatcherStore.scrub({
          workspaceId,
          jobId,
          resetId,
          state: "delivered",
          scrubbedAt: new Date("2026-08-12T06:00:00.000Z"),
          providerMessageId: "pg16-resend-id",
        });
        return { ...state, scrubbed: true };
      },
    );
    assert.deepEqual(result, { suppressed: false, scrubbed: true });
    const payload = await pool.query<{ payload: Record<string, unknown> }>(
      "select payload from jobs where id = $1",
      [jobId],
    );
    assert.equal(payload.rows[0]?.payload.kind, "password_reset_scrubbed");

    const workerClient = await worker.connect();
    try {
      await workerClient.query("begin");
      await workerClient.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      await assert.rejects(
        workerClient.query(
          "select scrub_password_reset_delivery($1, $2, $3, 'delivered', now(), 'worker-must-not-scrub')",
          [workspaceId, jobId, resetId],
        ),
        /permission denied for function scrub_password_reset_delivery/i,
      );
      await workerClient.query("rollback");
    } finally {
      workerClient.release();
    }
    const dispatcherPolicy = new PostgresPasswordResetEmailSuppressionPolicy({
      identityDatabase: auth,
      tenantDatabase: worker,
      deliveryFenceDatabase: dispatcher,
    });
    await assert.rejects(
      dispatcherPolicy.withDeliveryFence(
        { workspaceId, recipient: "reset-role@example.test" },
        async () => "unexpected",
      ),
      /permission denied for table email_suppressions/i,
    );
  } finally {
    await Promise.all([worker.end(), dispatcher.end(), auth.end()]);
  }
});

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
  const exportSubjectId = "f6100000-0000-4000-8000-000000000006";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Privacy request validation', 'privacy-request-validation')",
    [workspaceId],
  );
  await pool.query(
    `insert into users (id, email, password_hash, display_name)
     values ($1, 'privacy-request-subject@example.test', 'scrypt:subject', 'Privacy Request Subject')`,
    [exportSubjectId],
  );
  await pool.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [workspaceId, exportSubjectId],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, subject_user_id, requested_at, completed_at)
     values
       ($1, $4, 'running-deletion', 'workspace_deletion', 'running', 'privacy-operator', null, now(), null),
       ($2, $4, 'running-export', 'export', 'running', 'privacy-operator', $5, now(), null),
       ($3, $4, 'completed-deletion', 'workspace_deletion', 'completed', 'privacy-operator', null, now(), now())`,
    [runningDeletionId, exportId, completedDeletionId, workspaceId, exportSubjectId],
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
      await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
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
     values ($1, $2, 'workspace-delete', 'workspace_deletion', 'running', 'privacy-operator',
       jsonb_build_object(
         'storagePrefix', 'reports/' || $2::uuid::text || '/',
         'storageKeyHashes', jsonb_build_array(repeat('a', 64), repeat('b', 64))
       ), now())`,
    [requestId, workspaceA],
  );

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    await privacy.query(
      "select privacy_block_workspace($1::uuid, $2::uuid, 'privacy-operator', now())",
      [workspaceA, requestId],
    );
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
    storage_prefix: string;
    storage_key_hashes: unknown;
  }>(
    `select workspace.name, workspace.slug, workspace.logo_url, workspace.accent_color,
            marker.metadata->>'storagePrefix' as storage_prefix,
            marker.metadata->'storageKeyHashes' as storage_key_hashes
       from workspaces workspace
       join backup_deletion_markers marker on marker.workspace_id = workspace.id
      where workspace.id = $1 and marker.request_id = $2`,
    [workspaceA, requestId],
  );
  assert.match(tombstoned.rows[0]!.name, /^erased:[0-9a-f]{64}$/u);
  assert.match(tombstoned.rows[0]!.slug, /^erased-[0-9a-f]{32}$/u);
  assert.equal(tombstoned.rows[0]!.logo_url, null);
  assert.equal(tombstoned.rows[0]!.accent_color, "#667085");
  assert.equal(tombstoned.rows[0]!.storage_prefix, `reports/${workspaceA}/`);
  assert.deepEqual(tombstoned.rows[0]!.storage_key_hashes, ["a".repeat(64), "b".repeat(64)]);

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
     values ($1, $3, 'suppression-a', 'workspace_deletion', 'running', 'privacy-operator', now()),
            ($2, $4, 'suppression-b', 'workspace_deletion', 'running', 'privacy-operator', now())`,
    [requestA, requestB, workspaceA, workspaceB],
  );
  await pool.query(
    "insert into email_suppressions (workspace_id, recipient_hash, request_id) values ($1, $2, $3)",
    [workspaceB, hashB, requestB],
  );

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    await privacy.query(
      "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
      [workspaceA, requestA, hashA],
    );
    await privacy.query("savepoint invalid_hash");
    await assert.rejects(
      privacy.query(
        "select privacy_add_email_suppression($1::uuid, $2::uuid, 'ABC')",
        [workspaceA, requestA],
      ),
      /suppression input is invalid/i,
    );
    await privacy.query("rollback to savepoint invalid_hash");
    await privacy.query("savepoint cross_workspace_request");
    await assert.rejects(
      privacy.query(
        "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
        [workspaceA, requestB, "c".repeat(64)],
      ),
      /matching running deletion or erasure request/i,
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
    await privacyErase.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    await privacyErase.query(
      "select privacy_block_workspace($1::uuid, $2::uuid, 'privacy-operator', now())",
      [workspaceA, requestA],
    );
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

test("PostgreSQL 16 subject erasure email suppression은 exact running erasure request에만 귀속된다", async () => {
  const workspaceA = "f6310000-0000-4000-8000-000000000001";
  const workspaceB = "f6310000-0000-4000-8000-000000000002";
  const subjectA = "f6310000-0000-4000-8000-000000000011";
  const subjectB = "f6310000-0000-4000-8000-000000000012";
  const erasureRequestA = "f6310000-0000-4000-8000-000000000021";
  const erasureRequestB = "f6310000-0000-4000-8000-000000000022";
  const exportRequestA = "f6310000-0000-4000-8000-000000000023";
  const hashA = sha256Hex("subject-suppression-a@example.test");
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Subject Suppression A', 'subject-suppression-a'), ($2, 'Subject Suppression B', 'subject-suppression-b')",
    [workspaceA, workspaceB],
  );
  await pool.query(
    `insert into users (id, email, password_hash, email_verified_at)
     values ($1, 'subject-suppression-a@example.test', 'scrypt:a', now()),
            ($2, 'subject-suppression-b@example.test', 'scrypt:b', now())`,
    [subjectA, subjectB],
  );
  await pool.query(
    `insert into memberships (workspace_id, user_id, role)
     values ($1, $2, 'member'), ($3, $4, 'member')`,
    [workspaceA, subjectA, workspaceB, subjectB],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, subject_user_id, requested_at)
     values ($1, $4, 'subject-suppression-a', 'erasure', 'running', 'privacy-operator', $5, now()),
            ($2, $6, 'subject-suppression-b', 'erasure', 'running', 'privacy-operator', $7, now()),
            ($3, $4, 'subject-export-a', 'export', 'running', 'privacy-operator', $5, now())`,
    [erasureRequestA, erasureRequestB, exportRequestA, workspaceA, subjectA, workspaceB, subjectB],
  );

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    await privacy.query(
      "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
      [workspaceA, erasureRequestA, hashA],
    );
    await privacy.query("savepoint wrong_subject_hash");
    await assert.rejects(
      privacy.query(
        "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
        [workspaceA, erasureRequestA, "e".repeat(64)],
      ),
      /matching running deletion or erasure request/i,
    );
    await privacy.query("rollback to savepoint wrong_subject_hash");
    await privacy.query("savepoint cross_workspace_subject");
    await assert.rejects(
      privacy.query(
        "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
        [workspaceA, erasureRequestB, "f".repeat(64)],
      ),
      /matching running deletion or erasure request/i,
    );
    await privacy.query("rollback to savepoint cross_workspace_subject");
    await privacy.query("savepoint non_erasure_request");
    await assert.rejects(
      privacy.query(
        "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
        [workspaceA, exportRequestA, "0".repeat(64)],
      ),
      /matching running deletion or erasure request/i,
    );
    await privacy.query("rollback to savepoint non_erasure_request");
    await privacy.query("commit");
  } catch (error) {
    await rollback(privacy);
    throw error;
  } finally {
    privacy.release();
  }

  assert.deepEqual(
    (await pool.query<{ workspace_id: string; recipient_hash: string; request_id: string }>(
      `select workspace_id::text, recipient_hash, request_id::text
         from email_suppressions
        where workspace_id = $1`,
      [workspaceA],
    )).rows,
    [{ workspace_id: workspaceA, recipient_hash: hashA, request_id: erasureRequestA }],
  );
});

test("PostgreSQL 16 recipient email lock은 sender shared와 erasure exclusive를 같은 recipient hash로 직렬화한다", async () => {
  const workspaceId = "f6340000-0000-4000-8000-000000000001";
  const subjectUser = "f6340000-0000-4000-8000-000000000011";
  const requestId = "f6340000-0000-4000-8000-000000000021";
  const recipientHash = sha256Hex("recipient-lock@example.test");
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Recipient Lock', 'recipient-lock')",
    [workspaceId],
  );
  await pool.query(
    `insert into users (id, email, password_hash, email_verified_at)
     values ($1, 'recipient-lock@example.test', 'scrypt:lock', now())`,
    [subjectUser],
  );
  await pool.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'member')",
    [workspaceId, subjectUser],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, subject_user_id, requested_at)
     values ($1, $2, 'recipient-lock-erasure', 'erasure', 'running', 'privacy-operator', $3, now())`,
    [requestId, workspaceId, subjectUser],
  );

  const worker = await pool.connect();
  try {
    await worker.query("begin");
    await worker.query("set local role semforge_worker");
    await worker.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await worker.query(
      "select privacy_lock_recipient_email_shared($1::uuid, $2::text)",
      [workspaceId, recipientHash],
    );
    await worker.query("savepoint worker_exclusive_denied");
    await assert.rejects(
      worker.query(
        "select privacy_lock_recipient_email_exclusive($1::uuid, $2::text)",
        [workspaceId, recipientHash],
      ),
      /permission denied/i,
    );
    await worker.query("rollback to savepoint worker_exclusive_denied");
    await worker.query("savepoint invalid_hash");
    await assert.rejects(
      worker.query(
        "select privacy_lock_recipient_email_shared($1::uuid, 'ABC')",
        [workspaceId],
      ),
      /recipient email lock input is invalid/i,
    );
    await worker.query("rollback to savepoint invalid_hash");
    await worker.query("savepoint tenant_mismatch");
    await assert.rejects(
      worker.query(
        "select privacy_lock_recipient_email_shared($1::uuid, $2::text)",
        ["f6340000-0000-4000-8000-000000000002", recipientHash],
      ),
      /recipient email lock input is invalid/i,
    );
    await worker.query("rollback to savepoint tenant_mismatch");

    const dispatcher = await pool.connect();
    try {
      await dispatcher.query("begin");
      await dispatcher.query("set local role semforge_dispatcher");
      await dispatcher.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      await dispatcher.query(
        "select privacy_lock_recipient_email_shared($1::uuid, $2::text)",
        [workspaceId, recipientHash],
      );
      await dispatcher.query("commit");
    } catch (error) {
      await rollback(dispatcher);
      throw error;
    } finally {
      dispatcher.release();
    }

    const auth = await pool.connect();
    try {
      await auth.query("begin");
      await auth.query("set local role semforge_auth");
      await auth.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      await assert.rejects(
        auth.query(
          "select privacy_lock_recipient_email_shared($1::uuid, $2::text)",
          [workspaceId, recipientHash],
        ),
        /permission denied/i,
      );
    } finally {
      await rollback(auth);
      auth.release();
    }

    const blockedPrivacy = await pool.connect();
    try {
      await blockedPrivacy.query("begin");
      await blockedPrivacy.query("set local role semforge_privacy");
      await blockedPrivacy.query("set local statement_timeout = '200ms'");
      await blockedPrivacy.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      await assert.rejects(
        blockedPrivacy.query(
          "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
          [workspaceId, requestId, recipientHash],
        ),
        /canceling statement due to statement timeout/i,
      );
    } finally {
      await rollback(blockedPrivacy);
      blockedPrivacy.release();
    }
    await worker.query("commit");
  } catch (error) {
    await rollback(worker);
    throw error;
  } finally {
    worker.release();
  }

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await privacy.query(
      "select privacy_add_email_suppression($1::uuid, $2::uuid, $3::text)",
      [workspaceId, requestId, recipientHash],
    );
    await privacy.query("savepoint privacy_shared_denied");
    await assert.rejects(
      privacy.query(
        "select privacy_lock_recipient_email_shared($1::uuid, $2::text)",
        [workspaceId, recipientHash],
      ),
      /permission denied/i,
    );
    await privacy.query("rollback to savepoint privacy_shared_denied");
    await privacy.query("commit");
  } catch (error) {
    await rollback(privacy);
    throw error;
  } finally {
    privacy.release();
  }

  assert.deepEqual(
    (await pool.query<{ count: number }>(
      "select count(*)::int as count from email_suppressions where workspace_id = $1 and recipient_hash = $2",
      [workspaceId, recipientHash],
    )).rows,
    [{ count: 1 }],
  );
});

test("PostgreSQL 16 subject erasure는 accepted invite를 tombstone하고 membership FK에 막히지 않는다", async () => {
  const workspaceId = "f6320000-0000-4000-8000-000000000001";
  const subjectUser = "f6320000-0000-4000-8000-000000000011";
  const remainingOwner = "f6320000-0000-4000-8000-000000000012";
  const requestId = "f6320000-0000-4000-8000-000000000021";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Invite Tombstone', 'invite-tombstone')",
    [workspaceId],
  );
  await pool.query(
    `insert into users (id, email, password_hash, display_name, email_verified_at)
     values ($1, 'accepted-owner@example.test', 'scrypt:a', 'Accepted Owner', now()),
            ($2, 'remaining-owner@example.test', 'scrypt:b', 'Remaining Owner', now())`,
    [subjectUser, remainingOwner],
  );
  await pool.query(
    `insert into memberships (workspace_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'owner')`,
    [workspaceId, subjectUser, remainingOwner],
  );
  await pool.query(
    `insert into invites
       (email, token_hash, workspace_name, workspace_slug, role, expires_at, accepted_at,
        accepted_workspace_id, accepted_by_user_id)
     values
       ('accepted-owner@example.test', $1, 'Invite Tombstone', 'invite-tombstone',
        'owner', now() + interval '1 day', now(), $2, $3)`,
    ["1".repeat(64), workspaceId, subjectUser],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, subject_user_id, requested_at)
     values ($1, $2, 'subject-invite-tombstone', 'erasure', 'running', 'privacy-operator', $3, now())`,
    [requestId, workspaceId, subjectUser],
  );

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await privacy.query(
      "select privacy_erase_subject($1::uuid, $2::uuid, 'privacy-operator', $3::uuid, now())",
      [workspaceId, requestId, subjectUser],
    );
    await privacy.query("commit");
  } catch (error) {
    await rollback(privacy);
    throw error;
  } finally {
    privacy.release();
  }

  const tombstoned = (await pool.query<{
      email: string;
      accepted_workspace_id: string;
      accepted_by_user_id: string | null;
      accepted_erased: boolean;
      subject_membership: number;
      owner_count: number;
    }>(
      `select invite.email,
              invite.accepted_workspace_id::text,
              invite.accepted_by_user_id::text,
              invite.accepted_erased_at is not null as accepted_erased,
              (select count(*)::int from memberships where workspace_id = $1 and user_id = $2) subject_membership,
              (select count(*)::int from memberships where workspace_id = $1 and role = 'owner') owner_count
         from invites invite
        where invite.accepted_workspace_id = $1`,
      [workspaceId, subjectUser],
    )).rows;
  assert.equal(tombstoned.length, 1);
  assert.match(tombstoned[0]!.email, /^erased:[0-9a-f]{64}$/u);
  assert.notEqual(tombstoned[0]!.email, "accepted-owner@example.test");
  assert.deepEqual(tombstoned[0], {
    email: tombstoned[0]!.email,
    accepted_workspace_id: workspaceId,
    accepted_by_user_id: null,
    accepted_erased: true,
    subject_membership: 0,
    owner_count: 1,
  });
});

test("PostgreSQL 16 subject erasure는 동시 owner 삭제를 workspace 단위로 직렬화해 last owner를 보존한다", async () => {
  const workspaceId = "f6330000-0000-4000-8000-000000000001";
  const ownerA = "f6330000-0000-4000-8000-000000000011";
  const ownerB = "f6330000-0000-4000-8000-000000000012";
  const requestA = "f6330000-0000-4000-8000-000000000021";
  const requestB = "f6330000-0000-4000-8000-000000000022";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Owner Race', 'owner-race')",
    [workspaceId],
  );
  await pool.query(
    `insert into users (id, email, password_hash, email_verified_at)
     values ($1, 'race-a@example.test', 'scrypt:a', now()),
            ($2, 'race-b@example.test', 'scrypt:b', now())`,
    [ownerA, ownerB],
  );
  await pool.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'owner')",
    [workspaceId, ownerA, ownerB],
  );
  await pool.query(
    `insert into privacy_requests
       (id, workspace_id, request_id, type, status, operator_id, subject_user_id, requested_at)
     values ($1, $3, 'owner-race-a', 'erasure', 'running', 'privacy-operator', $4, now()),
            ($2, $3, 'owner-race-b', 'erasure', 'running', 'privacy-operator', $5, now())`,
    [requestA, requestB, workspaceId, ownerA, ownerB],
  );
  await pool.query(`
    create function test_sleep_owner_race_membership_delete() returns trigger
    language plpgsql as $$
    begin
      if old.workspace_id = '${workspaceId}'::uuid then
        perform pg_sleep(0.25);
      end if;
      return old;
    end;
    $$`);
  await pool.query(`
    create trigger test_sleep_owner_race_membership_delete
    before delete on memberships
    for each row execute function test_sleep_owner_race_membership_delete()`);

  const erase = async (requestIdForSubject: string, subjectUserId: string): Promise<unknown> => {
    const privacy = await pool.connect();
    try {
      await privacy.query("begin");
      await privacy.query("set local role semforge_privacy");
      await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      await privacy.query(
        "select privacy_erase_subject($1::uuid, $2::uuid, 'privacy-operator', $3::uuid, now())",
        [workspaceId, requestIdForSubject, subjectUserId],
      );
      await privacy.query("commit");
      return "committed";
    } catch (error) {
      await rollback(privacy);
      return error;
    } finally {
      privacy.release();
    }
  };

  try {
    const results = await Promise.all([
      erase(requestA, ownerA),
      erase(requestB, ownerB),
    ]);
    const committed = results.filter((result) => result === "committed");
    const rejected = results.filter((result) => result instanceof Error);
    assert.equal(committed.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(String((rejected[0] as Error).message), /ownership transfer or workspace_deletion/u);
    assert.deepEqual(
      (await pool.query<{ owner_count: number; membership_count: number }>(
        `select
           (select count(*)::int from memberships where workspace_id = $1 and role = 'owner') owner_count,
           (select count(*)::int from memberships where workspace_id = $1) membership_count`,
        [workspaceId],
      )).rows,
      [{ owner_count: 1, membership_count: 1 }],
    );
  } finally {
    await pool.query("drop trigger if exists test_sleep_owner_race_membership_delete on memberships");
    await pool.query("drop function if exists test_sleep_owner_race_membership_delete()");
  }
});

test("PostgreSQL 16 privacy 운영 역할은 raw table 대신 승인 request 함수만 실행한다", async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role semforge_privacy");
    await client.query("select set_config('app.workspace_id', $1, true)", [
      "f6300000-0000-4000-8000-000000000002",
    ]);
    await client.query(
      "select privacy_workspace_lock_key('f6300000-0000-4000-8000-000000000002'::uuid)",
    );
    for (const sql of [
      "select id from privacy_requests limit 1",
      "select id from privacy_request_steps limit 1",
      "select state from workspace_privacy_controls limit 1",
      "select id from workspaces limit 1",
      "select workspace_id from memberships limit 1",
      "select workspace_id from legal_acceptances limit 1",
      "select id from invites limit 1",
      "delete from invites where false",
      "update workspaces set name = name where false",
    ]) {
      await client.query("savepoint privacy_direct_denied");
      await assert.rejects(client.query(sql), /permission denied/i);
      await client.query("rollback to savepoint privacy_direct_denied");
    }
  } finally {
    await rollback(client);
    client.release();
  }
});

// @TASK P1-FINAL-PRIVACY - Issuer, executor, retention, and fence privilege contract
// @SPEC final_privacy_roles#postgresql-16-negative-contract
test("PostgreSQL 16 privacy issuer/executor와 retention은 요청 위조 및 직접 domain DML을 거부한다", async () => {
  const workspaceA = "f6900000-0000-4000-8000-000000000001";
  const workspaceB = "f6900000-0000-4000-8000-000000000002";
  const subjectUser = "f6900000-0000-4000-8000-000000000003";
  await pool.query(
    "insert into workspaces (id, name, slug) values ($1, 'Privacy roles A', 'privacy-roles-a'), ($2, 'Privacy roles B', 'privacy-roles-b')",
    [workspaceA, workspaceB],
  );
  await pool.query(
    "insert into users (id, email, password_hash, display_name) values ($1, 'privacy-roles-subject@example.test', 'scrypt:subject', 'Subject')",
    [subjectUser],
  );
  await pool.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [workspaceA, subjectUser],
  );
  const ownerRoles = await pool.query<{
    rolname: string;
    rolcanlogin: boolean;
    runtime_member: boolean;
  }>(
    `select owner.rolname, owner.rolcanlogin,
            pg_has_role(runtime.oid, owner.oid, 'MEMBER') as runtime_member
       from pg_roles owner
       join pg_roles runtime on runtime.rolname = case owner.rolname
         when 'semforge_privacy_owner' then 'semforge_privacy'
         else 'semforge_retention'
       end
      where owner.rolname in ('semforge_privacy_owner', 'semforge_retention_owner')
      order by owner.rolname`,
  );
  assert.deepEqual(ownerRoles.rows, [
    { rolname: "semforge_privacy_owner", rolcanlogin: false, runtime_member: false },
    { rolname: "semforge_retention_owner", rolcanlogin: false, runtime_member: false },
  ]);

  const operator = await pool.connect();
  let requestId = "";
  try {
    await operator.query("begin");
    await operator.query("set local role semforge_operator");
    const opened = await operator.query<{ id: string; status: string }>(
      "select id::text, status from privacy_open_request($1::uuid, 'approved-delete', 'workspace_deletion', 'operator-a', now())",
      [workspaceA],
    );
    requestId = opened.rows[0]!.id;
    assert.equal(opened.rows[0]!.status, "queued");
    await operator.query("savepoint direct_request");
    await assert.rejects(
      operator.query(
        "insert into privacy_requests (workspace_id, request_id, type, status, operator_id, requested_at) values ($1, 'forged', 'workspace_deletion', 'running', 'operator-a', now())",
        [workspaceA],
      ),
      /permission denied/i,
    );
    await operator.query("rollback to savepoint direct_request");
    await operator.query("savepoint duplicate_mismatch");
    await assert.rejects(
      operator.query(
        "select * from privacy_open_request($1::uuid, 'approved-delete', 'export', 'operator-a', now(), $2::uuid)",
        [workspaceA, subjectUser],
      ),
      /duplicate identity mismatch/i,
    );
    await operator.query("rollback to savepoint duplicate_mismatch");
    await operator.query("commit");
  } catch (error) {
    await rollback(operator);
    throw error;
  } finally {
    operator.release();
  }

  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceA]);
    assert.deepEqual(
      (await privacy.query<{ id: string; status: string }>(
        "select id::text, status from privacy_claim_request($1::uuid, 'approved-delete', 'workspace_deletion', 'operator-a', now())",
        [workspaceA],
      )).rows,
      [{ id: requestId, status: "running" }],
    );
    for (const sql of [
      `insert into privacy_requests (workspace_id, request_id, type, status, operator_id, requested_at)
       values ('${workspaceA}', 'forged', 'workspace_deletion', 'running', 'operator-a', now())`,
      "update privacy_requests set operator_id = 'attacker' where id = '" + requestId + "'::uuid",
      "delete from privacy_requests where id = '" + requestId + "'::uuid",
      "delete from jobs where false",
      "update billing_ledger_events set entity_id = entity_id where false",
      "delete from rank_observations where false",
    ]) {
      await privacy.query("savepoint denied_direct_dml");
      await assert.rejects(privacy.query(sql), /permission denied/i);
      await privacy.query("rollback to savepoint denied_direct_dml");
    }
    await privacy.query("savepoint cross_tenant_block");
    await assert.rejects(
      privacy.query("select privacy_block_workspace($1::uuid, $2::uuid, 'operator-a', now())", [
        workspaceB,
        requestId,
      ]),
      /does not match tenant context|matching running deletion/i,
    );
    await privacy.query("rollback to savepoint cross_tenant_block");
  } finally {
    await rollback(privacy);
    privacy.release();
  }

  const retention = await pool.connect();
  try {
    await retention.query("begin");
    await retention.query("set local role semforge_retention");
    for (const sql of [
      "select id from jobs limit 1",
      "delete from jobs where false",
      "update deliveries set recipient = recipient where false",
      "select id from privacy_requests limit 1",
      "select id from billing_ledger_events limit 1",
    ]) {
      await retention.query("savepoint denied_retention_dml");
      await assert.rejects(retention.query(sql), /permission denied/i);
      await retention.query("rollback to savepoint denied_retention_dml");
    }
    await assert.rejects(
      retention.query("select privacy_retention_apply('billing_ledger_events', now())"),
      /target is not allowed/i,
    );
  } finally {
    await rollback(retention);
    retention.release();
  }
});

test("PostgreSQL 16 workspace privacy control은 active 자동 생성 후 단방향 fence와 신규 write 차단을 강제한다", async () => {
  const workspaceId = "f6910000-0000-4000-8000-000000000001";
  await pool.query("insert into workspaces (id, name, slug) values ($1, 'Fence controls', 'fence-controls')", [
    workspaceId,
  ]);
  assert.deepEqual(
    (await pool.query("select state, generation::int from workspace_privacy_controls where workspace_id = $1", [workspaceId])).rows,
    [{ state: "active", generation: 0 }],
  );
  const opened = await pool.query<{ id: string }>(
    "select id::text from privacy_open_request($1::uuid, 'fence-delete', 'workspace_deletion', 'operator-fence', now())",
    [workspaceId],
  );
  const requestId = opened.rows[0]!.id;
  const privacy = await pool.connect();
  try {
    await privacy.query("begin");
    await privacy.query("set local role semforge_privacy");
    await privacy.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await privacy.query(
      "select * from privacy_claim_request($1::uuid, 'fence-delete', 'workspace_deletion', 'operator-fence', now())",
      [workspaceId],
    );
    assert.deepEqual(
      (await privacy.query("select privacy_block_workspace($1::uuid, $2::uuid, 'operator-fence', now()) as state", [workspaceId, requestId])).rows,
      [{ state: "blocking" }],
    );
    await privacy.query("commit");
  } catch (error) {
    await rollback(privacy);
    throw error;
  } finally {
    privacy.release();
  }
  await pool.query(
    "insert into jobs (workspace_id, type, payload, idempotency_key) values ($1, 'collect.google', '{}'::jsonb, 'blocking-finalization')",
    [workspaceId],
  );
  const erase = await pool.connect();
  try {
    await erase.query("begin");
    await erase.query("set local role semforge_privacy");
    await erase.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await erase.query("select privacy_erase_workspace($1::uuid, $2::uuid, 'operator-fence')", [workspaceId, requestId]);
    await erase.query(
      "select privacy_record_request_step($1::uuid,$2::uuid,'operator-fence','local.erasure','succeeded',null,'{}'::jsonb,now())",
      [workspaceId, requestId],
    );
    await erase.query("select privacy_mark_workspace_erased($1::uuid,$2::uuid,'operator-fence',now())", [workspaceId, requestId]);
    await erase.query("commit");
  } catch (error) {
    await rollback(erase);
    throw error;
  } finally {
    erase.release();
  }
  await assert.rejects(
    pool.query("insert into jobs (workspace_id, type, payload, idempotency_key) values ($1, 'collect.google', '{}'::jsonb, 'blocked-write')", [workspaceId]),
    /unavailable by privacy control/i,
  );
  const web = await pool.connect();
  try {
    await web.query("begin");
    await web.query("set local role semforge_web");
    await web.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
    await assert.rejects(
      web.query("delete from workspace_privacy_controls where workspace_id = $1", [workspaceId]),
      /permission denied/i,
    );
  } finally {
    await rollback(web);
    web.release();
  }
});
