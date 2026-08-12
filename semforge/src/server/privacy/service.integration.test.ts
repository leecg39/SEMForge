// @TASK P5-PRIVACY - Operator-only DSAR, deletion, and retention lifecycle
// @SPEC paid-beta privacy lifecycle blockers
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import {
  createPrivacyService,
  parsePrivacyRetentionPolicy,
  runPrivacyRetention,
  type PrivacyProcessorClient,
  type PrivacyRetentionPolicy,
} from "@/server/privacy/service";

const databases: PGlite[] = [];
const workspaceA = "00000000-0000-4000-8000-00000000a501";
const workspaceB = "00000000-0000-4000-8000-00000000b501";
const userA = "00000000-0000-4000-8000-00000000a502";
const userB = "00000000-0000-4000-8000-00000000b502";
const reportA = "00000000-0000-4000-8000-00000000a503";
const siteA = "00000000-0000-4000-8000-00000000a504";
const gscA = "00000000-0000-4000-8000-00000000a505";
const assetA = "00000000-0000-4000-8000-00000000a506";
const syntheticRetentionPolicy: PrivacyRetentionPolicy = {
  expiredSessionsDays: 30,
  consumedInvitesDays: 30,
  passwordResetsDays: 7,
  oauthStatesDays: 7,
  publishedOutboxDays: 30,
  terminalJobsDays: 30,
  providerRawMetadataDays: 30,
  deliveryRecipientDays: 90,
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function migratedDb(): Promise<PGlite> {
  const pg = new PGlite();
  databases.push(pg);
  await pg.waitReady;
  await migrate(drizzle(pg), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  return pg;
}

async function seedPrivacySubject(pg: PGlite) {
  await pg.query(
    `insert into users (id, email, password_hash, display_name, email_verified_at)
     values ($1, 'owner-a@example.test', 'scrypt:a', 'Owner A', now()),
            ($2, 'owner-b@example.test', 'scrypt:b', 'Owner B', now())`,
    [userA, userB],
  );
  await pg.query(
    `insert into workspaces (id, name, slug, logo_url)
     values ($1, 'Agency A', 'agency-a', 'https://cdn.example.test/logo-a.png'),
            ($2, 'Agency B', 'agency-b', 'https://cdn.example.test/logo-b.png')`,
    [workspaceA, workspaceB],
  );
  await pg.query(
    `insert into memberships (workspace_id, user_id, role)
     values ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [workspaceA, userA, workspaceB, userB],
  );
  await pg.query(
    `insert into sites (id, workspace_id, name, domain)
     values ($1, $2, 'Site A', 'a.example.test')`,
    [siteA, workspaceA],
  );
  await pg.query(
    `insert into gsc_connections
       (id, workspace_id, label, access_token_encrypted, refresh_token_encrypted, token_expires_at)
     values ($1, $2, 'GSC A', 'enc:v1:access', 'enc:v1:refresh', now() + interval '1 hour')`,
    [gscA, workspaceA],
  );
  await pg.query(
    `insert into weekly_reports
       (id, workspace_id, site_id, status, period_start, period_end, comparison_start, comparison_end,
        snapshot, brand_name, logo_url, accent_color, snapshot_ready_at, delivered_at)
     values ($1, $2, $3, 'delivered', '2026-08-01', '2026-08-07', '2026-07-25', '2026-07-31',
       '{"version":1,"brand":{"name":"Agency A","logoUrl":"https://cdn.example.test/logo-a.png","accentColor":"#2563EB"},"sections":{}}'::jsonb,
       'Agency A', 'https://cdn.example.test/logo-a.png', '#2563EB', now(), now())`,
    [reportA, workspaceA, siteA],
  );
  await pg.query(
    `insert into report_assets
       (id, workspace_id, report_id, kind, storage_key, content_type, checksum_sha256, size_bytes)
     values ($1, $2, $3, 'pdf', 'reports/a/report.pdf', 'application/pdf', $4, 1234)`,
    [assetA, workspaceA, reportA, digest("pdf")],
  );
  await pg.query(
    `insert into deliveries
       (workspace_id, report_id, channel, recipient, status, idempotency_key, delivered_at)
     values ($1, $2, 'email', 'owner-a@example.test', 'delivered', 'delivery-a', now())`,
    [workspaceA, reportA],
  );
  await pg.query(
    `insert into billing_customers (workspace_id, toss_customer_key)
     values ($1, 'customer-a'), ($2, 'customer-b')`,
    [workspaceA, workspaceB],
  );
  await pg.query(
    `insert into billing_ledger_events
       (workspace_id, type, entity_id, occurred_at, amount_krw, order_id, payment_status, metadata)
     values ($1, 'charge.succeeded', 'pay-a', now(), 49000, 'order-a', 'paid', '{"email":"owner-a@example.test"}'::jsonb)`,
    [workspaceA],
  );
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

test("retention policy는 운영자가 주입한 명시 JSON만 허용하고 기본 기간을 코드에서 만들지 않는다", () => {
  assert.throws(() => parsePrivacyRetentionPolicy(undefined), /PRIVACY_RETENTION_POLICY is required/u);
  assert.throws(
    () => parsePrivacyRetentionPolicy(JSON.stringify({ ...syntheticRetentionPolicy, extra: 1 })),
    /unknown keys/u,
  );
  assert.deepEqual(
    parsePrivacyRetentionPolicy(JSON.stringify(syntheticRetentionPolicy)),
    syntheticRetentionPolicy,
  );
});

test("운영자 DSAR export는 tenant 경계를 지키고 token/billing key 원문을 내보내지 않는다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const service = createPrivacyService({ db: pg });

  const exported = await service.exportWorkspaceSubject({
    workspaceId: workspaceA,
    operatorId: "operator-1",
    requestId: "dsar-export-1",
    now: new Date("2026-08-12T02:00:00.000Z"),
  });

  assert.equal(exported.workspace.id, workspaceA);
  assert.equal(exported.users[0]?.email, "owner-a@example.test");
  assert.equal(exported.users.some((user) => user.id === userB), false);
  assert.equal(JSON.stringify(exported).includes("enc:v1:"), false);
  assert.equal(JSON.stringify(exported).includes("customer-b"), false);
});

test("삭제 workflow는 외부 processor 실패 시 local immutable report 삭제를 실행하지 않고 failed audit으로 닫는다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const processor: PrivacyProcessorClient = {
    revokeGscConnection: async () => {
      throw new Error("google revoke failed");
    },
    deleteObject: async () => undefined,
    markEmailSuppressed: async () => undefined,
  };
  const service = createPrivacyService({ db: pg, processor });

  const result = await service.deleteWorkspaceSubject({
    workspaceId: workspaceA,
    operatorId: "operator-1",
    requestId: "dsar-delete-failed",
    now: new Date("2026-08-12T03:00:00.000Z"),
  });

  assert.equal(result.status, "failed");
  const report = await pg.query<{ count: number }>(
    "select count(*)::int as count from weekly_reports where workspace_id = $1 and id = $2",
    [workspaceA, reportA],
  );
  assert.equal(report.rows[0]!.count, 1);
  const failed = await pg.query<{ status: string; step_key: string }>(
    `select step.status, step.step_key
       from privacy_request_steps step
       join privacy_requests request
         on request.workspace_id = step.workspace_id and request.id = step.request_id
      where request.workspace_id = $1 and request.request_id = $2
      order by step.step_key`,
    [workspaceA, result.requestId],
  );
  assert.ok(failed.rows.some((row) =>
    row.step_key === `gsc.revoke:${gscA}` && row.status === "failed"
  ));
});

test("삭제 workflow 성공 시 GSC revoke·object delete 후 privacy erasure procedure로 immutable report와 workspace PII를 제거한다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const calls: string[] = [];
  const processor: PrivacyProcessorClient = {
    revokeGscConnection: async (input) => {
      calls.push(`gsc:${input.connectionId}`);
    },
    deleteObject: async (input) => {
      calls.push(`object:${input.storageKey}`);
    },
    markEmailSuppressed: async (input) => {
      calls.push(`email:${input.emailHash}:${input.requestUuid}`);
    },
  };
  const service = createPrivacyService({ db: pg, processor });

  const result = await service.deleteWorkspaceSubject({
    workspaceId: workspaceA,
    operatorId: "operator-1",
    requestId: "dsar-delete-ok",
    now: new Date("2026-08-12T04:00:00.000Z"),
  });

  assert.equal(result.status, "completed");
  const requestUuid = (
    await pg.query<{ id: string }>(
      "select id::text from privacy_requests where workspace_id = $1 and request_id = $2",
      [workspaceA, "dsar-delete-ok"],
    )
  ).rows[0]!.id;
  assert.deepEqual(calls.sort(), [
    `email:${digest("owner-a@example.test")}:${requestUuid}`,
    `gsc:${gscA}`,
    "object:reports/a/report.pdf",
  ]);
  const counts = await pg.query<{ reports: number; assets: number; gsc: number; deliveries: number }>(
    `select
       (select count(*)::int from weekly_reports where workspace_id = $1) reports,
       (select count(*)::int from report_assets where workspace_id = $1) assets,
       (select count(*)::int from gsc_connections where workspace_id = $1) gsc,
       (select count(*)::int from deliveries where workspace_id = $1 and recipient !~ '^erased:') deliveries`,
    [workspaceA],
  );
  assert.deepEqual(counts.rows[0], { reports: 0, assets: 0, gsc: 0, deliveries: 0 });

  const retained = await pg.query<{ metadata: unknown; count: number }>(
    `select metadata, count(*) over()::int as count
       from billing_ledger_events
      where workspace_id = $1 and type = 'charge.succeeded'`,
    [workspaceA],
  );
  assert.equal(retained.rows[0]!.count, 1);
  assert.equal(JSON.stringify(retained.rows[0]!.metadata).includes("owner-a@example.test"), false);
});

test("삭제 재실행은 성공한 대상별 step을 건너뛰고 실패 지점부터 재개하며 local erasure를 중복 실행하지 않는다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const calls: string[] = [];
  let failObjectOnce = true;
  const processor: PrivacyProcessorClient = {
    revokeGscConnection: async ({ connectionId }) => {
      calls.push(`gsc:${connectionId}`);
    },
    deleteObject: async ({ storageKey }) => {
      calls.push(`object:${storageKey}`);
      if (failObjectOnce) {
        failObjectOnce = false;
        throw new Error("temporary object deletion failure");
      }
    },
    markEmailSuppressed: async ({ emailHash }) => {
      calls.push(`email:${emailHash}`);
    },
  };
  const service = createPrivacyService({ db: pg, processor });
  const input = {
    workspaceId: workspaceA,
    operatorId: "operator-1",
    requestId: "dsar-delete-resume",
    now: new Date("2026-08-12T04:30:00.000Z"),
  };

  assert.deepEqual(await service.deleteWorkspaceSubject(input), {
    requestId: input.requestId,
    status: "failed",
  });
  assert.deepEqual(await service.deleteWorkspaceSubject({
    ...input,
    now: new Date("2026-08-12T04:31:00.000Z"),
  }), {
    requestId: input.requestId,
    status: "completed",
  });
  assert.deepEqual(await service.deleteWorkspaceSubject({
    ...input,
    now: new Date("2026-08-12T04:32:00.000Z"),
  }), {
    requestId: input.requestId,
    status: "completed",
  });

  assert.equal(calls.filter((call) => call.startsWith("gsc:")).length, 1);
  assert.equal(calls.filter((call) => call.startsWith("object:")).length, 2);
  assert.equal(calls.filter((call) => call.startsWith("email:")).length, 1);
  const steps = await pg.query<{ step_key: string; status: string; attempts: number }>(
    `select step.step_key, step.status, step.attempts
       from privacy_request_steps step
       join privacy_requests request
         on request.workspace_id = step.workspace_id and request.id = step.request_id
      where request.workspace_id = $1 and request.request_id = $2
      order by step_key`,
    [workspaceA, input.requestId],
  );
  assert.ok(steps.rows.some((step) =>
    step.step_key === `gsc.revoke:${gscA}` && step.status === "succeeded" && step.attempts === 1
  ));
  assert.ok(steps.rows.some((step) =>
    step.step_key === `objects.delete:${digest("reports/a/report.pdf")}` &&
    step.status === "succeeded" && step.attempts === 2
  ));
  assert.ok(steps.rows.some((step) =>
    step.step_key === "local.erasure" && step.status === "succeeded" && step.attempts === 1
  ));
});

test("삭제 서비스는 production processor가 없으면 외부/DB 삭제를 시작하지 않고 fail-closed한다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const service = createPrivacyService({ db: pg });

  await assert.rejects(
    service.deleteWorkspaceSubject({
      workspaceId: workspaceA,
      operatorId: "operator-1",
      requestId: "dsar-no-processor",
      now: new Date("2026-08-12T04:40:00.000Z"),
    }),
    /PRIVACY_PROCESSOR_NOT_CONFIGURED/u,
  );
  const state = await pg.query<{ reports: number; requests: number }>(
    `select
       (select count(*)::int from weekly_reports where workspace_id = $1) reports,
       (select count(*)::int from privacy_requests where workspace_id = $1 and request_id = $2) requests`,
    [workspaceA, "dsar-no-processor"],
  );
  assert.deepEqual(state.rows[0], { reports: 1, requests: 0 });
});

test("retention dry-run은 만료 대상만 계산하고 apply에서 세션·초대·reset·oauth·queue·recipient·provider metadata를 정리한다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const now = new Date("2026-08-12T05:00:00.000Z");
  await pg.query(
    `insert into sessions (workspace_id, user_id, token_hash, expires_at, revoked_at, created_at)
     values ($1, $2, $3, $4, $4, $4)`,
    [workspaceA, userA, digest("expired-session"), new Date("2026-01-01T00:00:00.000Z")],
  );
  await pg.query(
    `insert into password_resets (user_id, token_hash, expires_at, used_at, created_at)
     values ($1, $2, $3, $3, $3)`,
    [userA, digest("old-reset"), new Date("2026-01-01T00:00:00.000Z")],
  );
  await pg.query(
    `insert into oauth_states
       (workspace_id, user_id, state_hash, provider, connection_label, return_path, expires_at, consumed_at, created_at)
     values ($1, $2, $3, 'gsc', 'old', '/app/settings', $4, $4, $4)`,
    [workspaceA, userA, digest("old-oauth"), new Date("2026-01-01T00:00:00.000Z")],
  );
  await pg.query(
    `insert into provider_calls
       (workspace_id, provider, operation, idempotency_key, request_hash, status, response_metadata, completed_at, started_at)
     values ($1, 'gsc', 'query', 'old-provider', $2, 'succeeded',
       '{"rawResponse":{"email":"owner-a@example.test"},"kept":"yes"}'::jsonb, $3, $3)`,
    [workspaceA, digest("provider"), new Date("2026-01-01T00:00:00.000Z")],
  );
  await pg.query(
    `insert into jobs (workspace_id, type, status, payload, idempotency_key, available_at, updated_at, created_at)
     values ($1, 'retention.old', 'succeeded', '{"email":"owner-a@example.test"}'::jsonb, 'old-job', $2, $2, $2)`,
    [workspaceA, new Date("2026-01-01T00:00:00.000Z")],
  );
  await pg.query(
    `insert into outbox (workspace_id, topic, payload, idempotency_key, published_at, available_at, created_at)
     values ($1, 'retention.old', '{"email":"owner-a@example.test"}'::jsonb, 'old-outbox', $2, $2, $2)`,
    [workspaceA, new Date("2026-01-01T00:00:00.000Z")],
  );
  await pg.query(
    "update deliveries set created_at = $2 where workspace_id = $1",
    [workspaceA, new Date("2026-01-01T00:00:00.000Z")],
  );

  const policy = syntheticRetentionPolicy;
  const dryRun = await runPrivacyRetention({ db: pg, now, policy, dryRun: true });
  assert.equal(dryRun.dryRun, true);
  assert.ok(dryRun.items.find((item) => item.target === "sessions")!.matched >= 1);

  const applied = await runPrivacyRetention({ db: pg, now, policy, dryRun: false });
  assert.equal(applied.dryRun, false);
  const post = await pg.query<{
    sessions: number;
    resets: number;
    oauth: number;
    jobs: number;
    outbox: number;
    raw_response: unknown;
    plain_recipients: number;
  }>(
    `select
       (select count(*)::int from sessions where token_hash = $2) sessions,
       (select count(*)::int from password_resets where token_hash = $3) resets,
       (select count(*)::int from oauth_states where state_hash = $4) oauth,
       (select count(*)::int from jobs where idempotency_key = 'old-job') jobs,
       (select count(*)::int from outbox where idempotency_key = 'old-outbox') outbox,
       (select response_metadata->'rawResponse' from provider_calls where idempotency_key = 'old-provider') raw_response,
       (select count(*)::int from deliveries where workspace_id = $1 and recipient = 'owner-a@example.test') plain_recipients`,
    [workspaceA, digest("expired-session"), digest("old-reset"), digest("old-oauth")],
  );
  assert.deepEqual(post.rows[0], {
    sessions: 0,
    resets: 0,
    oauth: 0,
    jobs: 0,
    outbox: 0,
    raw_response: null,
    plain_recipients: 0,
  });
});

test("retention apply는 backup restore로 되살아난 report object key를 매번 version purge한 뒤 DB retention을 수행한다", async () => {
  const pg = await migratedDb();
  await seedPrivacySubject(pg);
  const request = await pg.query<{ id: string }>(
    `insert into privacy_requests
       (workspace_id, request_id, type, status, operator_id, requested_at, completed_at)
     values ($1, 'restored-object-erasure', 'deletion', 'completed', 'operator-1', now(), now())
     returning id::text`,
    [workspaceA],
  );
  await pg.query(
    `insert into backup_deletion_markers
       (workspace_id, request_id, marker_key, runbook_ref, metadata)
     values ($1, $2, 'backup-erasure-required', 'docs/ops/privacy-erasure-runbook.md',
       '{"storageKeys":["reports/a/report.pdf"]}'::jsonb)`,
    [workspaceA, request.rows[0]!.id],
  );
  const purged: string[] = [];
  const processor = {
    deleteObject: async ({ workspaceId, storageKey }: {
      workspaceId: string;
      storageKey: string;
    }) => {
      purged.push(`${workspaceId}:${storageKey}`);
    },
  };

  const dryRun = await runPrivacyRetention({
    db: pg,
    now: new Date("2026-08-12T06:00:00.000Z"),
    policy: syntheticRetentionPolicy,
    dryRun: true,
    processor,
  });
  assert.deepEqual(purged, []);
  assert.deepEqual(
    dryRun.items.find((item) => item.target === "backup-restored-objects"),
    { target: "backup-restored-objects", matched: 1 },
  );

  await runPrivacyRetention({
    db: pg,
    now: new Date("2026-08-12T06:01:00.000Z"),
    policy: syntheticRetentionPolicy,
    dryRun: false,
    processor,
  });
  await runPrivacyRetention({
    db: pg,
    now: new Date("2026-08-12T06:02:00.000Z"),
    policy: syntheticRetentionPolicy,
    dryRun: false,
    processor,
  });
  assert.deepEqual(purged, [
    `${workspaceA}:reports/a/report.pdf`,
    `${workspaceA}:reports/a/report.pdf`,
  ]);
});
