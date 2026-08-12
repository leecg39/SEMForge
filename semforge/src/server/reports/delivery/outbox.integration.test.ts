// @TASK P4-R1-T1 - Automatic report delivery outbox contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { loadReportOwnerRecipients } from "@/server/reports/delivery/outbox";
import { generateWeeklyReport } from "@/server/reports/store";

const database = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const workspaceId = "5a000000-0000-4000-8000-000000000001";
const siteId = "5a000000-0000-4000-8000-000000000002";
const userId = "5a000000-0000-4000-8000-000000000003";
const adminUserId = "5a000000-0000-4000-8000-000000000004";
const memberUserId = "5a000000-0000-4000-8000-000000000005";
const otherAdminUserId = "5a000000-0000-4000-8000-000000000006";
const otherWorkspaceId = "5a000000-0000-4000-8000-000000000007";

before(async () => {
  await database.waitReady;
  await migrate(drizzle(database), { migrationsFolder });
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Delivery Workspace', 'delivery-outbox')",
    [workspaceId],
  );
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Other Workspace', 'delivery-outbox-other')",
    [otherWorkspaceId],
  );
  await database.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Site', 'example.test')",
    [siteId, workspaceId],
  );
  await database.query(
    `insert into users (id, email, password_hash, email_verified_at)
     values ($1, 'owner@example.test', 'hash', now()),
            ($2, 'admin@example.test', 'hash', now()),
            ($3, 'member@example.test', 'hash', now()),
            ($4, 'other-admin@example.test', 'hash', now())`,
    [userId, adminUserId, memberUserId, otherAdminUserId],
  );
  await database.query(
    `insert into memberships (workspace_id, user_id, role)
     values ($1, $2, 'owner'),
            ($1, $3, 'admin'),
            ($1, $4, 'member'),
            ($5, $6, 'admin')`,
    [workspaceId, userId, adminUserId, memberUserId, otherWorkspaceId, otherAdminUserId],
  );
});

after(async () => database.close());

test("snapshot 생성은 PDF와 owner/admin email delivery outbox를 자동·멱등 예약한다", async () => {
  const first = await generateWeeklyReport(database, {
    workspaceId,
    siteId,
    cycleMonday: "2026-08-10",
  });
  const replay = await generateWeeklyReport(database, {
    workspaceId,
    siteId,
    cycleMonday: "2026-08-10",
  });
  assert.equal(replay.id, first.id);

  const outbox = await database.query<{
    topic: string;
    payload: Record<string, unknown>;
    idempotency_key: string;
  }>(
    "select topic, payload, idempotency_key from outbox where workspace_id = $1 order by topic, idempotency_key",
    [workspaceId],
  );
  assert.deepEqual(outbox.rows.map((row) => row.topic), [
    "report.email.deliver",
    "report.email.deliver",
    "report.pdf.render",
  ]);
  assert.deepEqual(
    outbox.rows.slice(0, 2).map((row) => (row.payload as { recipient: string }).recipient).sort(),
    ["admin@example.test", "owner@example.test"],
  );
  assert.deepEqual(outbox.rows[2]!.payload, { reportId: first.id });
  for (const row of outbox.rows.slice(0, 2)) {
    assert.doesNotMatch(row.idempotency_key, /(?:admin|owner)@example\.test/);
    assert.match(row.idempotency_key, new RegExp(`^report-email:${first.id}:`));
  }
  assert.equal(outbox.rows[2]!.idempotency_key, `report-pdf:${first.id}`);
});

test("auth가 해석한 owner/admin 수신자로 worker role도 users 접근 없이 delivery를 예약한다", async () => {
  await database.query("begin");
  let recipients: readonly string[];
  try {
    await database.query("set local role semforge_auth");
    recipients = await loadReportOwnerRecipients(database, workspaceId);
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
  assert.deepEqual(recipients, ["admin@example.test", "owner@example.test"]);

  await database.query(
    "delete from outbox where workspace_id = $1 and topic = 'report.email.deliver'",
    [workspaceId],
  );
  await database.query("set role semforge_worker");
  try {
    await assert.rejects(database.query("select email from users"));
    await generateWeeklyReport(
      database,
      { workspaceId, siteId, cycleMonday: "2026-08-10" },
      { ownerRecipients: recipients },
    );
  } finally {
    await database.query("reset role");
  }

  const queued = await database.query<{ payload: Record<string, unknown> }>(
    "select payload from outbox where workspace_id = $1 and topic = 'report.email.deliver'",
    [workspaceId],
  );
  assert.deepEqual(
    queued.rows.map((row) => row.payload.recipient).sort(),
    ["admin@example.test", "owner@example.test"],
  );
});
