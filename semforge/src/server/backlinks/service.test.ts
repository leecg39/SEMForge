import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backlinks-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

let refreshBacklinkReport: (typeof import("@/server/backlinks/service"))["refreshBacklinkReport"];
let readCachedBacklinkReport: (typeof import("@/server/backlinks/service"))["readCachedBacklinkReport"];
let queryBacklinkList: (typeof import("@/server/backlinks/service"))["queryBacklinkList"];
let fetchCalls = 0;

const auth: AuthContext = {
  userId: "user-1",
  email: "test@example.com",
  name: "Tester",
  workspaceId: "workspace-1",
  workspaceName: "Test",
  workspacePlan: "business",
  role: "owner",
  sessionId: "session-1",
  ip: null,
  userAgent: null,
};

function responseFor(url: string): Response {
  fetchCalls += 1;
  const meta = { success: true, status_code: 200, request_id: `req-${fetchCalls}`, effective_url: "https://example.com", total: 1 };
  if (url.includes("/overview?")) return Response.json({ meta, data: { score: 60, backlinks_count: 100, domains_count: 20, urls_count: 30, new_count: 4, lost_count: 2 } });
  if (url.includes("/summary?")) return Response.json({ meta, data: [{ month_date: "2026-08-01", score: 60, backlinks_count: 100, domains_count: 20 }] });
  if (url.includes("/score-profile?")) return Response.json({ meta, data: [{ domain_score: 60, domains_count: 20 }] });
  return Response.json({ meta, data: [{ source_url: "https://source.example/a", target_url: "https://example.com", page_score: 40 }] });
}

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-1", "Test", "test", "business");
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-2", "Other", "other", "business");
  sqlite.close();
  ({ refreshBacklinkReport, readCachedBacklinkReport, queryBacklinkList } = await import("@/server/backlinks/service"));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

test("보고서와 목록을 24시간 캐시하고 워크스페이스를 격리한다", async () => {
  const { SemrushBacklinkProvider } = await import("@/server/backlinks/semrush");
  const provider = new SemrushBacklinkProvider({ apiKey: "test", fetchImpl: async (input) => responseFor(String(input)) });
  const first = await refreshBacklinkReport(auth, { target: "example.com", scope: "root_domain", mode: "if-stale" }, provider);
  assert.equal(fetchCalls, 3);
  assert.equal(first.overview.backlinks, 100);
  assert.equal(first.provenance.cached, false);

  const cached = await refreshBacklinkReport(auth, { target: "example.com", scope: "root_domain", mode: "if-stale" }, provider);
  assert.equal(fetchCalls, 3, "fresh 보고서는 공급자를 다시 호출하지 않는다");
  assert.equal(cached.provenance.cached, true);

  const request = {
    target: "example.com",
    scope: "root_domain" as const,
    dataset: "links" as const,
    page: 1,
    pageSize: 25,
    sort: "page_score",
    direction: "desc" as const,
    filters: { status: "all" as const, attribute: "all" as const, linkType: "all" as const, search: "", dateFrom: null, dateTo: null },
  };
  const list = await queryBacklinkList(auth, request, provider);
  assert.equal(fetchCalls, 4);
  assert.equal(list.provenance.cached, false);
  const listCached = await queryBacklinkList(auth, request, provider);
  assert.equal(fetchCalls, 4);
  assert.equal(listCached.provenance.cached, true);

  const other = { ...auth, workspaceId: "workspace-2" };
  await assert.rejects(() => readCachedBacklinkReport(other, "example.com", "root_domain"), /저장된 백링크 분석 결과/);

  await refreshBacklinkReport(auth, { target: "example.com", scope: "root_domain", mode: "force" }, provider);
  assert.equal(fetchCalls, 7);
  await queryBacklinkList(auth, request, provider);
  assert.equal(fetchCalls, 8, "강제 갱신은 상세 목록 캐시를 무효화한다");
});
