import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "@/lib/api";
import {
  generateAdvertisingPlan,
  getAdvertisingCapabilities,
  googleAdUnits,
  validateGeneratedPlan,
} from "@/server/advertising/ai";

const validPlan = {
  headlines: ["첫 번째", "두 번째", "Third"],
  descriptions: ["검토 가능한 광고 설명입니다.", "실제 성과를 약속하지 않습니다."],
  primaryText: null,
  path1: "제품",
  path2: "보기",
  keywordSuggestions: ["광고 도구"],
  recommendations: [],
};

test("Google 광고 길이는 CJK를 2단위, 영문을 1단위로 계산한다", () => {
  assert.equal(googleAdUnits("광고ABC"), 7);
  assert.equal(googleAdUnits("12345"), 5);
});

test("Google 광고 공식 길이 규격을 넘긴 AI 출력은 거부한다", () => {
  assert.throws(
    () => validateGeneratedPlan({ ...validPlan, headlines: ["가".repeat(16), "둘", "셋"] }, "google"),
    (error: unknown) => error instanceof ApiError && /헤드라인 30자/.test(error.message),
  );
  assert.throws(
    () => validateGeneratedPlan({ ...validPlan, descriptions: ["가".repeat(46), "설명"] }, "google"),
    (error: unknown) => error instanceof ApiError && /설명 90자/.test(error.message),
  );
  assert.throws(
    () => validateGeneratedPlan({ ...validPlan, path1: "가".repeat(8) }, "google"),
    (error: unknown) => error instanceof ApiError && /표시 경로 15자/.test(error.message),
  );
});

test("OpenAI API 키 없이 ChatMock 계정 인증 기반 광고 초안을 생성한다", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousBaseUrl = process.env.CHATMOCK_BASE_URL;
  const previousModel = process.env.CHATMOCK_ADVERTISING_MODEL;
  const previousFetch = globalThis.fetch;
  delete process.env.OPENAI_API_KEY;
  process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";
  process.env.CHATMOCK_ADVERTISING_MODEL = "gpt-test";
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === "http://chatmock.test:8000/health") {
      return Response.json({ status: "ok" });
    }
    assert.equal(url, "http://chatmock.test:8000/v1/responses");
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      store: boolean;
      stream: boolean;
      input: Array<{ content: Array<{ text: string }> }>;
    };
    assert.equal(body.model, "gpt-test");
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.match(body.input[0]?.content[0]?.text ?? "", /example\.com/);
    assert.match(body.input[0]?.content[0]?.text ?? "", /add_keyword=\{keyword,matchType,negative\}/);
    assert.match(body.input[0]?.content[0]?.text ?? "", /Do not use plural keys/);
    const planJson = JSON.stringify(validPlan);
    return new Response(
      `event: response.output_text.delta\ndata: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: planJson,
      })}\n\nevent: response.completed\ndata: ${JSON.stringify({
        type: "response.completed",
        response: { output: [] },
      })}\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  try {
    const capabilities = await getAdvertisingCapabilities();
    assert.equal(capabilities.aiCopy.enabled, true);
    assert.equal(capabilities.aiCopy.reason, null);
    assert.equal(capabilities.export.enabled, true);

    const plan = await generateAdvertisingPlan(
      {
        platform: "google",
        goal: "sales",
        dailyBudgetCents: 10_000,
        currencyCode: "KRW",
        countryCode: "KR",
        languageCode: "ko",
        domain: "example.com",
        keywords: [{ id: "kw_1", keyword: "광고 도구", matchType: "phrase", negative: false }],
      },
      {
        domain: "example.com",
        finalUrl: "https://example.com",
        title: "광고 도구",
        description: "광고 캠페인을 준비합니다.",
        headings: ["광고 시작"],
        excerpt: "검토 가능한 광고 초안을 만듭니다.",
        source: "direct",
        error: null,
      },
    );
    assert.deepEqual(plan.headlines, validPlan.headlines);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousBaseUrl === undefined) delete process.env.CHATMOCK_BASE_URL;
    else process.env.CHATMOCK_BASE_URL = previousBaseUrl;
    if (previousModel === undefined) delete process.env.CHATMOCK_ADVERTISING_MODEL;
    else process.env.CHATMOCK_ADVERTISING_MODEL = previousModel;
  }
});

test("ChatMock 서버 미실행 상태는 계정 로그인과 서버 실행 방법을 안내한다", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("connection refused");
  };
  try {
    const capabilities = await getAdvertisingCapabilities();
    assert.equal(capabilities.aiCopy.enabled, false);
    assert.match(capabilities.aiCopy.reason ?? "", /chatmock login/);
    assert.match(capabilities.aiCopy.reason ?? "", /chatmock serve/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
