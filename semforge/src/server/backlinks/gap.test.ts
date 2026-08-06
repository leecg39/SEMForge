import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "backlink-gap-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
delete process.env.COMMON_CRAWL_BACKLINK_ENDPOINT;

const auth: AuthContext = {
  userId: "user-1", email: "test@example.com", name: "Tester",
  workspaceId: "workspace-1", workspaceName: "One", workspacePlan: "business", role: "owner",
  sessionId: "session-1", ip: null, userAgent: null,
};

let analyzeGap: typeof import("@/server/backlinks/gap")["analyzeBacklinkGap"];

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-1", "One", "one", "business");
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-2", "Two", "two", "business");

  const addDataset = (workspaceId: string, reportId: string, siteUrl: string, rows: Array<[string, string, string]>) => {
    const now = Date.now();
    sqlite.prepare(`INSERT INTO backlink_report_caches
      (id, workspace_id, target, effective_target, scope, provider, status, overview_payload, history_payload,
       score_profile_payload, request_ids_payload, fetched_at, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'site', 'bing-csv', 'ready', '{}', '[]', '{}', '[]', ?, ?, ?, ?)`)
      .run(reportId, workspaceId, siteUrl, siteUrl, now, now + 86_400_000, now, now);
    const statement = sqlite.prepare(`INSERT INTO backlink_imported_links
      (id, report_id, source_url, target_url, source_domain, anchor, link_count, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, 1, ?)`);
    rows.forEach(([sourceDomain, sourcePath, targetPath], index) => statement.run(
      `${reportId}-${index}`, reportId, `https://${sourceDomain}/${sourcePath}`, `${siteUrl}${targetPath}`, sourceDomain, now,
    ));
  };

  addDataset("workspace-1", "own", "https://brand.example/", [["shared.example", "brand", "home"]]);
  addDataset("workspace-1", "c1", "https://one.example/", [
    ["shared.example", "one", "page"], ["multi.example", "one", "page"], ["only-one.example", "one", "page"],
  ]);
  addDataset("workspace-1", "c2", "https://two.example/", [
    ["multi.example", "two", "page"], ["only-two.example", "two", "page"],
  ]);
  addDataset("workspace-2", "secret", "https://one.example/", [["secret.example", "private", "page"]]);
  sqlite.close();
  ({ analyzeBacklinkGap: analyzeGap } = await import("@/server/backlinks/gap"));
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("경쟁사에만 있는 추천 도메인을 실제 저장 링크에서 비교하고 워크스페이스를 격리한다", async () => {
  const result = await analyzeGap(auth, {
    ownSiteUrl: "brand.example",
    competitorSiteUrls: ["one.example", "two.example"],
    collect: false,
  });
  assert.equal(result.state, "ready");
  assert.equal(result.summary.ownReferringDomains, 1);
  assert.equal(result.summary.opportunities, 3);
  assert.equal(result.rows[0]?.sourceDomain, "multi.example");
  assert.equal(result.rows[0]?.competitorCount, 2);
  assert.equal(result.rows.some((row) => row.sourceDomain === "shared.example"), false);
  assert.equal(result.rows.some((row) => row.sourceDomain === "secret.example"), false);
});

test("필수 데이터셋이 없으면 실제 0건과 다른 needs_data 상태를 반환한다", async () => {
  const result = await analyzeGap(auth, {
    ownSiteUrl: "missing.example",
    competitorSiteUrls: ["one.example"],
    collect: false,
  });
  assert.equal(result.state, "needs_data");
  assert.equal(result.datasets[0]?.status, "missing");
  assert.match(result.warning ?? "", /missing\.example/);
});
