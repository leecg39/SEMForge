import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "siteaudit-run-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

let enqueueSiteAuditRun: typeof import("@/server/siteaudit/run").enqueueSiteAuditRun;

const auth: AuthContext = {
  userId: "user-1",
  email: "owner@example.com",
  name: "Owner",
  workspaceId: "ws-1",
  workspaceName: "Workspace",
  workspacePlan: "pro",
  role: "owner",
  sessionId: "test",
  ip: null,
  userAgent: null,
};

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("foreign_keys = OFF");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  const now = Date.parse("2026-08-01T00:00:00Z");
  sqlite.prepare("INSERT INTO workspaces (id,name,slug,plan,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("ws-1", "Workspace", "workspace", "pro", now, now);
  sqlite.prepare("INSERT INTO workspaces (id,name,slug,plan,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("ws-2", "Other", "other", "pro", now, now);
  sqlite.prepare("INSERT INTO site_audit_campaigns (id,workspace_id,name,domain,page_limit,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,1)")
    .run("campaign-1", "ws-1", "Example", "example.com", 900, "completed", now, now);
  sqlite.prepare("INSERT INTO site_audit_campaigns (id,workspace_id,name,domain,page_limit,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,1)")
    .run("campaign-other", "ws-2", "Other", "other.com", 10, "idle", now, now);
  sqlite.close();
  ({ enqueueSiteAuditRun } = await import("@/server/siteaudit/run"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("enqueue persists one active run and clamps the engine page limit", async () => {
  const first = await enqueueSiteAuditRun(auth, "campaign-1");
  assert.equal(first.status, "queued");
  assert.equal(first.pageLimit, 500);

  await assert.rejects(
    () => enqueueSiteAuditRun(auth, "campaign-1"),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "VERSION_CONFLICT");
      return true;
    }
  );
});

test("enqueue does not disclose or run another workspace campaign", async () => {
  await assert.rejects(
    () => enqueueSiteAuditRun(auth, "campaign-other"),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "NOT_FOUND");
      return true;
    }
  );
});
