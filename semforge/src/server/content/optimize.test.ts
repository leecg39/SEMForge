import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  assertPublicContentUrl,
  collectOptimizationSource,
  extractOptimizationDocument,
} from "@/server/content/optimize";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.FIRECRAWL_API_KEY;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = originalApiKey;
});

const common = {
  keyword: "콘텐츠 최적화",
  title: null,
  audience: "콘텐츠 운영자",
  brandVoice: "명확한 전문가",
  language: "ko",
  countryCode: "KR",
  targetWordCount: 1000,
  aiProfile: "chatmock-gpt-5.6-luna-xhigh" as const,
};

test("직접 입력 최적화는 외부 호출 없이 원문과 실행 시각을 보존한다", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(); };
  const sourceText = `# 직접 입력 문서\n\n${"검색 의도에 맞춘 실제 원문 문장입니다. ".repeat(20)}`;
  const result = await collectOptimizationSource({ ...common, sourceType: "direct", sourceUrl: null, sourceText });
  assert.equal(calls, 0);
  assert.equal(result.document.title, "직접 입력 문서");
  assert.equal(result.document.markdown, sourceText);
  assert.equal(result.provenance.provider, "direct_input");
  assert.ok(Date.parse(result.provenance.capturedAt));
});

test("URL 최적화는 Firecrawl HTML을 Markdown 원문과 공급자 provenance로 변환한다", async () => {
  process.env.FIRECRAWL_API_KEY = "firecrawl-test-key";
  const paragraph = "검색 사용자의 질문에 실제 경험과 절차로 답하는 본문입니다. ".repeat(8);
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /https:\/\/example\.com\/guide/u);
    return Response.json({ success: true, data: { rawHtml: `<html><head><title>기존 가이드</title><meta name="description" content="기존 설명"></head><body><nav>메뉴</nav><main><h1>기존 가이드</h1><p>${paragraph}</p></main></body></html>`, metadata: { statusCode: 200, sourceURL: "https://example.com/guide" } } });
  };
  const result = await collectOptimizationSource({ ...common, sourceType: "url", sourceUrl: "https://example.com/guide", sourceText: null });
  assert.equal(result.provenance.provider, "firecrawl");
  assert.equal(result.provenance.status, 200);
  assert.equal(result.document.title, "기존 가이드");
  assert.match(result.document.markdown, /^# 기존 가이드/mu);
  assert.doesNotMatch(result.document.markdown, /메뉴/u);
});

test("URL 수집 경계는 내부 주소와 본문이 부족한 응답을 거부한다", () => {
  assert.throws(() => assertPublicContentUrl("http://127.0.0.1/private"), /내부 네트워크/u);
  assert.throws(() => extractOptimizationDocument("<html><body><p>짧음</p></body></html>", "제목"), /충분한 본문/u);
});
