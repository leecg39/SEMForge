import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * persistCrawlLinkEdges 통합 테스트.
 * 임시 SQLite 에 실제 마이그레이션을 적용하고, 크롤 페이지의 외부 링크가
 * link_graph_edges 로 적재·업서트(재크롤 시 lastSeenAt 갱신)되는지 검증한다.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "linkgraph-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

let persistCrawlLinkEdges: (typeof import("@/server/siteaudit/linkgraph"))["persistCrawlLinkEdges"];
let queryEdges: () => Array<{
  source_domain: string;
  target_domain: string;
  source_network: string;
  is_follow: number;
  source_authority: number;
  source: string;
  first_seen_at: number;
  last_seen_at: number;
}>;

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.close();

  ({ persistCrawlLinkEdges } = await import("@/server/siteaudit/linkgraph"));

  queryEdges = () => {
    const readDb = new Database(process.env.DATABASE_PATH!, { readonly: true });
    const rows = readDb
      .prepare(
        "SELECT source_domain, target_domain, source_network, is_follow, source_authority, source, first_seen_at, last_seen_at FROM link_graph_edges ORDER BY target_url"
      )
      .all() as ReturnType<typeof queryEdges>;
    readDb.close();
    return rows;
  };
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function crawledPage(overrides: Partial<import("@/server/siteaudit/crawl").CrawledPage>) {
  return {
    url: "https://www.example-shop.co.kr/about",
    status: 200,
    isHtml: true,
    title: "About",
    metaDescription: null,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    hasJsonLd: false,
    bytes: 0,
    responseMs: 0,
    depth: 0,
    internalLinks: [],
    externalLinks: [],
    ...overrides,
  };
}

const FIRST_RUN = new Date("2026-07-29T00:00:00Z");
const SECOND_RUN = new Date("2026-07-29T06:00:00Z");

test("HTML 페이지의 외부 링크를 정규화해 엣지로 적재한다", async () => {
  const stats = await persistCrawlLinkEdges({
    pages: [
      crawledPage({
        externalLinks: [
          { url: "https://www.partner-a.com/review", isFollow: true },
          { url: "https://blog.partner-b.io/post", isFollow: false },
        ],
      }),
      // 수집 실패/비 HTML 페이지는 무시된다.
      crawledPage({ url: "https://www.example-shop.co.kr/broken", status: 0, isHtml: false }),
    ],
    sourceAuthority: 73,
    capturedAt: FIRST_RUN,
  });

  assert.deepEqual(stats, { edges: 2, targetDomains: 2 });
  const rows = queryEdges();
  assert.equal(rows.length, 2);
  const follow = rows.find((row) => row.target_domain === "partner-a.com")!;
  assert.equal(follow.source_domain, "example-shop.co.kr");
  assert.equal(follow.source_network, "crawl:example-shop.co.kr");
  assert.equal(follow.is_follow, 1);
  assert.equal(follow.source_authority, 73);
  assert.equal(follow.source, "site-audit-crawler");
  const nofollow = rows.find((row) => row.target_domain === "blog.partner-b.io")!;
  assert.equal(nofollow.is_follow, 0);
});

test("재크롤 upsert 는 중복 없이 lastSeenAt 만 갱신하고 firstSeenAt 을 보존한다", async () => {
  const stats = await persistCrawlLinkEdges({
    pages: [
      crawledPage({
        externalLinks: [
          // 같은 엣지 재관측 (이번에는 nofollow 로 관측됨)
          { url: "https://www.partner-a.com/review", isFollow: false },
          // 새 엣지 하나 추가
          { url: "https://news.partner-c.net/article", isFollow: true },
        ],
      }),
    ],
    sourceAuthority: 40,
    capturedAt: SECOND_RUN,
  });

  assert.deepEqual(stats, { edges: 2, targetDomains: 2 });
  const rows = queryEdges();
  assert.equal(rows.length, 3, "재관측 엣지는 중복 삽입되지 않는다");

  const reobserved = rows.find((row) => row.target_domain === "partner-a.com")!;
  assert.equal(reobserved.first_seen_at, FIRST_RUN.getTime(), "최초 발견 시각 보존");
  assert.equal(reobserved.last_seen_at, SECOND_RUN.getTime(), "최근 관측 시각 갱신");
  assert.equal(reobserved.is_follow, 0, "최신 관측의 follow 상태 반영");
  assert.equal(reobserved.source_authority, 40, "최신 관측의 소스 품질 반영");
});
