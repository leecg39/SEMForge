import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getTrackingLocation } from "@/lib/position-tracking/locations";
import type { KeywordSerpCollection } from "@/server/talordata/collect";
import {
  collectAiSearchObservation,
  domainMatches,
  mentionsAnyBrand,
  type AiSearchProviderInput,
} from "./providers";

const originalOpenAi = process.env.OPENAI_API_KEY;
const originalGemini = process.env.GEMINI_API_KEY;
const originalTalordata = process.env.TALORDATA_API_TOKEN;

before(() => {
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.TALORDATA_API_TOKEN = "test-talordata";
});

after(() => {
  if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAi;
  if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGemini;
  if (originalTalordata === undefined) delete process.env.TALORDATA_API_TOKEN;
  else process.env.TALORDATA_API_TOKEN = originalTalordata;
});

function input(provider: AiSearchProviderInput["provider"]): AiSearchProviderInput {
  return {
    provider,
    prompt: "협업 도구 추천",
    brandNames: ["Acme", "에크미"],
    targetDomain: "example.com",
    location: getTrackingLocation("KR-SEOUL")!,
  };
}

function serp(aiOverview: KeywordSerpCollection["aiOverview"], features: string[] = []): KeywordSerpCollection {
  return {
    keywordMetricId: "kw1",
    capturedAt: new Date("2026-08-01T00:00:00Z"),
    results: [],
    paid: [],
    shoppingAvailability: "available",
    features,
    aiOverview,
    localResults: [],
    fromCache: false,
  };
}

test("Google AIO 있음·없음·인용 미제공 상태를 구분한다", async () => {
  const visible = await collectAiSearchObservation(input("google_aio"), {
    collectKeywordSerp: async () => serp({
      present: true,
      citationsAvailable: true,
      citations: [{ url: "https://www.example.com/guide", domain: "example.com", title: "Guide" }],
    }),
  });
  assert.equal(visible.visibilityStatus, "visible");
  assert.equal(visible.citations.length, 1);

  const absent = await collectAiSearchObservation(input("google_aio"), {
    collectKeywordSerp: async () => serp({ present: false, citationsAvailable: true, citations: [] }),
  });
  assert.equal(absent.visibilityStatus, "not_visible");

  const unknown = await collectAiSearchObservation(input("google_aio"), {
    collectKeywordSerp: async () => serp(undefined, ["ai_overview"]),
  });
  assert.equal(unknown.visibilityStatus, "unknown");
  assert.equal(unknown.citationsAvailable, false);
});

test("OpenAI 웹 검색 응답에서 브랜드 언급과 URL 인용을 정규화한다", async () => {
  const result = await collectAiSearchObservation(input("chatgpt_web"), {
    fetch: async () => Response.json({
      output: [{
        content: [{
          text: "Acme는 협업 도구 선택지입니다.",
          annotations: [{ type: "url_citation", url: "https://example.com/acme", title: "Acme" }],
        }],
      }],
    }),
  });
  assert.equal(result.brandMentioned, true);
  assert.equal(result.visibilityStatus, "visible");
  assert.equal(result.citations[0]?.domain, "example.com");
});

test("Gemini grounding chunk를 실제 인용 URL로 저장할 수 있는 형태로 반환한다", async () => {
  const result = await collectAiSearchObservation(input("gemini_grounded"), {
    fetch: async () => Response.json({
      candidates: [{
        content: { parts: [{ text: "다음 자료를 참고했습니다." }] },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: "https://outside.test/review", title: "Review" } }],
        },
      }],
    }),
  });
  assert.equal(result.visibilityStatus, "not_visible");
  assert.equal(result.citationsAvailable, true);
  assert.deepEqual(result.citations.map((row) => row.domain), ["outside.test"]);
});

test("429와 시간 초과를 서로 다른 공급자 오류 메시지로 노출한다", async () => {
  await assert.rejects(
    collectAiSearchObservation(input("chatgpt_web"), {
      fetch: async () => Response.json({ error: "limit" }, { status: 429 }),
    }),
    /사용량 한도/,
  );
  const neverFetch: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });
  await assert.rejects(
    collectAiSearchObservation(input("gemini_grounded"), {
      fetch: neverFetch,
      timeoutMs: 1,
    }),
    /시간 초과/,
  );
});

test("브랜드 별칭과 서브도메인은 대소문자·구두점 차이를 허용해 일치한다", () => {
  assert.equal(mentionsAnyBrand("에크미(Acme)의 공식 답변", ["ACME"]), true);
  assert.equal(domainMatches("www.example.com", "example.com"), true);
  assert.equal(domainMatches("fakeexample.com", "example.com"), false);
});
