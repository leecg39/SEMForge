import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

/** 실제 마이그레이션을 적용한 임시 SQLite 에서 페이지 인사이트 조회를 검증한다. */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-page-insights-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type QueryModule = typeof import("@/server/position-tracking/page-insights-query");
let loadPageRankings: QueryModule["loadPageRankings"];
let loadCannibalization: QueryModule["loadCannibalization"];
let loadFeaturedSnippets: QueryModule["loadFeaturedSnippets"];

const auth: AuthContext = {
  userId: "u1",
  email: "editor@example.com",
  name: "편집자",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro",
  role: "editor",
  sessionId: "s1",
  ip: null,
  userAgent: null,
};

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });

  sqlite.exec("INSERT INTO workspaces (id, name, slug) VALUES ('w1','워크스페이스','ws-one')");
  sqlite.exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain) VALUES " +
      "('c-data','w1','데이터 캠페인','example.com')," +
      "('c-empty','w1','빈 캠페인','empty.example.com')," +
      "('c-reused','w1','재사용 메트릭 캠페인','reused.example.com')",
  );
  sqlite.exec(
    "INSERT INTO tracked_keywords (id, campaign_id, keyword) VALUES " +
      "('k1','c-data','Alpha Keyword')," +
      "('k-reused','c-reused','Reused Keyword')",
  );

  const periodStart = Date.UTC(2026, 6, 1);
  sqlite
    .prepare(
      "INSERT INTO keyword_metrics " +
        "(id, keyword, normalized_keyword, country_code, device, period_start, volume, intent, source) " +
        "VALUES ('m1','Alpha Keyword','alpha keyword','KR','desktop',?,0,'informational','talordata-serp')",
    )
    .run(periodStart);
  sqlite
    .prepare(
      "INSERT INTO keyword_metrics " +
        "(id, keyword, normalized_keyword, country_code, device, period_start, volume, intent, source) " +
        "VALUES ('m-demo','Alpha Keyword','alpha keyword','KR','desktop',?,0,'informational','demo-keyword-model')",
    )
    .run(Date.UTC(2026, 7, 1));
  sqlite
    .prepare(
      "INSERT INTO keyword_metrics " +
        "(id, keyword, normalized_keyword, country_code, device, period_start, volume, intent, source) " +
        "VALUES ('m-reused','Reused Keyword','reused keyword','KR','desktop',?,0,'informational','demo-keyword-model')",
    )
    .run(periodStart);

  const oldCapturedAt = Date.UTC(2026, 6, 14, 3);
  const capturedAt = Date.UTC(2026, 6, 15, 3);
  const demoCapturedAt = Date.UTC(2026, 6, 16, 3);
  const insertSnapshot = sqlite.prepare(
    "INSERT INTO serp_snapshots " +
      "(id, keyword_metric_id, search_engine, domain, url, position, is_ad, title, description, serp_features, source, captured_at) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  insertSnapshot.run(
    "s-old",
    "m1",
    "google",
    "example.com",
    "https://example.com/old",
    1,
    0,
    "과거 제목",
    "과거 설명",
    '["featured_snippet"]',
    "talordata",
    oldCapturedAt,
  );
  insertSnapshot.run(
    "s-organic-a",
    "m1",
    "google",
    "example.com",
    "https://example.com/a",
    3,
    0,
    "A 제목",
    "A 설명",
    '["featured_snippet"]',
    "talordata",
    capturedAt,
  );
  insertSnapshot.run(
    "s-demo-same-metric",
    "m1",
    "google",
    "example.com",
    "https://example.com/demo-same-metric",
    2,
    0,
    "모의 제목",
    "모의 설명",
    '["featured_snippet"]',
    "demo-serp-collector",
    demoCapturedAt,
  );
  insertSnapshot.run(
    "s-demo-newer-metric",
    "m-demo",
    "google",
    "example.com",
    "https://example.com/demo-newer-metric",
    1,
    0,
    "모의 제목",
    "모의 설명",
    '["featured_snippet"]',
    "demo-serp-collector",
    demoCapturedAt,
  );
  insertSnapshot.run(
    "s-reused-live",
    "m-reused",
    "google",
    "reused.example.com",
    "https://reused.example.com/live",
    5,
    0,
    "실측 제목",
    "실측 설명",
    "[]",
    "talordata",
    capturedAt,
  );
  insertSnapshot.run(
    "s-organic-b",
    "m1",
    "google",
    "blog.example.com",
    "https://blog.example.com/b",
    7,
    0,
    "B 제목",
    "B 설명",
    '["featured_snippet"]',
    "talordata",
    capturedAt,
  );
  insertSnapshot.run(
    "s-ad",
    "m1",
    "google",
    "example.com",
    "https://example.com/ad",
    1,
    1,
    "광고 제목",
    "광고 설명",
    '["featured_snippet"]',
    "talordata",
    capturedAt,
  );
  sqlite.close();

  ({ loadPageRankings, loadCannibalization, loadFeaturedSnippets } = await import(
    "@/server/position-tracking/page-insights-query"
  ));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("다른 워크스페이스의 캠페인은 NOT_FOUND 로 거부한다", async () => {
  const outsider = { ...auth, workspaceId: "w-other" };
  for (const load of [loadPageRankings, loadCannibalization, loadFeaturedSnippets]) {
    await assert.rejects(
      () => load(outsider, "c-data"),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "NOT_FOUND",
    );
  }
});

test("잘못된 캠페인 식별자는 DB 조회 전에 VALIDATION_ERROR 로 거부한다", async () => {
  for (const campaignId of ["", " c-data", "c-data ", "x".repeat(201)]) {
    await assert.rejects(
      () => loadPageRankings(auth, campaignId),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "VALIDATION_ERROR" &&
        "fields" in error &&
        typeof error.fields === "object" &&
        error.fields !== null &&
        "campaignId" in error.fields,
    );
  }
});

test("스냅샷이 없으면 오류가 아닌 live 빈 결과를 반환한다", async () => {
  const pages = await loadPageRankings(auth, "c-empty");
  const cannibalization = await loadCannibalization(auth, "c-empty");
  const snippets = await loadFeaturedSnippets(auth, "c-empty");

  assert.equal(pages.status, "live");
  assert.deepEqual(pages.data, []);
  assert.equal(cannibalization.status, "live");
  assert.deepEqual(cannibalization.data, []);
  assert.equal(snippets.status, "live");
  assert.deepEqual(snippets.data, { owned: [], competitors: [] });
});

test("is_ad=1 행은 페이지 순위와 추천 스니펫에서 제외한다", async () => {
  const pages = await loadPageRankings(auth, "c-data");
  const snippets = await loadFeaturedSnippets(auth, "c-data");

  assert.equal(pages.status, "live");
  assert.equal(pages.source, "talordata");
  assert.equal(pages.fetchedAt, "2026-07-15T03:00:00.000Z");
  assert.deepEqual(
    pages.data?.map((page) => page.url),
    ["https://example.com/a", "https://blog.example.com/b"],
  );
  assert.deepEqual(snippets.data?.owned.map((snippet) => snippet.url), [
    "https://example.com/a",
  ]);
});

test("과거 스냅샷과 모의 소스는 최신 TalorData 관측에 섞이지 않는다", async () => {
  const pages = await loadPageRankings(auth, "c-data");
  const snippets = await loadFeaturedSnippets(auth, "c-data");

  const pageUrls = pages.data?.map((page) => page.url) ?? [];
  assert.equal(pageUrls.some((url) => url.includes("/old")), false);
  assert.equal(pageUrls.some((url) => url.includes("/demo-")), false);
  assert.deepEqual(snippets.data?.owned.map((snippet) => snippet.url), [
    "https://example.com/a",
  ]);
});

test("과거 시드 메트릭을 재사용했어도 스냅샷이 TalorData 실측이면 조회한다", async () => {
  const pages = await loadPageRankings(auth, "c-reused");

  assert.equal(pages.status, "live");
  assert.deepEqual(pages.data, [
    {
      url: "https://reused.example.com/live",
      keywords: 1,
      bestPosition: 5,
      averagePosition: 5,
      lastSeenAt: "2026-07-15T03:00:00.000Z",
    },
  ]);
});

test("같은 스냅샷에서 자사 자연 검색 URL 두 개를 카니발리제이션 1건으로 탐지한다", async () => {
  const result = await loadCannibalization(auth, "c-data");

  assert.equal(result.status, "live");
  assert.equal(result.data?.length, 1);
  assert.equal(result.data?.[0]?.keyword, "m1");
  assert.equal(result.data?.[0]?.competingCount, 2);
  assert.deepEqual(result.data?.[0]?.urls, [
    { url: "https://example.com/a", position: 3 },
    { url: "https://blog.example.com/b", position: 7 },
  ]);
});

test("예상하지 못한 저장소 오류는 내부 상세를 노출하지 않는 error 결과가 된다", async () => {
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.exec("ALTER TABLE serp_snapshots RENAME TO unavailable_serp_snapshots");
  sqlite.close();

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await loadPageRankings(auth, "c-data");
    assert.equal(result.status, "error");
    assert.match(result.reason ?? "", /페이지 순위를 집계하지 못했습니다/);
    assert.doesNotMatch(result.reason ?? "", /serp_snapshots|no such table/i);
  } finally {
    console.error = originalConsoleError;
  }
});
