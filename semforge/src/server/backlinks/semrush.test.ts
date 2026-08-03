import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@/lib/api";
import { SemrushBacklinkProvider } from "@/server/backlinks/semrush";

function ok(data: unknown, meta: Record<string, unknown> = {}): Response {
  return Response.json({
    meta: { success: true, status_code: 200, request_id: "req-1", effective_url: "https://example.com", ...meta },
    data,
  });
}

test("v4 Apikey 헤더를 사용하고 개요를 공급자 중립 형태로 정규화한다", async () => {
  let capturedUrl = "";
  let capturedHeader = "";
  const provider = new SemrushBacklinkProvider({
    apiKey: "secret-test-key",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedHeader = String((init?.headers as Record<string, string>).Authorization);
      return ok({ score: 72, backlinks_count: 1200, domains_count: 87, urls_count: 240, follows_count: 900 });
    },
  });
  const result = await provider.overview("example.com", "root_domain");
  assert.match(capturedUrl, /\/overview\?url=example\.com&scope=ROOT_DOMAIN/);
  assert.equal(capturedHeader, "Apikey secret-test-key");
  assert.deepEqual(result.data.authorityScore, 72);
  assert.deepEqual(result.data.backlinks, 1200);
  assert.deepEqual(result.data.referringDomains, 87);
  assert.equal(result.data.nofollowBacklinks, null, "응답에 없는 지표는 0으로 만들지 않는다");
  assert.equal(result.requestId, "req-1");
});

test("목록 응답을 타입된 행으로 정규화한다", async () => {
  const provider = new SemrushBacklinkProvider({
    apiKey: "test-key",
    fetchImpl: async () => ok([
      {
        source_url: "https://source.example/post",
        target_url: "https://example.com/page",
        source_domain: "source.example",
        anchor: "Example",
        domain_score: 55,
        is_nofollow: true,
        is_new: true,
      },
    ], { total: 31 }),
  });
  const result = await provider.list({
    target: "example.com",
    scope: "root_domain",
    dataset: "links",
    limit: 25,
    offset: 0,
    sort: "page_score",
    direction: "desc",
    filter: null,
  });
  assert.equal(result.total, 31);
  assert.deepEqual(result.data[0], {
    kind: "links",
    sourceUrl: "https://source.example/post",
    targetUrl: "https://example.com/page",
    sourceDomain: "source.example",
    sourceTitle: null,
    anchor: "Example",
    domainScore: 55,
    pageScore: null,
    firstSeenAt: null,
    lastSeenAt: null,
    nofollow: true,
    sponsored: false,
    ugc: false,
    image: false,
    form: false,
    frame: false,
    isNew: true,
    isLost: false,
  });
});

test("retryable 오류는 재시도하고 인증 오류는 키를 노출하지 않는다", async () => {
  let calls = 0;
  const provider = new SemrushBacklinkProvider({
    apiKey: "never-expose-this",
    maxAttempts: 2,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({ meta: { success: false, status_code: 503, request_id: "retry" }, error: { message: "Unavailable", retryable: true } }, { status: 503 });
      }
      return ok({ score: 10 });
    },
  });
  await provider.overview("example.com", "root_domain");
  assert.equal(calls, 2);

  const denied = new SemrushBacklinkProvider({
    apiKey: "never-expose-this",
    fetchImpl: async () => Response.json({ meta: { success: false, status_code: 401, request_id: "denied" }, error: { message: "Unauthorized", retryable: false } }, { status: 401 }),
  });
  await assert.rejects(
    () => denied.overview("example.com", "root_domain"),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "INTERNAL");
      assert.doesNotMatch(JSON.stringify(error), /never-expose-this/);
      return true;
    },
  );
});

test("키가 없으면 구성 오류를 명시한다", async () => {
  const provider = new SemrushBacklinkProvider({ apiKey: "" });
  await assert.rejects(
    () => provider.overview("example.com", "root_domain"),
    (error: unknown) => error instanceof ApiError && (error.details as { providerReason?: string }).providerReason === "configuration",
  );
});

