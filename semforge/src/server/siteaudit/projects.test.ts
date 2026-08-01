import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "siteaudit-projects-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

let listSiteAuditProjects: (
  auth: AuthContext,
  options?: { q?: string; page?: number; pageSize?: number; sort?: string }
) => Promise<import("@/server/siteaudit/projects").SiteAuditProjectListResult>;

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
  sqlite.prepare("INSERT INTO folders (id,workspace_id,name,domain,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("folder-1", "ws-1", "Example", "example.com", now, now);
  sqlite.prepare("INSERT INTO folders (id,workspace_id,name,domain,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("folder-2", "ws-1", "Unconfigured", "unconfigured.com", now + 1, now + 1);
  sqlite.prepare("INSERT INTO folders (id,workspace_id,name,domain,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("folder-other", "ws-2", "Other", "other.com", now, now);
  sqlite.prepare("INSERT INTO site_audit_campaigns (id,workspace_id,folder_id,name,domain,status,site_health,last_run_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,1)")
    .run("campaign-1", "ws-1", "folder-1", "Example", "example.com", "completed", 90, now + 30, now, now + 30);
  sqlite.prepare("INSERT INTO site_audit_runs (id,workspace_id,campaign_id,status,page_limit,crawled_pages,failed_fetches,finished_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("run-current", "ws-1", "campaign-1", "completed", 100, 12, 0, now + 30, now + 20, now + 30);
  sqlite.prepare("INSERT INTO site_audit_runs (id,workspace_id,campaign_id,status,page_limit,crawled_pages,failed_fetches,finished_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("run-previous", "ws-1", "campaign-1", "completed", 100, 10, 1, now + 10, now, now + 10);
  const themes = JSON.stringify([{ key: "crawlability", score: 100, measurable: true }]);
  sqlite.prepare("INSERT INTO site_audit_metric_snapshots (run_id,site_health,crawled_pages,error_count,warning_count,notice_count,theme_scores,provenance,captured_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("run-current", 90, 12, 1, 2, 0, themes, JSON.stringify({ crawl: "self" }), now + 30);
  sqlite.prepare("INSERT INTO site_audit_metric_snapshots (run_id,site_health,crawled_pages,error_count,warning_count,notice_count,theme_scores,provenance,captured_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("run-previous", 80, 10, 3, 4, 0, themes, JSON.stringify({ crawl: "self" }), now + 10);
  sqlite.close();
  ({ listSiteAuditProjects } = await import("@/server/siteaudit/projects"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("project hub combines configured and unconfigured folders with real deltas", async () => {
  const result = await listSiteAuditProjects(auth, { sort: "name:asc" });
  assert.equal(result.meta.total, 2);
  const configured = result.rows.find((row) => row.projectId === "folder-1")!;
  assert.equal(configured.state, "completed");
  assert.equal(configured.metrics?.siteHealth, 90);
  assert.equal(configured.deltas?.siteHealth, 10);
  assert.equal(configured.deltas?.errors, -2);
  assert.equal(configured.provenance.crawl, "self");
  const unconfigured = result.rows.find((row) => row.projectId === "folder-2")!;
  assert.equal(unconfigured.state, "unconfigured");
  assert.equal(unconfigured.campaignId, null);
  assert.equal(unconfigured.metrics, null);
});

test("project hub search and workspace isolation are server-side", async () => {
  const result = await listSiteAuditProjects(auth, { q: "unconfigured" });
  assert.equal(result.meta.total, 1);
  assert.equal(result.rows[0]?.domain, "unconfigured.com");
  assert.equal(result.rows.some((row) => row.domain === "other.com"), false);
});
