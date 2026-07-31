import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * getKeywordInsights 의 trend_timeseries TTL(7일) 캐시 통합 테스트.
 * collect.test.ts 와 같은 방식: 임시 SQLite 에 실제 마이그레이션을 적용하고
 * 전역 fetch 를 모킹해 "언제 외부 API 를 호출하는가"를 검증한다.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "talordata-insights-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.TALORDATA_API_TOKEN = "test-token";

let getKeywordInsights: (typeof import("@/server/talordata/insights"))["getKeywordInsights"];

let fetchCalls = 0;
let nextPoints: Array<{ date: string; timestamp: string; value: string }> = [];
let failNext = false;
const realFetch = globalThis.fetch;

function trendsResponse(): Response {
  if (failNext) {
    return Response.json({ code: 0, data: "error, Collection failed" });
  }
  return Response.json({
    code: 0,
    data: {
      cache_status: false,
      search_metadata: { id: `trends-${fetchCalls}` },
      trends_results: nextPoints,
    },
  });
}

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

  ({ getKeywordInsights } = await import("@/server/talordata/insights"));

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return trendsResponse();
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("최초 수집은 API 를 호출하고 keyword_insights 에 적재한다", async () => {
  nextPoints = [
    { date: "Jul 27–Aug 2, 2025", timestamp: "1753574400", value: "32" },
    { date: "Aug 3–9, 2025", timestamp: "1754179200", value: "25" },
  ];
  const report = await getKeywordInsights({
    keyword: "캐시 테스트 키워드",
    countryCode: "kr",
    kinds: ["trend_timeseries"],
  });
  assert.equal(fetchCalls, 1);
  const outcome = report.insights.trend_timeseries;
  assert.ok(outcome && outcome.status === "ok");
  assert.equal(outcome.fromCache, false);
  assert.equal(outcome.payload.length, 2);
  assert.equal(outcome.payload[0].value, 32);
  assert.equal(outcome.source, "talordata-trends");
  assert.equal(report.countryCode, "KR");
});

test("TTL 이내 재조회는 외부 호출 없이 캐시를 반환한다", async () => {
  const report = await getKeywordInsights({
    keyword: "캐시 테스트 키워드",
    countryCode: "KR",
    kinds: ["trend_timeseries"],
  });
  assert.equal(fetchCalls, 1); // 추가 호출 없음
  const outcome = report.insights.trend_timeseries;
  assert.ok(outcome && outcome.status === "ok");
  assert.equal(outcome.fromCache, true);
  assert.equal(outcome.payload.length, 2);
});

test("forceRefresh 는 캐시를 무시하고 재수집한다", async () => {
  const report = await getKeywordInsights({
    keyword: "캐시 테스트 키워드",
    countryCode: "KR",
    kinds: ["trend_timeseries"],
    forceRefresh: true,
  });
  assert.equal(fetchCalls, 2);
  const outcome = report.insights.trend_timeseries;
  assert.ok(outcome && outcome.status === "ok");
  assert.equal(outcome.fromCache, false);
});

test("빈 시계열도 정상 결과로 적재·캐시된다 (empty 1급 상태)", async () => {
  nextPoints = [];
  const first = await getKeywordInsights({
    keyword: "무데이터 키워드 zxqv",
    countryCode: "KR",
    kinds: ["trend_timeseries"],
  });
  const firstOutcome = first.insights.trend_timeseries;
  assert.ok(firstOutcome && firstOutcome.status === "ok");
  assert.deepEqual(firstOutcome.payload, []);

  const callsAfterFirst = fetchCalls;
  const second = await getKeywordInsights({
    keyword: "무데이터 키워드 zxqv",
    countryCode: "KR",
    kinds: ["trend_timeseries"],
  });
  assert.equal(fetchCalls, callsAfterFirst); // 빈 결과도 캐시 히트
  const secondOutcome = second.insights.trend_timeseries;
  assert.ok(secondOutcome && secondOutcome.status === "ok");
  assert.equal(secondOutcome.fromCache, true);
});

test("수집 실패는 해당 kind 에만 error 로 기록된다 (부분 실패 허용)", async () => {
  failNext = true;
  try {
    const report = await getKeywordInsights({
      keyword: "실패 키워드",
      countryCode: "KR",
      kinds: ["trend_timeseries"],
    });
    const outcome = report.insights.trend_timeseries;
    assert.ok(outcome && outcome.status === "error");
    assert.match(outcome.error, /다시 시도/);
  } finally {
    failNext = false;
  }
});
