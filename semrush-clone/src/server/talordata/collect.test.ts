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
