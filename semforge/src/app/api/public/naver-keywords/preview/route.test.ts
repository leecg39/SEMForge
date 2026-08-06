import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "naver-preview-route-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.PUBLIC_RATE_LIMIT_SECRET = "test-only-public-preview-route-secret";
process.env.NAVER_KEYWORD_INTELLIGENCE_ENABLED = "true";
process.env.PUBLIC_NAVER_KEYWORD_PREVIEW_ENABLED = "true";

let POST: typeof import("@/app/api/public/naver-keywords/preview/route")["POST"];
const realFetch = globalThis.fetch;

function request(keyword: string, cookie?: string, extra: Record<string, unknown> = {}) {
  return new Request("https://semforge.test/api/public/naver-keywords/preview", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.42",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ keyword, ...extra }),
  });
}

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.close();
  ({ POST } = await import("@/app/api/public/naver-keywords/preview/route"));
});

after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(directory, { recursive: true, force: true });
});

test("세 공급자 실데이터를 공개 제한 shape로 반환하고 httpOnly 익명 쿠키를 설정한다", async () => {
  process.env.NAVER_SEARCH_AD_ACCESS_LICENSE = "access";
  process.env.NAVER_SEARCH_AD_SECRET_KEY = "secret";
  process.env.NAVER_SEARCH_AD_CUSTOMER_ID = "customer";
  process.env.NAVER_API_HUB_CLIENT_ID = "client";
  process.env.NAVER_API_HUB_CLIENT_SECRET = "client-secret";
  let providerCalls = 0;
  globalThis.fetch = (async (input) => {
    providerCalls += 1;
    const url = String(input);
    if (url.includes("/keywordstool")) {
      return Response.json({ keywordList: [
        { relKeyword: "공개 테스트", monthlyPcQcCnt: 100, monthlyMobileQcCnt: "< 10", compIdx: "중간" },
        ...Array.from({ length: 8 }, (_, index) => ({
          relKeyword: `연관 ${index + 1}`,
          monthlyPcQcCnt: 10,
          monthlyMobileQcCnt: 20,
          compIdx: "낮음",
        })),
      ] });
    }
    if (url.includes("/search-trend/")) {
      return Response.json({
        startDate: "2025-08-04",
        endDate: "2026-08-04",
        timeUnit: "month",
        results: [{ title: "공개 테스트", keywords: ["공개 테스트"], data: [{ period: "2026-08-01", ratio: 55 }] }],
      });
    }
    return Response.json({ total: 12, start: 1, display: 3, items: [] });
  }) as typeof fetch;

  const response = await POST(request("  공개\u3000테스트  "));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
  assert.equal(payload.data.keyword, "공개 테스트");
  assert.equal(payload.data.searchAds.data.relatedKeywords.length, 5);
  assert.equal(payload.data.blog.data.resultLabel, "네이버 블로그 검색 API 응답 예시");
  assert.equal(payload.meta.quota.cookieRemaining, 2);

  const duplicate = await POST(request("공개 테스트", cookiePair(response)));
  const duplicatePayload = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicatePayload.meta.quota.cookieRemaining, 2);
  assert.equal(providerCalls, 3, "동일 익명 키워드는 캐시만 사용해야 한다");
});

test("모든 공급자가 unavailable이면 동일 봉투를 503으로 반환한다", async () => {
  delete process.env.NAVER_SEARCH_AD_ACCESS_LICENSE;
  delete process.env.NAVER_SEARCH_AD_SECRET_KEY;
  delete process.env.NAVER_SEARCH_AD_CUSTOMER_ID;
  delete process.env.NAVER_API_HUB_CLIENT_ID;
  delete process.env.NAVER_API_HUB_CLIENT_SECRET;

  const response = await POST(request("자격증명 없음"));
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.data.searchAds.status, "unavailable");
  assert.equal(payload.data.trend.status, "unavailable");
  assert.equal(payload.data.blog.status, "unavailable");
});

test("같은 키워드는 무료이며 네 번째 고유 키워드는 Retry-After가 있는 429다", async () => {
  delete process.env.NAVER_SEARCH_AD_ACCESS_LICENSE;
  delete process.env.NAVER_API_HUB_CLIENT_ID;
  const first = await POST(request("쿼터 하나"));
  const cookie = cookiePair(first);
  const duplicate = await POST(request("쿼터 하나", cookie));
  assert.equal((await duplicate.json()).meta.quota.cookieRemaining, 2);
  await POST(request("쿼터 둘", cookie));
  await POST(request("쿼터 셋", cookie));
  const blocked = await POST(request("쿼터 넷", cookie));
  const payload = await blocked.json();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.ok(payload.error.details.retryAfter > 0);
});

test("forceRefresh 같은 공개되지 않은 입력은 공급자 호출 전에 400으로 거부한다", async () => {
  const response = await POST(request("엄격한 입력", undefined, { forceRefresh: true }));
  assert.equal(response.status, 400);
});
