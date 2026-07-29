import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";
import { fetchSerp } from "@/server/talordata/client";

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

function successfulResponse(): Response {
  return Response.json({
    code: 0,
    data: {
      search_metadata: {
        id: "request-1",
        status: "Success",
        total_time_taken: 1.25,
      },
      organic: [
        {
          title: "Example",
          link: "https://www.example.com/page",
          display_link: "example.com",
          description: "Result",
        },
      ],
    },
  });
}

test("일시적인 Collection failed 응답 뒤 성공하면 재시도 결과를 반환한다", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ code: 1, message: "error, Collection failed" });
    }
    return successfulResponse();
  };

  const result = await fetchSerp(
    { q: "pizza" },
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
  assert.equal(result.organic[0]?.domain, "example.com");
  assert.equal(result.provider.id, "request-1");
});

test("인증 실패는 재시도하지 않고 즉시 토큰 오류로 반환한다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  };

  await assert.rejects(
    () => fetchSerp({ q: "pizza" }, { fetchImpl, maxAttempts: 3 }),
    (error: unknown) =>
      error instanceof ApiError && error.message === "SERP API 토큰이 유효하지 않습니다."
  );
  assert.equal(calls, 1);
});

test("수집 엔진 실패가 계속되면 횟수와 원인을 포함한 안전한 오류를 반환한다", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ code: 1, message: "error, Collection failed" });
  };

  await assert.rejects(
    () =>
      fetchSerp(
        { q: "pizza" },
        {
          fetchImpl,
          maxAttempts: 3,
          retryBaseDelayMs: 0,
          sleep: async () => undefined,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.match(error.message, /토큰 승인 문제는 아니며/);
      assert.deepEqual(error.details, {
        attempts: 3,
        reason: "error, Collection failed",
      });
      return true;
    }
  );
  assert.equal(calls, 3);
});
