// @TASK P4-R1-T1 - Automatic report delivery outbox contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

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
