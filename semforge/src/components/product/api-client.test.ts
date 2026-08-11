// @TASK P4-F1-T1 - Browser API boundary security contracts
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST This file
import assert from "node:assert/strict";
import test from "node:test";

import { mutateApi } from "./api-client";
import { parseRecordContract } from "./contracts";

test("브라우저 mutation은 tenant 식별자 재정의를 fetch 전에 거부한다", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response();
  };

  try {
    await assert.rejects(
      mutateApi(
        "/api/v1/sites",
        "POST",
        { name: "다른 워크스페이스", domain: "example.com", workspaceId: "tenant-override" },
        parseRecordContract,
      ),
      /tenant 식별자/,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정상 mutation은 같은 origin 쿠키와 매 요청 idempotency key를 사용한다", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    capturedInput = input;
    capturedInit = init;
    return Response.json(
      { data: { id: "site-1" }, error: null, requestId: "req-1" },
      { status: 201, headers: { "x-request-id": "req-1" } },
    );
  };

  try {
    const result = await mutateApi(
      "/api/v1/sites",
      "POST",
      { name: "서울 공방", domain: "atelier.example", timezone: "Asia/Seoul" },
      parseRecordContract,
    );

    assert.equal(capturedInput, "/api/v1/sites");
    assert.equal(capturedInit?.method, "POST");
    assert.equal(capturedInit?.credentials, "same-origin");
    assert.equal(capturedInit?.cache, "no-store");
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.match(headers.get("idempotency-key") ?? "", /^[0-9a-f-]{36}$/iu);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      name: "서울 공방",
      domain: "atelier.example",
      timezone: "Asia/Seoul",
    });
    assert.deepEqual(result, { data: { id: "site-1" }, requestId: "req-1" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
