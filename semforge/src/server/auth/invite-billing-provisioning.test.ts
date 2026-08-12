// @TASK P2-RUNTIME-FIX - Invite acceptance provisions billing account atomically
// @SPEC user-approved-plan#인증과-GSC
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { PostgresAuthStore } from "@/server/auth/postgres-store";

const pg = new PGlite();
const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

before(async () => {
  await pg.waitReady;
  await migrate(drizzle(pg), { migrationsFolder });
});

after(async () => pg.close());

test("acceptInviteAtomic provisions billing_customers and account_created subscription in the same transaction", async () => {
  // Keep the fixture relative to PostgreSQL's real clock so the seven-day DB
  // constraint remains valid after the original test date has passed.
  const now = new Date(Date.now() + 60_000);
  const tokenHash = sha256("invite-billing-token");
  const store = new PostgresAuthStore(drizzle(pg) as never);

  await pg.query(
    `insert into invites (email, token_hash, workspace_name, workspace_slug, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [
      "billing-owner@example.com",
      tokenHash,
      "Billing Agency",
      "billing-agency",
      new Date(now.getTime() + 86_400_000),
    ],
  );

  const accepted = await store.acceptInviteAtomic({
    tokenHash,
    email: "billing-owner@example.com",
    user: {
      kind: "new",
      passwordHash: "argon2id-test-hash",
      displayName: "Billing Owner",
    },
    sessionTokenHash: sha256("session-token"),
    sessionExpiresAt: new Date(now.getTime() + 86_400_000),
    now,
  });

  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.status === "accepted" && accepted.principal.role, "owner");

  const rows = await pg.query<{
    customer_count: number;
    subscription_count: number;
    status: string;
    amount_krw: number;
  }>(
    `select
       count(distinct bc.id)::int as customer_count,
       count(distinct s.id)::int as subscription_count,
       max(s.status)::text as status,
       max(s.amount_krw)::int as amount_krw
     from billing_customers bc
     join subscriptions s on s.workspace_id = bc.workspace_id and s.billing_customer_id = bc.id
     where bc.workspace_id = $1`,
    [accepted.status === "accepted" ? accepted.principal.workspaceId : ""],
  );

  assert.deepEqual(rows.rows[0], {
    customer_count: 1,
    subscription_count: 1,
    status: "account_created",
    amount_krw: 49000,
  });
});
