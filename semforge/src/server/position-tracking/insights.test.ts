import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * 순위 분포 / 경쟁자 발견 집계의 통합 테스트.
 *
 * 임시 SQLite 파일에 실제 마이그레이션을 적용하고, 수집된 SERP 스냅샷을
 * 직접 적재해 집계 결과를 검증한다. 외부 API 는 호출하지 않는다.
 * DATABASE_PATH 를 모듈 로드 전에 설정해야 하므로 앱 모듈은 동적 import 한다.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-insights-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type InsightsModule = typeof import("@/server/position-tracking/insights");
let getRankDistribution: InsightsModule["getRankDistribution"];
let getDiscoveredCompetitors: InsightsModule["getDiscoveredCompetitors"];

const auth = {
  userId: "u1",
  email: "editor@example.com",
  name: "에디터",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro" as const,
  role: "editor" as const,
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
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });

  const now = Date.now();
  const monthStart = Date.UTC(2026, 6, 1);
  const exec = (statement: string) => sqlite.exec(statement);
  exec("INSERT INTO workspaces (id, name, slug) VALUES ('w1','테스트 워크스페이스','test-ws')");
  exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain) VALUES ('c1','w1','테스트','example.com')"
  );
  exec(
    "INSERT INTO tracked_keywords (id, campaign_id, keyword) VALUES " +
      "('k1','c1','Alpha Keyword'),('k2','c1','beta keyword'),('k3','c1','gamma'),('k4','c1','never collected')"
  );
  exec(
    "INSERT INTO position_tracking_competitors (id, campaign_id, domain) VALUES ('p1','c1','rival.com')"
  );
  // 0013 부터 source 는 기본값 없이 명시 필수다 — 라이브 소스 값으로 삽입한다.
  const metric = sqlite.prepare(
    "INSERT INTO keyword_metrics (id, keyword, normalized_keyword, country_code, device, period_start, volume, intent, source) VALUES (?,?,?,?,?,?,?,?,'talordata-serp')"
  );
  metric.run("m1", "Alpha Keyword", "alpha keyword", "KR", "desktop", monthStart, 0, "informational");
  metric.run("m2", "beta keyword", "beta keyword", "KR", "desktop", monthStart, 0, "informational");
  metric.run("m3", "gamma", "gamma", "KR", "desktop", monthStart, 0, "informational");

  // k1: 자사 2위(top3) + rival 5위 + other-a 7위
  // k2: 자사 15위(top20) + other-a 3위 + other-b 9위
  // k3: 자사 없음(unranked) + rival 1위 + other-a 2위
  // k4: 스냅샷 없음(미수집)
  const rows: [string, string, string, number][] = [
    ["m1", "example.com", "https://example.com/a", 2],
    ["m1", "rival.com", "https://rival.com/a", 5],
    ["m1", "other-a.com", "https://other-a.com/a", 7],
    ["m2", "other-a.com", "https://other-a.com/b", 3],
    ["m2", "other-b.com", "https://other-b.com/b", 9],
    ["m2", "example.com", "https://example.com/b", 15],
    ["m3", "rival.com", "https://rival.com/c", 1],
    ["m3", "other-a.com", "https://other-a.com/c", 2],
  ];
  const insert = sqlite.prepare(
    "INSERT INTO serp_snapshots (id, keyword_metric_id, domain, url, position, captured_at, source) VALUES (?,?,?,?,?,?,'talordata')"
  );
  rows.forEach(([metricId, domain, url, position], index) =>
    insert.run(`s${index}`, metricId, domain, url, position, now)
  );
  sqlite.close();

  ({ getRankDistribution, getDiscoveredCompetitors } = await import(
    "@/server/position-tracking/insights"
  ));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("순위 분포는 최신 스냅샷의 자사 순위를 버킷으로 집계한다", async () => {
  const distribution = await getRankDistribution(auth, "c1");
  assert.equal(distribution.hasData, true);
  assert.equal(distribution.totalKeywords, 4);
  assert.equal(distribution.collectedKeywords, 3);
  assert.equal(distribution.uncollectedKeywords, 1);

  const countOf = (key: string) =>
    distribution.buckets.find((bucket) => bucket.key === key)?.count ?? -1;
  assert.equal(countOf("top3"), 1); // k1 (2위)
  assert.equal(countOf("top10"), 0);
  assert.equal(countOf("top20"), 1); // k2 (15위)
  assert.equal(countOf("top50"), 0);
  assert.equal(countOf("top100"), 0);
  assert.equal(countOf("unranked"), 1); // k3 (자사 순위 없음)

  const top3 = distribution.buckets.find((bucket) => bucket.key === "top3");
  assert.deepEqual(top3?.keywords, ["Alpha Keyword"]);
});

test("경쟁자 발견은 자사 외 도메인의 등장 키워드 수와 평균 순위를 관측값으로 집계한다", async () => {
  const discovered = await getDiscoveredCompetitors(auth, "c1");
  assert.equal(discovered.hasData, true);
  assert.equal(discovered.keywordsWithSerp, 3);

  const byDomain = new Map(discovered.competitors.map((row) => [row.domain, row]));
  // 자사 도메인은 결과에서 제외된다.
  assert.equal(byDomain.has("example.com"), false);

  // other-a.com: 3개 키워드 등장, 순위 7/3/2 → 평균 4.0
  const otherA = byDomain.get("other-a.com");
  assert.equal(otherA?.appearances, 3);
  assert.equal(otherA?.avgPosition, 4);
  assert.equal(otherA?.bestPosition, 2);
  assert.equal(otherA?.tracked, false);

  // rival.com: 2개 키워드 등장, 추적 중 표시
  const rival = byDomain.get("rival.com");
  assert.equal(rival?.appearances, 2);
  assert.equal(rival?.tracked, true);

  // 정렬: 등장 키워드 수 내림차순 (other-a 3 → rival/other-b 2/1)
  assert.equal(discovered.competitors[0]?.domain, "other-a.com");
});

test("다른 워크스페이스의 캠페인은 404 를 던진다", async () => {
  const outsider = { ...auth, workspaceId: "w-other" };
  await assert.rejects(() => getRankDistribution(outsider, "c1"), /찾을 수 없습니다/);
  await assert.rejects(() => getDiscoveredCompetitors(outsider, "c1"), /찾을 수 없습니다/);
});
