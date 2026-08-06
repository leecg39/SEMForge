import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { NaverKeywordStat } from "@/server/naver-keywords/contracts";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "naver-keyword-store-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let Store: typeof import("@/server/naver-keywords/store")["NaverKeywordDbStore"];
let reserveProviderBudget: typeof import("@/server/naver-keywords/store")["reserveProviderBudget"];

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.close();
  ({ NaverKeywordDbStore: Store, reserveProviderBudget } = await import("@/server/naver-keywords/store"));
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

const capturedAt = new Date("2026-08-04T00:00:00.000Z");
const expiresAt = new Date("2026-08-11T00:00:00.000Z");
const stat: NaverKeywordStat = {
  snapshotId: null,
  keyword: "네이버 광고",
  normalizedKeyword: "네이버 광고",
  monthlyPcQueries: { relation: "lt", min: 0, maxExclusive: 10, display: "<10" },
  monthlyMobileQueries: { relation: "exact", min: 100, maxExclusive: 101, value: 100, display: "100" },
  monthlyTotalQueries: { relation: "range", min: 100, maxExclusive: 110, display: "100–109" },
  monthlyAveragePcClicks: 1.2,
  monthlyAverageMobileClicks: 3.4,
  monthlyAveragePcCtr: 0.8,
  monthlyAverageMobileCtr: 1.7,
  averageAdDepth: 6,
  competition: "medium",
  competitionLabel: "중간",
};

test("Search Ads 스냅샷은 <10 범위를 보존하고 fresh/stale을 판정한다", async () => {
  const store = new Store();
  const persisted = await store.saveSearchAds({
    requestKey: "네이버 광고",
    section: {
      data: [stat],
      source: "naver-search-ads-relkwdstat",
      fetchedAt: capturedAt,
      expiresAt,
      cache: "fresh",
    },
  });
  assert.ok(persisted[0]?.snapshotId);

  const fresh = await store.readSearchAds("네이버 광고", new Date("2026-08-05T00:00:00Z"));
  assert.equal(fresh?.cache, "fresh");
  assert.equal(fresh?.data[0]?.monthlyPcQueries?.display, "<10");
  assert.equal(fresh?.data[0]?.monthlyTotalQueries?.display, "100–109");
  assert.ok(fresh?.data[0]?.snapshotId);

  const stale = await store.readSearchAds("네이버 광고", new Date("2026-08-12T00:00:00Z"));
  assert.equal(stale?.cache, "stale");
  const expired = await store.readSearchAds("네이버 광고", new Date("2026-09-04T00:00:01Z"));
  assert.equal(expired, null);
});

test("Insight JSON 캐시는 kind별로 분리하고 30일까지만 stale을 허용한다", async () => {
  const store = new Store();
  await store.saveInsight({
    keyword: "네이버 광고",
    kind: "search_trend",
    section: {
      data: { title: "네이버 광고", keywords: ["네이버 광고"], points: [] },
      source: "naver-api-hub-search-trend",
      fetchedAt: capturedAt,
      expiresAt,
      cache: "fresh",
    },
  });
  const result = await store.readInsight<{ points: unknown[] }>({
    keyword: "네이버 광고",
    kind: "search_trend",
    now: new Date("2026-08-12T00:00:00Z"),
  });
  assert.equal(result?.cache, "stale");
  assert.deepEqual(result?.data.points, []);
});

test("공급자 일일 예산은 DB에 영속적으로 증가하며 상한을 넘기지 않는다", async () => {
  assert.equal(await reserveProviderBudget("naver-api-hub", capturedAt, 2), true);
  assert.equal(await reserveProviderBudget("naver-api-hub", capturedAt, 2), true);
  assert.equal(await reserveProviderBudget("naver-api-hub", capturedAt, 2), false);
});
