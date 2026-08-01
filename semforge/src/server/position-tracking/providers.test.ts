import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getTrackingLocation } from "@/lib/position-tracking/locations";
import { collectTrackingObservation } from "@/server/position-tracking/providers";

const previousFetch = globalThis.fetch;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
const previousGeminiKey = process.env.GEMINI_API_KEY;

before(() => {
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.GEMINI_API_KEY = "test-gemini";
});

after(() => {
  globalThis.fetch = previousFetch;
  if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAiKey;
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGeminiKey;
});

const base = {
  keyword: "검색 최적화",
  device: "desktop" as const,
  targetType: "subdomain" as const,
  targetValue: "www.uinus.co.kr",
  businessName: "유앤어스",
  location: getTrackingLocation("KR-SEOUL")!,
};

test("ChatGPT는 인용 URL의 첫 타겟 일치 순서와 사업체 언급을 기록한다", async () => {
  globalThis.fetch = async () => Response.json({
    output: [{
      content: [{
        text: "유앤어스는 관련 서비스를 제공합니다.",
        annotations: [
          { type: "url_citation", url: "https://example.com/one", title: "One" },
          { type: "url_citation", url: "https://www.uinus.co.kr/page", title: "Target" },
        ],
      }],
    }],
  });
  const result = await collectTrackingObservation({ ...base, engine: "chatgpt" });
  assert.equal(result.position, 2);
  assert.equal(result.url, "https://www.uinus.co.kr/page");
  assert.equal(result.mentioned, true);
  assert.equal(result.source, "openai");
});

test("Gemini는 grounding 인용 순서에서 첫 타겟 일치를 기록한다", async () => {
  globalThis.fetch = async () => Response.json({
    candidates: [{
      content: { parts: [{ text: "일반적인 검색 답변" }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://example.com/one", title: "One" } },
          { web: { uri: "https://www.uinus.co.kr/gemini", title: "Target" } },
        ],
      },
    }],
  });
  const result = await collectTrackingObservation({ ...base, engine: "gemini" });
  assert.equal(result.position, 2);
  assert.equal(result.url, "https://www.uinus.co.kr/gemini");
  assert.equal(result.mentioned, false);
  assert.equal(result.source, "gemini");
});
