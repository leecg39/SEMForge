import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import {
  getContentAiModelCapabilities,
  requestContentAiText,
} from "@/server/content/generation-providers";

const originalFetch = globalThis.fetch;
const originalChatMockBaseUrl = process.env.CHATMOCK_BASE_URL;
const originalXaiKey = process.env.XAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalXaiKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalXaiKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

after(() => {
  if (originalChatMockBaseUrl === undefined) delete process.env.CHATMOCK_BASE_URL;
  else process.env.CHATMOCK_BASE_URL = originalChatMockBaseUrl;
});

test("GPT-5.6 Luna는 ChatMock Responses API에 xHigh 추론 설정을 전달한다", async () => {
  process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ output_text: "{\"title\":\"초안\"}" });
  };

  const result = await requestContentAiText("기사 작성", "chatmock-gpt-5.6-luna-xhigh");

  assert.equal(requestUrl, "http://chatmock.test:8000/v1/responses");
  assert.equal(requestBody.model, "gpt-5.6-luna");
  assert.deepEqual(requestBody.reasoning, { effort: "xhigh" });
  assert.equal(result.provenance.reasoningEffort, "xhigh");
});

test("Grok 4.5 선택은 서버의 XAI_API_KEY로 xAI Responses API를 호출한다", async () => {
  process.env.XAI_API_KEY = "test-xai";
  let authorization = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.x.ai/v1/responses");
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ output_text: "{\"title\":\"Grok 초안\"}" });
  };

  const result = await requestContentAiText("기사 작성", "xai-grok-4.5");

  assert.equal(authorization, "Bearer test-xai");
  assert.equal(requestBody.model, "grok-4.5");
  assert.equal(result.provenance.provider, "xai");
});

test("Gemini 3.5 Flash 선택은 Google generateContent 응답에서 최종 텍스트만 읽는다", async () => {
  process.env.GEMINI_API_KEY = "test-gemini";
  let apiKey = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    );
    apiKey = new Headers(init?.headers).get("x-goog-api-key") ?? "";
    return Response.json({
      candidates: [{
        content: {
          parts: [
            { thought: true, text: "내부 추론" },
            { text: "{\"title\":\"Gemini 초안\"}" },
          ],
        },
      }],
    });
  };

  const result = await requestContentAiText("기사 작성", "google-gemini-3.5-flash");

  assert.equal(apiKey, "test-gemini");
  assert.equal(result.text, "{\"title\":\"Gemini 초안\"}");
  assert.equal(result.provenance.provider, "google");
});

test("환경변수가 없는 외부 모델은 비활성 사유를 반환한다", async () => {
  delete process.env.XAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const capabilities = await getContentAiModelCapabilities({
    enabled: true,
    reason: null,
    model: "gpt-5.6-luna",
  });

  assert.equal(capabilities.find((item) => item.provider === "chatmock")?.enabled, true);
  assert.match(capabilities.find((item) => item.provider === "xai")?.reason ?? "", /XAI_API_KEY/);
  assert.match(capabilities.find((item) => item.provider === "google")?.reason ?? "", /GEMINI_API_KEY/);
});
