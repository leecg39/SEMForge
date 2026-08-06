import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "backlink-service-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.APP_SECRET = "test-only-service-secret-material";

const auth: AuthContext = { userId: "user-1", email: "test@example.com", name: "Tester",
  workspaceId: "workspace-1", workspaceName: "Test", workspacePlan: "business", role: "owner",
  sessionId: "session-1", ip: null, userAgent: null };

let refreshReport: typeof import("@/server/backlinks/service")["refreshBacklinkReport"];
let readReport: typeof import("@/server/backlinks/service")["readCachedBacklinkReport"];
let queryList: typeof import("@/server/backlinks/service")["queryBacklinkList"];

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-1", "Test", "test", "business");
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-2", "Other", "other", "business");
  sqlite.close();
  ({ refreshBacklinkReport: refreshReport, readCachedBacklinkReport: readReport, queryBacklinkList: queryList } = await import("@/server/backlinks/service"));
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("Bing 보고서는 24시간 캐시하고 워크스페이스를 격리한다", async () => {
  const { BingWebmasterProvider } = await import("@/server/backlinks/bing");
  const { AhrefsDomainRatingProvider } = await import("@/server/backlinks/ahrefs");
  let bingCalls = 0; let ahrefsCalls = 0;
  const bing = new BingWebmasterProvider("token", async (input) => {
    bingCalls += 1;
    return String(input).includes("GetUserSites")
      ? Response.json({ d: { Sites: [{ Url: "https://site.example/", IsVerified: true }] } })
      : Response.json({ d: { Links: [{ Url: "https://site.example/guide", Count: 8 }], TotalPages: 1 } });
  });
  const ahrefs = new AhrefsDomainRatingProvider({ apiKey: "key", fetchImpl: async () => {
    ahrefsCalls += 1; return Response.json({ domain_rating: { domain_rating: 63 } });
  }});
  const input = { siteUrl: "https://site.example/", scope: "site" as const, mode: "if-stale" as const,
    provider: "auto" as const, limit: 100 as const };
  const first = await refreshReport(auth, input, { bing, ahrefs });
  assert.equal(first.overview.totalInboundLinks, 8); assert.equal(first.overview.domainRating, 63);
  assert.equal(first.provenance.cached, false); assert.equal(bingCalls, 2); assert.equal(ahrefsCalls, 1);
  const cached = await refreshReport(auth, input, { bing, ahrefs });
  assert.equal(cached.provenance.cached, true); assert.equal(bingCalls, 2); assert.equal(ahrefsCalls, 1);
  await assert.rejects(() => readReport({ ...auth, workspaceId: "workspace-2" }, { siteUrl: input.siteUrl, scope: "site" }), /저장된 백링크 분석 결과/);
});

test("Bing이 비어 있으면 Common Crawl로 자동 보완하고 정규화 링크를 저장한다", async () => {
  const { BingWebmasterProvider } = await import("@/server/backlinks/bing");
  const { CommonCrawlBacklinkProvider } = await import("@/server/backlinks/common-crawl");
  const { AhrefsDomainRatingProvider } = await import("@/server/backlinks/ahrefs");
  const bing = new BingWebmasterProvider("token", async (input) => String(input).includes("GetUserSites")
    ? Response.json({ d: { Sites: [{ Url: "https://empty.example/", IsVerified: true }] } })
    : Response.json({ d: { Links: [], TotalPages: 0 } }));
  const commonCrawl = new CommonCrawlBacklinkProvider({
    endpoint: "https://common-crawl.test/backlinks",
    token: "gateway-secret",
    fetchImpl: async () => Response.json({
      release: "cc-main-2026-may-jun-jul",
      partial: true,
      requestId: "cc-request-1",
      rows: [{
        sourceUrl: "https://source.example/post",
        targetUrl: "https://empty.example/guide",
        anchor: "가이드",
        linkCount: 2,
      }],
    }),
  });
  const ahrefs = new AhrefsDomainRatingProvider({ apiKey: "key", fetchImpl: async () =>
    Response.json({ domain_rating: { domain_rating: 41 } }) });
  const report = await refreshReport(auth, {
    siteUrl: "https://empty.example/",
    scope: "site",
    mode: "force",
    provider: "auto",
    limit: 100,
  }, { bing, commonCrawl, ahrefs });
  assert.equal(report.provenance.provider, "common-crawl");
  assert.equal(report.provenance.fallbackFromBing, true);
  assert.equal(report.provenance.commonCrawlRelease, "cc-main-2026-may-jun-jul");
  assert.equal(report.overview.totalInboundLinks, 2);
  const list = await queryList(auth, {
    siteUrl: report.siteUrl,
    targetUrl: null,
    scope: "site",
    provider: "common-crawl",
    dataset: "inbound_links",
    targetPage: "https://empty.example/guide",
    page: 1,
    pageSize: 25,
    sort: "source_url",
    direction: "asc",
    filters: { search: "" },
  });
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0]?.kind, "inbound_links");
});
