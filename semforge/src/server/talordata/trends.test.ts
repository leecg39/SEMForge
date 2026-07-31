import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";
import { fetchTrendsTimeseries } from "@/server/talordata/trends";

const previousToken = process.env.TALORDATA_API_TOKEN;

before(() => {
  process.env.TALORDATA_API_TOKEN = "test-token";
});

after(() => {
  if (previousToken === undefined) {
    delete process.env.TALORDATA_API_TOKEN;
  } else {
    process.env.TALORDATA_API_TOKEN = previousToken;
  }
});

/** 2026-07-31 실측 프로브(trends-timeseries-world.json)와 같은 형태. */
function successfulResponse(): Response {
  return Response.json({
    code: 0,
    data: {
      cache_status: false,
      code: 200,
      search_metadata: { id: "trends-1", created_at: "2026-07-31 14:47:28" },
      trends_results: [
        { date: "Aug 3–9, 2025", timestamp: "1754179200", value: "25" },
        { date: "Jul 27–Aug 2, 2025", timestamp: "1753574400", value: "32" },
        { date: "Aug 10–16, 2025", timestamp: "1754784000", value: "<1" },
      ],
    },
  });
}

test("TIMESERIES 요청 계약: engine=google_trends, geo 필수, 기본 12개월", async () => {
  let capturedBody: URLSearchParams | undefined;
  const fetchImpl: typeof fetch = async (_input, init) => {
    capturedBody = init?.body as URLSearchParams;
    return successfulResponse();
  };

  await fetchTrendsTimeseries({ q: "커피 머신", geo: "kr" }, { fetchImpl });

  assert.ok(capturedBody instanceof URLSearchParams);
  assert.deepEqual(Object.fromEntries(capturedBody), {
    engine: "google_trends",
    q: "커피 머신",
    data_type: "TIMESERIES",
    date: "today 12-m",
    geo: "KR",
    hl: "ko",
    json: "1",
  });
});

test("포인트를 시각 오름차순으로 정렬하고 '<1' 은 0 으로 정규화한다", async () => {
  const fetchImpl: typeof fetch = async () => successfulResponse();

  const result = await fetchTrendsTimeseries({ q: "커피 머신", geo: "KR" }, { fetchImpl });

  assert.equal(result.points.length, 3);
  assert.deepEqual(
    result.points.map((point) => point.value),
    [32, 25, 0]
  );
  assert.equal(result.points[0].label, "Jul 27–Aug 2, 2025");
  assert.equal(result.points[0].periodStart.toISOString(), "2025-07-27T00:00:00.000Z");
  assert.equal(result.provider.id, "trends-1");
  assert.equal(result.provider.cacheStatus, false);
});

test("trends_results 가 빈 배열이면 empty 상태로 그대로 반환한다 (재시도 없음)", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({
      code: 0,
      data: { search_metadata: { id: "trends-2" }, trends_results: [] },
    });
  };

  const result = await fetchTrendsTimeseries({ q: "asdfqwerzxcv", geo: "KR" }, { fetchImpl });

  assert.equal(calls, 1);
  assert.deepEqual(result.points, []);
});

test("문자열 data 오류(Collection failed) 뒤 성공하면 재시도 결과를 반환한다", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      // 실측 프로브에서 확인된 실패 모드: code=0 + data 가 오류 문자열
      return Response.json({ code: 0, data: "error, Collection failed" });
    }
    return successfulResponse();
  };

  const result = await fetchTrendsTimeseries(
    { q: "커피 머신", geo: "KR" },
    {
      fetchImpl,
      maxAttempts: 3,
      retryBaseDelayMs: 10,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    }
  );

  assert.equal(calls, 2);
  assert.deepEqual(delays, [10]);
  assert.equal(result.points.length, 3);
});

test("실패가 계속되면 횟수와 원인을 포함한 안전한 오류를 반환한다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ code: 0, data: "error, Collection failed" });
  };

  await assert.rejects(
    () =>
      fetchTrendsTimeseries(
        { q: "커피 머신", geo: "KR" },
        { fetchImpl, maxAttempts: 3, retryBaseDelayMs: 0, sleep: async () => undefined }
      ),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.match(error.message, /토큰 승인 문제는 아니며/);
      assert.deepEqual(error.details, { attempts: 3, reason: "error, Collection failed" });
      return true;
    }
  );
  assert.equal(calls, 3);
});

test("사용량 한도 문자열 오류는 재시도하지 않고 RATE_LIMITED 로 반환한다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ code: 0, data: "error, insufficient credit" });
  };

  await assert.rejects(
    () => fetchTrendsTimeseries({ q: "커피 머신", geo: "KR" }, { fetchImpl, maxAttempts: 3 }),
    (error: unknown) => error instanceof ApiError && error.code === "RATE_LIMITED"
  );
  assert.equal(calls, 1);
});
