import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * 현황(landscape) 집계 통합 테스트 — overview / rank-history / highlights / pages.
 *
 * 임시 SQLite 에 실제 마이그레이션을 적용하고 수집 결과를 직접 적재해 검증한다.
 * 외부 API 는 호출하지 않는다. DATABASE_PATH 는 모듈 로드 전에 설정해야 하므로
 * 앱 모듈은 동적 import 한다.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-overview-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type OverviewModule = typeof import("@/server/position-tracking/overview");
type HighlightsModule = typeof import("@/server/position-tracking/highlights");
let getCampaignListSummary: OverviewModule["getCampaignListSummary"];
let getCampaignOverview: OverviewModule["getCampaignOverview"];
let getRankDistributionHistory: OverviewModule["getRankDistributionHistory"];
let getKeywordHighlights: HighlightsModule["getKeywordHighlights"];
let getPagesBreakdown: HighlightsModule["getPagesBreakdown"];

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

const NOW = Date.now();
const EARLIER = NOW - 2 * 24 * 60 * 60 * 1000;

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });

  const monthStart = Date.UTC(2026, 6, 1);
  sqlite.exec("INSERT INTO workspaces (id, name, slug) VALUES ('w1','테스트','test-ws')");
  sqlite.exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain, visibility) VALUES ('c1','w1','테스트','example.com',55)"
  );
  sqlite.exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain, visibility) VALUES ('c2','w1','검색량 없음','novolume.example',0)"
  );

  // k1 상승(5→2), k2 하락(4→12), k3 이탈(8→없음), k4 신규(→1, volume 없음)
  const keyword = sqlite.prepare(
    "INSERT INTO tracked_keywords (id, campaign_id, keyword, position, previous_position, volume) VALUES (?,?,?,?,?,?)"
  );
  keyword.run("k1", "c1", "alpha", 2, 5, 1000);
  keyword.run("k2", "c1", "beta", 12, 4, 500);
  keyword.run("k3", "c1", "gamma", null, 8, null);
  keyword.run("k4", "c1", "delta", 1, null, null);
  keyword.run("k5", "c2", "epsilon", null, null, null);

  const history = sqlite.prepare(
    "INSERT INTO position_tracking_visibility_history (id, campaign_id, visibility, ranked_count, keyword_count, captured_at) VALUES (?,?,?,?,?,?)"
  );
  history.run("h1", "c1", 40, 2, 4, EARLIER);
  history.run("h2", "c1", 55, 3, 4, NOW);
  history.run("h3", "c2", 0, 0, 1, NOW);

  sqlite.exec(`
    INSERT INTO position_tracking_runs
      (id, workspace_id, campaign_id, trigger, status, total_count, processed_count, success_count, failed_count, completed_at)
    VALUES ('r1', 'w1', 'c1', 'manual', 'partial', 4, 4, 3, 1, ${NOW});
    INSERT INTO position_tracking_run_items
      (id, run_id, tracked_keyword_id, status, attempt_count, error_message, completed_at)
    VALUES
      ('ri1', 'r1', 'k1', 'succeeded', 1, NULL, ${NOW}),
      ('ri2', 'r1', 'k2', 'succeeded', 1, NULL, ${NOW}),
      ('ri3', 'r1', 'k3', 'failed', 2, '공급자 시간 초과', ${NOW}),
      ('ri4', 'r1', 'k4', 'succeeded', 1, NULL, ${NOW});
    INSERT INTO position_tracking_observations
      (id, campaign_id, run_id, tracked_keyword_id, measurement_kind, position, url, mentioned, local_pack_position, features, citations, source, captured_at)
    VALUES
      ('o1', 'c1', 'r1', 'k1', 'organic_rank', 2, 'https://example.com/a', 0, NULL, '["ai_overview"]', '[]', 'talordata', ${NOW - 2000}),
      ('o2', 'c1', 'r1', 'k2', 'organic_rank', 12, 'https://example.com/b', 0, NULL, '[]', '[]', 'talordata', ${NOW - 1000}),
      ('o4', 'c1', 'r1', 'k4', 'organic_rank', 1, 'https://example.com/d', 0, 2, '["local_pack"]', '[]', 'talordata', ${NOW});
  `);

  const metric = sqlite.prepare(
    "INSERT INTO keyword_metrics (id, keyword, normalized_keyword, country_code, device, period_start, volume, intent, source) VALUES (?,?,?,?,?,?,?,?,'talordata-serp')"
  );
  metric.run("m1", "alpha", "alpha", "KR", "desktop", monthStart, 1000, "informational");
  metric.run("m2", "beta", "beta", "KR", "desktop", monthStart, 500, "informational");
  metric.run("m4", "delta", "delta", "KR", "desktop", monthStart, 0, "informational");

  // 시점 2개: EARLIER(직전) / NOW(최신). beta 는 최신에서 랜딩 URL 이 바뀐다.
  const snapshot = sqlite.prepare(
    "INSERT INTO serp_snapshots (id, keyword_metric_id, domain, url, position, captured_at, source) VALUES (?,?,?,?,?,?,'talordata')"
  );
  snapshot.run("s1", "m1", "example.com", "https://example.com/a", 5, EARLIER);
  snapshot.run("s2", "m2", "example.com", "https://example.com/b-old", 4, EARLIER);
  snapshot.run("s3", "m1", "example.com", "https://example.com/a", 2, NOW);
  snapshot.run("s4", "m2", "example.com", "https://example.com/b", 12, NOW);
  snapshot.run("s5", "m4", "example.com", "https://example.com/d", 1, NOW);
  snapshot.run("s6", "m1", "rival.com", "https://rival.com/a", 1, NOW);
  sqlite.close();

  ({ getCampaignListSummary, getCampaignOverview, getRankDistributionHistory } =
    await import("@/server/position-tracking/overview"));
  ({ getKeywordHighlights, getPagesBreakdown } = await import(
    "@/server/position-tracking/highlights"
  ));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("목록 요약은 가시성 차이와 개선/하락 키워드 수를 실측으로 집계한다", async () => {
  const items = await getCampaignListSummary(auth);
  assert.equal(items.length, 2);
  const item = items.find((row) => row.id === "c1");
  assert.ok(item);
  assert.equal(item.visibility, 55);
  assert.equal(item.visibilityDiff, 15);
  // 개선 = k1(5→2) + k4(신규 진입), 하락 = k2(4→12) + k3(이탈)
  assert.equal(item.improved, 2);
  assert.equal(item.declined, 2);
  assert.equal(item.keywordCount, 4);
  assert.equal(item.configured, true);
  assert.equal(item.lastCollectedAt, new Date(NOW).toISOString());
});

test("KPI 집계는 평균 포지션·버킷 진입/이탈·상승vs하락을 계산한다", async () => {
  const overview = await getCampaignOverview(auth, "c1");
  assert.equal(overview.visibility.current, 55);
  assert.equal(overview.visibility.diff, 15);
  assert.equal(overview.visibility.series.length, 2);

  // ranked = [2,12,1] → 5.0 / previous = [5,4,8] → 5.67
  assert.equal(overview.avgPosition.current, 5);
  assert.equal(overview.avgPosition.rankedCount, 3);
  assert.equal(overview.avgPosition.diff, -0.67);

  // volume 보유: k1(2위, 0.15×1000=150), k2(12위, 0.015×500=7.5)
  assert.equal(overview.estimatedTraffic.current, 157.5);
  assert.equal(overview.estimatedTraffic.coveredKeywords, 2);
  // 직전: k1(5위, 0.055×1000=55), k2(4위, 0.07×500=35) → +67.5
  assert.equal(overview.estimatedTraffic.diff, 67.5);

  const top3 = overview.topBuckets.find((bucket) => bucket.key === "top3");
  assert.equal(top3?.count, 2); // k1(2위), k4(1위)
  assert.equal(top3?.entered, 2);
  assert.equal(top3?.left, 0);

  assert.equal(overview.rising, 1);
  assert.equal(overview.falling, 1);
  assert.equal(overview.newRanked, 1);
  assert.equal(overview.dropped, 1);

  assert.equal(overview.latestCollection?.runId, "r1");
  assert.equal(overview.latestCollection?.status, "partial");
  assert.equal(overview.latestCollection?.results.length, 4);
  const alpha = overview.latestCollection?.results.find((row) => row.keywordId === "k1");
  assert.equal(alpha?.position, 2);
  assert.equal(alpha?.source, "talordata");
  assert.deepEqual(alpha?.features, ["ai_overview"]);
  const gamma = overview.latestCollection?.results.find((row) => row.keywordId === "k3");
  assert.equal(gamma?.status, "failed");
  assert.equal(gamma?.error, "공급자 시간 초과");
});

test("검색량 원자료가 없으면 예상 트래픽을 실제 0으로 오인시키지 않는다", async () => {
  const overview = await getCampaignOverview(auth, "c2");
  assert.equal(overview.estimatedTraffic.current, null);
  assert.equal(overview.estimatedTraffic.diff, null);
  assert.equal(overview.estimatedTraffic.coveredKeywords, 0);
});

test("일별 분포는 날짜별 최신 스냅샷의 자사 버킷을 집계한다", async () => {
  const result = await getRankDistributionHistory(auth, "c1", 14);
  assert.equal(result.hasData, true);
  assert.equal(result.history.length, 2);

  const [earlier, latest] = result.history;
  // 직전일: alpha 5위(top10) + beta 4위(top10)
  assert.equal(earlier.counts.top10, 2);
  assert.equal(earlier.total, 2);
  // 최신일: alpha 2위·delta 1위(top3) + beta 12위(top20)
  assert.equal(latest.counts.top3, 2);
  assert.equal(latest.counts.top20, 1);
  assert.equal(latest.total, 3);
});

test("하이라이트는 CTR 곡선 기반 가시성 변화로 효율/비효율을 정렬한다", async () => {
  const highlights = await getKeywordHighlights(auth, "c1");
  assert.equal(highlights.hasData, true);
  assert.equal(highlights.model, "clone-traffic-v1");

  // 상위: 포지션 오름차순 delta(1) → alpha(2) → beta(12)
  assert.deepEqual(
    highlights.top.map((row) => row.keyword),
    ["delta", "alpha", "beta"]
  );
  // 가시성 기여 합계는 100% 에 수렴한다.
  const shareSum = highlights.top.reduce((sum, row) => sum + (row.visibilityShare ?? 0), 0);
  assert.ok(Math.abs(shareSum - 100) < 0.05, `share sum=${shareSum}`);

  // 획득: delta(0→0.32=+32) > alpha(0.055→0.15=+9.5)
  assert.deepEqual(
    highlights.gainers.map((row) => row.keyword),
    ["delta", "alpha"]
  );
  assert.equal(highlights.gainers[0]?.visibilityDelta, 32);
  // 손실: beta(0.07→0.015=-5.5) < gamma(0.032→0=-3.2)
  assert.deepEqual(
    highlights.losers.map((row) => row.keyword),
    ["beta", "gamma"]
  );
  assert.equal(highlights.losers[0]?.visibilityDelta, -5.5);
});

test("페이지 집계는 자사 URL 별 키워드 수·평균 포지션·예상 트래픽과 직전 대비를 계산한다", async () => {
  const breakdown = await getPagesBreakdown(auth, "c1");
  assert.equal(breakdown.hasData, true);

  const byUrl = new Map(breakdown.pages.map((page) => [page.url, page]));
  const pageA = byUrl.get("https://example.com/a");
  assert.equal(pageA?.keywords, 1);
  assert.equal(pageA?.avgPosition, 2);
  assert.equal(pageA?.avgPositionDiff, -3); // 5 → 2
  assert.equal(pageA?.estTraffic, 150);
  assert.equal(pageA?.estTrafficDiff, 95); // 55 → 150

  // 최신 스냅샷에서 URL 이 바뀐 경우: 새 URL 은 직전 비교가 없다.
  const pageB = byUrl.get("https://example.com/b");
  assert.equal(pageB?.keywords, 1);
  assert.equal(pageB?.avgPositionDiff, null);
  // 직전에만 있던 URL 은 최신 목록에 나오지 않는다.
  assert.equal(byUrl.has("https://example.com/b-old"), false);

  // 정렬: 예상 트래픽 내림차순
  assert.equal(breakdown.pages[0]?.url, "https://example.com/a");
});
