import assert from "node:assert/strict";
import test from "node:test";
import { buildPromptResearchView, classifyPromptIntent, parseGeneratedPromptIdeas } from "./prompt-research";

test("프롬프트 의도를 구매·비교·정보·탐색으로 분류한다", () => {
  assert.equal(classifyPromptIntent("경영 컨설팅 비용과 견적은?"), "transactional");
  assert.equal(classifyPromptIntent("A사와 B사의 장단점을 비교해 주세요"), "commercial");
  assert.equal(classifyPromptIntent("기업 인수 합병이 무엇인가요?"), "informational");
  assert.equal(classifyPromptIntent("한국의 전략 컨설팅 시장 전망"), "exploratory");
});

test("실제 관측 ID로 프롬프트별 브랜드와 출처를 집계한다", () => {
  const view = buildPromptResearchView(
    [{ id: "p1", prompt: "Acme와 경쟁사를 비교해 주세요", topic: "경쟁 비교" }],
    [{ id: "o1", promptId: "p1", responseText: "Acme and Beta", capturedAt: new Date("2026-08-03T00:00:00Z") }],
    {
      generatedAt: "2026-08-03T00:00:00Z",
      brands: [
        { id: "own", name: "Acme", kind: "own", color: "#111", mentionedAnswers: 1, mediaShare: 50, sentimentScore: 50, sentiment: { positive: 0, neutral: 1, negative: 0 }, evidenceObservationIds: ["o1"] },
        { id: "beta", name: "Beta", kind: "competitor", color: "#222", mentionedAnswers: 1, mediaShare: 50, sentimentScore: 50, sentiment: { positive: 0, neutral: 1, negative: 0 }, evidenceObservationIds: ["o1"] },
      ],
      insights: [], themes: [], opportunities: [],
      formulas: { mediaShare: "mentions", sentiment: "weighted", bubbleSize: "mentions", heatmap: "co-mentions" },
    },
    [{ observationId: "o1", domain: "example.com" }],
  );
  assert.deepEqual(view.rows[0]?.brandNames, ["Acme", "Beta"]);
  assert.deepEqual(view.rows[0]?.sourceDomains, ["example.com"]);
  assert.equal(view.topics[0]?.observedAnswers, 1);
  assert.equal(view.brands[0]?.evidenceCount, 1);
  assert.equal(view.sources[0]?.promptCount, 1);
});

test("코드 펜스가 있는 생성 결과도 제한된 의도 값으로 검증한다", () => {
  const parsed = parseGeneratedPromptIdeas('```json\n{"ideas":[{"topic":"인수 합병","prompt":"인수 합병 절차는 어떻게 되나요?","intent":"informational","relevance":"high"}]}\n```');
  assert.equal(parsed.ideas[0]?.intent, "informational");
});
