import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "backlink-audit-service-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

const auth: AuthContext = {
  userId: "user-1", email: "owner@example.com", name: "Owner", workspaceId: "workspace-1",
  workspaceName: "Workspace", workspacePlan: "business", role: "owner", sessionId: "test", ip: null, userAgent: null,
};

let service: typeof import("@/server/backlink-audit/service");
let disavow: typeof import("@/server/backlink-audit/disavow");

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("foreign_keys = OFF");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  const now = Date.parse("2026-08-04T00:00:00Z");
  sqlite.prepare("INSERT INTO workspaces (id,name,slug,plan,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("workspace-1", "Workspace", "workspace", "business", now, now);
  sqlite.prepare("INSERT INTO workspaces (id,name,slug,plan,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
    .run("workspace-2", "Other", "other", "business", now, now);
  sqlite.prepare("INSERT INTO users (id,email,name,password_hash,password_salt,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,1)")
    .run("user-1", "owner@example.com", "Owner", "hash", "salt", now, now);
  sqlite.prepare("INSERT INTO backlink_report_caches (id,workspace_id,target,effective_target,scope,provider,status,overview_payload,history_payload,score_profile_payload,request_ids_payload,fetched_at,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("report-1", "workspace-1", "https://site.example/", "https://site.example/", "site", "bing-csv", "ready", JSON.stringify({ totalInboundLinks: 2, linkedPages: 1 }), "[]", JSON.stringify({ topTargetPages: [{ kind: "target_pages", url: "https://site.example/page", linkCount: 2 }], partial: false }), "[]", now, now + 86_400_000, now, now);
  sqlite.close();
  service = await import("@/server/backlink-audit/service");
  disavow = await import("@/server/backlink-audit/disavow");
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("프로젝트 실행은 실제 링크 근거를 저장하고 워크스페이스를 격리한다", async () => {
  const project = await service.createBacklinkAuditProject(auth, { reportId: "report-1", maxLinks: 100 });
  const run = await service.enqueueBacklinkAuditRun(auth, project.id, 100);
  const target = "https://site.example/page";
  const result = await service.executeBacklinkAuditRun(auth, run.id, {
    inventory: async () => ({
      rows: [
        { kind: "inbound_links", sourceUrl: "https://source.example/live", targetUrl: target, sourceDomain: "source.example", anchor: "Guide", linkCount: 1 },
        { kind: "inbound_links", sourceUrl: "https://source.example/gone", targetUrl: target, sourceDomain: "source.example", anchor: "Old", linkCount: 1 },
      ],
      partial: false,
      warning: null,
    }),
    scraper: async (url) => url === target
      ? { finalUrl: url, status: 200, html: "<main>Target</main>" }
      : url.endsWith("/live")
        ? { finalUrl: url, status: 200, html: `<a href="${target}" rel="nofollow ugc">Guide</a>` }
        : { finalUrl: url, status: 200, html: "<p>Removed</p>" },
  });
  assert.equal(result.status, "completed");
  const overview = await service.getBacklinkAuditOverview(auth, project.id);
  assert.equal(overview.totals.links, 2);
  assert.equal(overview.totals.active, 1);
  assert.equal(overview.totals.missing, 1);
  assert.equal(overview.totals.nofollow, 1);
  const links = await service.listBacklinkAuditLinks(auth, project.id, {
    page: 1, pageSize: 25, search: "", sort: "risk", direction: "desc",
  });
  const live = links.rows.find((row) => row.auditStatus === "active");
  assert.ok(live);
  await service.updateBacklinkAuditReviews(auth, project.id, { linkIds: [live.id], decision: "disavow", note: "manual review" });
  assert.equal((await disavow.listDisavowEntries(auth, project.id)).length, 1);
  const preview = await disavow.buildDisavowPreview(auth, project.id);
  assert.match(preview.content, /https:\/\/source\.example\/live/u);
  await assert.rejects(
    () => service.getBacklinkAuditOverview({ ...auth, workspaceId: "workspace-2" }, project.id),
    (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
  );
});
