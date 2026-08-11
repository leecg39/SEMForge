// @TASK P3-C1-T1 - TalorData Google provider adapter contract
// @SPEC docs/planning/06-tasks.md#p3-c1-t1--google-rank와-aio-수집
// @TEST src/server/providers/talordata/provider.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createTalordataGoogleProvider,
  TalordataProviderFailure,
} from "@/server/providers/talordata/provider";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
}

test("공식 응답 픽스처를 KR/ko/desktop/top100 AIO 결과로 변환한다", async () => {
  let body: URLSearchParams | undefined;
  const provider = createTalordataGoogleProvider({
    token: "provider-test-token",
    fetchImpl: async (_input, init) => {
      assert.ok(init?.body instanceof URLSearchParams);
      body = init.body;
      return Response.json(fixture("official-google-serp-aio.json"));
    },
    maxAttempts: 1,
  });

  const result = await provider.search({
    query: "주간 검색 가시성",
    includeAiOverview: true,
  });

  assert.deepEqual(Object.fromEntries(body ?? []), {
    engine: "google",
    q: "주간 검색 가시성",
    num: "100",
    gl: "kr",
    hl: "ko",
    device: "desktop",
    ai_overview: "true",
    json: "1",
  });
  assert.equal(result.providerRequestId, "task-google-aio-20260812");
  assert.equal(result.organic[1]?.position, 37);
  assert.equal(result.aiOverview.presenceAvailable, true);
  assert.equal(result.aiOverview.citations[0]?.domain, "insights.example.com");
  assert.equal(result.provenance.source, "talordata");
  assert.equal(result.provenance.window, 100);
  assert.deepEqual(result.organicCoverage, {
    requested: 100,
    validatedThrough: 100,
    complete: true,
  });
});

test("공식 rate limit은 worker가 재시도할 수 있는 오류로 분류한다", async () => {
  const provider = createTalordataGoogleProvider({
    token: "provider-test-token",
    fetchImpl: async () => Response.json(fixture("official-rate-limit.json")),
    maxAttempts: 1,
  });

  await assert.rejects(
    () => provider.search({ query: "rate limited", includeAiOverview: false }),
    (error: unknown) =>
      error instanceof TalordataProviderFailure &&
      error.disposition === "retryable" &&
      error.reason === "rate_limit",
  );
});

test("공식 timeout은 재시도 가능한 provider timeout으로 분류한다", async () => {
  const provider = createTalordataGoogleProvider({
    token: "provider-test-token",
    fetchImpl: async () => Response.json(fixture("official-timeout.json")),
    maxAttempts: 1,
  });

  await assert.rejects(
    () => provider.search({ query: "timeout", includeAiOverview: true }),
    (error: unknown) =>
      error instanceof TalordataProviderFailure &&
      error.disposition === "retryable" &&
      error.reason === "timeout",
  );
});

test("worker abort signal을 HTTP 경계까지 전파하고 retryable aborted로 분류한다", async () => {
  const controller = new AbortController();
  controller.abort("worker shutdown");
  const provider = createTalordataGoogleProvider({
    token: "provider-test-token",
    fetchImpl: async (_input, init) => {
      assert.equal(init?.signal?.aborted, true);
      throw new DOMException("aborted", "AbortError");
    },
    maxAttempts: 1,
  });

  await assert.rejects(
    () =>
      provider.search({
        query: "abort",
        includeAiOverview: false,
        signal: controller.signal,
      }),
    (error: unknown) =>
      error instanceof TalordataProviderFailure &&
      error.disposition === "retryable" &&
      error.reason === "aborted",
  );
});

test("공식 code=400 collection pipeline 실패는 retryable provider로 분류한다", async () => {
  const provider = createTalordataGoogleProvider({
    token: "provider-test-token",
    fetchImpl: async () => Response.json(fixture("official-pipeline-error.json")),
    maxAttempts: 1,
  });

  await assert.rejects(
    () => provider.search({ query: "pipeline", includeAiOverview: false }),
    (error: unknown) =>
      error instanceof TalordataProviderFailure &&
      error.disposition === "retryable" &&
      error.reason === "provider",
  );
});

test("공식 code=401 인증 실패는 재시도하지 않는 terminal로 분류한다", async () => {
  const provider = createTalordataGoogleProvider({
    token: "provider-test-token",
    fetchImpl: async () => Response.json(fixture("official-auth-error.json")),
    maxAttempts: 3,
  });

  await assert.rejects(
    () => provider.search({ query: "auth", includeAiOverview: false }),
    (error: unknown) =>
      error instanceof TalordataProviderFailure &&
      error.disposition === "terminal" &&
      error.reason === "authentication",
  );
});

test("provider token은 명시적으로 주입해야 하며 process.env fallback을 사용하지 않는다", async () => {
  const previous = process.env.TALORDATA_API_TOKEN;
  process.env.TALORDATA_API_TOKEN = "must-not-be-read";
  try {
    const provider = createTalordataGoogleProvider({
      fetchImpl: async () => Response.json(fixture("official-google-serp-aio.json")),
      maxAttempts: 1,
    });
    await assert.rejects(
      provider.search({ query: "missing injected token", includeAiOverview: false }),
      (error: unknown) =>
        error instanceof TalordataProviderFailure && error.reason === "configuration",
    );
  } finally {
    if (previous === undefined) delete process.env.TALORDATA_API_TOKEN;
    else process.env.TALORDATA_API_TOKEN = previous;
  }
});
