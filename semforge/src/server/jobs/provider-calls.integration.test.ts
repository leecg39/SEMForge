// @TASK P3-W1-T1 - Provider-call usage and idempotency coordination
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/provider-calls.ts
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { PostgresProviderCallCoordinator } from "@/server/jobs/provider-calls";

const databases: PGlite[] = [];
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function createDatabase(workspaceId: string): Promise<PGlite> {
  const database = new PGlite();
  databases.push(database);
  await database.waitReady;
  await migrate(drizzle(database), { migrationsFolder });
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Provider Calls', 'provider-calls')",
    [workspaceId],
  );
  return database;
}

test("같은 provider idempotency를 경쟁 예약해도 한 worker만 execute하고 완료 뒤에는 metadata를 replay한다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000001";
  const database = await createDatabase(workspaceId);
  const first = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-1",
    workerId: "worker-a",
  });
  const second = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-1",
    workerId: "worker-b",
  });
  const request = {
    provider: "talordata",
    operation: "google.serp",
    idempotencyKey: "google:kr:ko:desktop:query-1:2026-08-10",
    requestHash: "sha256:request-one",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-12T07:00:00.000Z"),
  } as const;

  const reservations = await Promise.all([first.reserve(request), second.reserve(request)]);
  assert.deepEqual(reservations.map((reservation) => reservation.disposition).sort(), [
    "execute",
    "in_doubt",
  ]);
  assert.equal(reservations[0]!.providerCallId, reservations[1]!.providerCallId);
  assert.equal(reservations[0]!.usageReservationId, reservations[1]!.usageReservationId);

  const executable = reservations.find((reservation) => reservation.disposition === "execute")!;
  await first.succeed({
    providerCallId: executable.providerCallId,
    usageReservationId: executable.usageReservationId,
    responseMetadata: { observationIds: ["observation-1"] },
    costUnits: 1,
  });

  const replay = await second.reserve(request);
  assert.equal(replay.disposition, "replay");
  assert.deepEqual(replay.responseMetadata, { observationIds: ["observation-1"] });

  const stored = await database.query<{
    call_count: number;
    reservation_count: number;
    call_status: string;
    reservation_status: string;
  }>(
    `select
       (select count(*)::int from provider_calls where workspace_id = $1) as call_count,
       (select count(*)::int from usage_reservations where workspace_id = $1) as reservation_count,
       (select status from provider_calls where workspace_id = $1) as call_status,
       (select status from usage_reservations where workspace_id = $1) as reservation_status`,
    [workspaceId],
  );
  assert.deepEqual(stored.rows, [{
    call_count: 1,
    reservation_count: 1,
    call_status: "succeeded",
    reservation_status: "consumed",
  }]);

  await assert.rejects(
    second.reserve({ ...request, requestHash: "sha256:different-request" }),
    /IDEMPOTENCY_CONFLICT/,
  );
});

test("잘못된 usage reservation으로 완료를 시도하면 provider call과 실제 reservation이 모두 원상태다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000002";
  const database = await createDatabase(workspaceId);
  const coordinator = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-atomic",
    workerId: "worker-atomic",
  });
  const reservation = await coordinator.reserve({
    provider: "talordata",
    operation: "google.serp",
    idempotencyKey: "google:atomic",
    requestHash: "sha256:atomic",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
  });

  await assert.rejects(
    coordinator.succeed({
      providerCallId: reservation.providerCallId,
      usageReservationId: "52000000-0000-4000-8000-000000000099",
      costUnits: 1,
    }),
    /PROVIDER_CALL_STATE_CONFLICT/,
  );

  const state = await database.query<{ call_status: string; usage_status: string }>(
    `select
       (select status from provider_calls where id = $1) as call_status,
       (select status from usage_reservations where id = $2) as usage_status`,
    [reservation.providerCallId, reservation.usageReservationId],
  );
  assert.deepEqual(state.rows, [{ call_status: "started", usage_status: "reserved" }]);
});

test("idempotency 충돌은 provider call, usage reservation, audit를 하나도 추가하지 않는다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000003";
  const database = await createDatabase(workspaceId);
  const coordinator = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-conflict",
    workerId: "worker-conflict",
  });
  const request = {
    provider: "talordata",
    operation: "google.serp",
    idempotencyKey: "google:conflict",
    requestHash: "sha256:conflict-original",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
  } as const;
  await coordinator.reserve(request);

  const before = await database.query<{ calls: number; reservations: number; audits: number }>(
    `select
       (select count(*)::int from provider_calls where workspace_id = $1) as calls,
       (select count(*)::int from usage_reservations where workspace_id = $1) as reservations,
       (select count(*)::int from audit_events where workspace_id = $1) as audits`,
    [workspaceId],
  );
  await assert.rejects(
    coordinator.reserve({
      ...request,
      requestHash: "sha256:conflict-different",
      resource: "unexpected-resource",
    }),
    /IDEMPOTENCY_CONFLICT/,
  );
  const after = await database.query<{ calls: number; reservations: number; audits: number }>(
    `select
       (select count(*)::int from provider_calls where workspace_id = $1) as calls,
       (select count(*)::int from usage_reservations where workspace_id = $1) as reservations,
       (select count(*)::int from audit_events where workspace_id = $1) as audits`,
    [workspaceId],
  );
  assert.deepEqual(after.rows, before.rows);
});

test("같은 workspace의 다른 provider call reservation으로 완료할 수 없다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000004";
  const database = await createDatabase(workspaceId);
  const coordinator = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-link",
    workerId: "worker-link",
  });
  const base = {
    provider: "talordata",
    operation: "google.serp",
    requestHash: "sha256:link",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
  } as const;
  const first = await coordinator.reserve({ ...base, idempotencyKey: "google:link:first" });
  const second = await coordinator.reserve({ ...base, idempotencyKey: "google:link:second" });

  await assert.rejects(
    coordinator.fail({
      providerCallId: first.providerCallId,
      usageReservationId: second.usageReservationId,
      errorCode: "PROVIDER_FAILED",
    }),
    /PROVIDER_CALL_STATE_CONFLICT/,
  );
  const states = await database.query<{ call_status: string; usage_status: string }>(
    `select call.status as call_status, usage.status as usage_status
       from provider_calls as call
       join usage_reservations as usage on usage.provider_call_id = call.id
      where call.id in ($1, $2)
      order by call.id`,
    [first.providerCallId, second.providerCallId],
  );
  assert.deepEqual(states.rows, [
    { call_status: "started", usage_status: "reserved" },
    { call_status: "started", usage_status: "reserved" },
  ]);
});

test("usage 전환 중 DB 오류가 발생하면 앞선 provider call 변경과 audit도 rollback한다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000005";
  const database = await createDatabase(workspaceId);
  const coordinator = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-rollback",
    workerId: "worker-rollback",
  });
  const reservation = await coordinator.reserve({
    provider: "talordata",
    operation: "google.serp",
    idempotencyKey: "google:rollback",
    requestHash: "sha256:rollback",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
  });
  await database.exec(`
    create function fail_usage_consumption() returns trigger language plpgsql as $$
    begin
      if new.status = 'consumed' then
        raise exception 'USAGE_TRANSITION_FAILED';
      end if;
      return new;
    end;
    $$;
    create trigger usage_consumption_failure before update on usage_reservations
      for each row execute function fail_usage_consumption();
  `);

  await assert.rejects(
    coordinator.succeed({
      providerCallId: reservation.providerCallId,
      usageReservationId: reservation.usageReservationId,
      costUnits: 1,
    }),
    /USAGE_TRANSITION_FAILED/,
  );
  const state = await database.query<{
    call_status: string;
    usage_status: string;
    succeeded_audits: number;
  }>(
    `select
       (select status from provider_calls where id = $1) as call_status,
       (select status from usage_reservations where id = $2) as usage_status,
       (select count(*)::int from audit_events
         where entity_id = $1::text and action = 'provider_call.succeeded') as succeeded_audits`,
    [reservation.providerCallId, reservation.usageReservationId],
  );
  assert.deepEqual(state.rows, [{
    call_status: "started",
    usage_status: "reserved",
    succeeded_audits: 0,
  }]);
});

test("usage reservation의 provider call 복합 FK는 cross-workspace 연결을 거부한다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000006";
  const otherWorkspaceId = "52000000-0000-4000-8000-000000000007";
  const database = await createDatabase(workspaceId);
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Other Provider Calls', 'other-provider-calls')",
    [otherWorkspaceId],
  );
  const call = await database.query<{ id: string }>(
    `insert into provider_calls
       (workspace_id, provider, operation, idempotency_key, request_hash)
     values ($1, 'talordata', 'google.serp', 'cross-workspace', 'sha256:cross-workspace')
     returning id::text`,
    [workspaceId],
  );

  await assert.rejects(
    database.query(
      `insert into usage_reservations
         (workspace_id, provider_call_id, provider, resource, units, idempotency_key,
          period_start, period_end, expires_at)
       values ($1, $2, 'talordata', 'serp', 1, 'cross-workspace',
               '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
               '2026-08-13T00:00:00.000Z')`,
      [otherWorkspaceId, call.rows[0]!.id],
    ),
    /usage_reservations_provider_call_fk/,
  );
});

test("known retryable 실패는 다음 job attempt에서 정확히 한 번 다시 execute할 수 있다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000008";
  const database = await createDatabase(workspaceId);
  const firstAttempt = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-retry-1",
    workerId: "worker-retry-1",
  });
  const request = {
    provider: "talordata",
    operation: "google.serp",
    idempotencyKey: "google:known-retryable",
    requestHash: "sha256:known-retryable",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-13T00:00:00.000Z"),
  } as const;
  const reserved = await firstAttempt.reserve(request);
  await firstAttempt.fail({
    providerCallId: reserved.providerCallId,
    usageReservationId: reserved.usageReservationId,
    errorCode: "rate_limit",
    disposition: "retryable",
  });

  const secondAttempt = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-retry-2",
    workerId: "worker-retry-2",
  });
  const competing = await Promise.all([
    secondAttempt.reserve({
      ...request,
      reservationExpiresAt: new Date("2026-08-14T00:00:00.000Z"),
    }),
    secondAttempt.reserve({
      ...request,
      reservationExpiresAt: new Date("2026-08-14T00:00:00.000Z"),
    }),
  ]);
  assert.deepEqual(competing.map((result) => result.disposition).sort(), ["execute", "in_doubt"]);
  assert.equal(competing[0]!.providerCallId, reserved.providerCallId);
});

test("aged started와 outcome unknown은 자동 재실행하지 않고 명시적 reconciliation 뒤에만 execute한다", async () => {
  const workspaceId = "52000000-0000-4000-8000-000000000009";
  const database = await createDatabase(workspaceId);
  let now = new Date("2026-08-12T00:00:00.000Z");
  const coordinator = new PostgresProviderCallCoordinator(database, {
    workspaceId,
    jobId: "job-provider-unknown",
    workerId: "worker-unknown",
    clock: () => now,
  });
  const request = {
    provider: "talordata",
    operation: "google.serp",
    idempotencyKey: "google:outcome-unknown",
    requestHash: "sha256:outcome-unknown",
    resource: "serp",
    units: 1,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    reservationExpiresAt: new Date("2026-08-12T00:05:00.000Z"),
  } as const;
  const reserved = await coordinator.reserve(request);
  now = new Date("2026-08-20T00:00:00.000Z");

  assert.equal((await coordinator.reserve(request)).disposition, "in_doubt");
  await coordinator.fail({
    providerCallId: reserved.providerCallId,
    usageReservationId: reserved.usageReservationId,
    errorCode: "timeout",
    disposition: "outcome_unknown",
  });
  assert.equal((await coordinator.reserve(request)).disposition, "in_doubt");

  await coordinator.reconcile({
    providerCallId: reserved.providerCallId,
    usageReservationId: reserved.usageReservationId,
    outcome: "retryable",
    reason: "provider confirmed no result",
  });
  assert.equal((await coordinator.reserve({
    ...request,
    reservationExpiresAt: new Date("2026-08-20T00:05:00.000Z"),
  })).disposition, "execute");
});
