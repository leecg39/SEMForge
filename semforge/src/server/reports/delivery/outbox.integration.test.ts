// @TASK P4-R1-T1 - Automatic report delivery outbox contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

before(async () => {
  await database.waitReady;
  await migrate(drizzle(database), { migrationsFolder });
  await database.query(
    "insert into workspaces (id, name, slug) values ($1, 'Delivery Workspace', 'delivery-outbox')",
    [workspaceId],
  );
  await database.query(
    "insert into sites (id, workspace_id, name, domain) values ($1, $2, 'Site', 'example.test')",
    [siteId, workspaceId],
  );
  await database.query(
    "insert into users (id, email, password_hash, email_verified_at) values ($1, 'owner@example.test', 'hash', now())",
    [userId],
  );
  await database.query(
    "insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')",
    [workspaceId, userId],
  );
});

after(async () => database.close());

test("snapshot 생성은 PDF와 owner email delivery outbox를 자동·멱등 예약한다", async () => {
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
    "select topic, payload, idempotency_key from outbox where workspace_id = $1 order by topic",
    [workspaceId],
  );
  assert.deepEqual(outbox.rows.map((row) => row.topic), ["report.email.deliver", "report.pdf.render"]);
  assert.deepEqual(outbox.rows.map((row) => row.payload), [
    { reportId: first.id, recipient: "owner@example.test" },
    { reportId: first.id },
  ]);
  assert.doesNotMatch(outbox.rows[0]!.idempotency_key, /owner@example\.test/);
  assert.match(outbox.rows[0]!.idempotency_key, new RegExp(`^report-email:${first.id}:`));
  assert.equal(outbox.rows[1]!.idempotency_key, `report-pdf:${first.id}`);
});

test("auth가 해석한 owner 수신자로 worker role도 users 접근 없이 delivery를 예약한다", async () => {
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
  assert.deepEqual(recipients, ["owner@example.test"]);

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
  assert.deepEqual(queued.rows, [{ payload: { reportId: queued.rows[0]!.payload.reportId, recipient: "owner@example.test" } }]);
});

test("privacy suppression hash가 있는 owner는 report email outbox 대상에서 제외된다", async () => {
  await database.query(
    "insert into email_suppressions (workspace_id, email_hash, reason) values ($1, $2, 'privacy_erasure') on conflict do nothing",
    [workspaceId, createHash("sha256").update("owner@example.test", "utf8").digest("hex")],
  );
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

  assert.deepEqual(recipients, []);
});
