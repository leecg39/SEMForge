import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * collectKeywordSerp 의 24시간 TTL 스냅샷 캐시 통합 테스트.
 *
 * 임시 SQLite 파일에 실제 마이그레이션을 적용하고, 전역 fetch 를 모킹해
 * "언제 외부 API 를 호출하는가"를 검증한다. DATABASE_PATH 를 모듈 로드 전에
 * 설정해야 하므로 앱 모듈은 전부 동적 import 로 불러온다 (CJS 변환 환경이라
 * top-level await 대신 before 훅을 쓴다).
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "talordata-cache-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.TALORDATA_API_TOKEN = "test-token";

let collectKeywordSerp: (typeof import("@/server/talordata/collect"))["collectKeywordSerp"];

let fetchCalls = 0;
const realFetch = globalThis.fetch;

function serpResponse(): Response {
  return Response.json({
    code: 0,
    data: {
      search_metadata: { id: `req-${fetchCalls}`, status: "Success", total_time_taken: 1 },
      organic: [
        {
          title: "First result",
          link: "https://first.example.com/page",
          display_link: "first.example.com",
          description: "First description",
        },
        {
          title: "Second result",
          link: "https://second.example.com/page",
          display_link: "second.example.com",
          description: "Second description",
        },
      ],
    },
  });
}

before(async () => {
  // 임시 DB 에 실제 마이그레이션을 적용한다.
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.close();

  ({ collectKeywordSerp } = await import("@/server/talordata/collect"));

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return serpResponse();
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const QUERY = { keyword: "cache test keyword", countryCode: "KR", device: "desktop" as const };

test("최초 수집은 API 를 호출하고 제목/설명을 포함한 스냅샷을 적재한다", async () => {
  const collection = await collectKeywordSerp(QUERY);
  assert.equal(fetchCalls, 1);
  assert.equal(collection.fromCache, false);
  assert.equal(collection.results.length, 2);
  assert.equal(collection.results[0]?.title, "First result");
});

test("TTL 이내 같은 조건 재수집은 API 호출 없이 캐시 스냅샷을 반환한다", async () => {
  const collection = await collectKeywordSerp(QUERY);
  assert.equal(fetchCalls, 1, "두 번째 호출은 외부 API 를 호출하면 안 된다");
  assert.equal(collection.fromCache, true);
  assert.equal(collection.results.length, 2);
  // 스냅샷에 저장한 제목/설명이 캐시 응답에도 유지된다.
  assert.equal(collection.results[0]?.title, "First result");
  assert.equal(collection.results[0]?.description, "First description");
  assert.equal(collection.results[0]?.domain, "first.example.com");
});

test("forceRefresh 는 캐시를 무시하고 실시간 재수집한다", async () => {
  // 같은 밀리초에 재수집되면 (metric, engine, capturedAt, position) 유니크 제약과
  // 충돌할 수 있으므로 실제 수집 간격을 흉내 내 잠시 대기한다.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const collection = await collectKeywordSerp({ ...QUERY, forceRefresh: true });
  assert.equal(fetchCalls, 2);
  assert.equal(collection.fromCache, false);
});

test("다른 엔진/국가 조합은 캐시를 공유하지 않는다", async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  const bing = await collectKeywordSerp({ ...QUERY, engine: "bing" });
  assert.equal(fetchCalls, 3, "bing 은 별도 수집이어야 한다");
  assert.equal(bing.fromCache, false);

  const us = await collectKeywordSerp({ ...QUERY, countryCode: "US" });
  assert.equal(fetchCalls, 4, "US 데이터베이스는 별도 수집이어야 한다");
  assert.equal(us.fromCache, false);

  // 원래 조합은 여전히 캐시에서 반환된다.
  const cached = await collectKeywordSerp(QUERY);
  assert.equal(fetchCalls, 4);
  assert.equal(cached.fromCache, true);
});

test("동일 시점의 동시 재수집은 유니크 충돌 없이 완료된다", async () => {
  // capturedAt 이 같은 두 수집이 동시에 달려도 onConflictDoNothing 덕에
  // 둘 다 정상 종료해야 한다 (forceRefresh 로 캐시를 우회).
  await new Promise((resolve) => setTimeout(resolve, 10));
  const before = fetchCalls;
  const [a, b] = await Promise.all([
    collectKeywordSerp({ ...QUERY, forceRefresh: true }),
    collectKeywordSerp({ ...QUERY, forceRefresh: true }),
  ]);
  assert.equal(fetchCalls, before + 2, "둘 다 외부 API 를 호출했다");
  assert.equal(a.fromCache, false);
  assert.equal(b.fromCache, false);
  assert.equal(a.results.length, 2);
  assert.equal(b.results.length, 2);
});

test("이전 월 metric 에만 스냅샷이 있으면 캐시하지 않고 신규 수집한다", async () => {
  // 현재 월(periodStart)과 다른 metric 의 라이브 스냅샷은 신선도 판정에서
  // 제외되어, 월이 바뀐 뒤에도 현재 월 metric 에 실측이 적재되어야 한다.
  const { db } = await import("@/db/client");
  const { keywordMetrics } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  // 이전 월 키워드를 수집해 metric + 스냅샷을 만든다.
  const oldQuery = {
    keyword: "previous month keyword",
    countryCode: "KR",
    device: "desktop" as const,
  };
  await collectKeywordSerp(oldQuery);

  // 이 키워드 metric 의 periodStart 를 한 달 전으로 되돌린다.
  const previous = await db
    .select()
    .from(keywordMetrics)
    .where(eq(keywordMetrics.normalizedKeyword, "previous month keyword"))
    .limit(1);
  const target = previous[0]!;
  const now = new Date();
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  await db
    .update(keywordMetrics)
    .set({ periodStart: lastMonthStart })
    .where(eq(keywordMetrics.id, target.id));

  // 다시 수집하면 현재 월 metric 이 없으므로 캐시가 아니라 신규 수집이어야 한다.
  const before = fetchCalls;
  const again = await collectKeywordSerp(oldQuery);
  assert.equal(again.fromCache, false);
  assert.ok(fetchCalls > before, "이전 월 스냅샷은 캐시로 쓰이지 않는다");
});
