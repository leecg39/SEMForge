import assert from "node:assert/strict";
import test from "node:test";
import type { BrandPerformanceReport } from "./brand-performance";
import { buildCompetitorResearch } from "./competitor-research";

const report: BrandPerformanceReport = {
  generatedAt: "2026-08-03T00:00:00.000Z",
  brands: [
    { id: "own", name: "Acme", kind: "own", color: "#111", mentionedAnswers: 2, mediaShare: 50, sentimentScore: 75, sentiment: { positive: 1, neutral: 1, negative: 0 }, evidenceObservationIds: ["o1", "o2"] },
    { id: "beta", name: "Beta", kind: "competitor", color: "#222", mentionedAnswers: 2, mediaShare: 50, sentimentScore: 50, sentiment: { positive: 0, neutral: 2, negative: 0 }, evidenceObservationIds: ["o2", "o3"] },
    { id: "gamma", name: "Gamma", kind: "competitor", color: "#333", mentionedAnswers: 0, mediaShare: null, sentimentScore: null, sentiment: { positive: 0, neutral: 0, negative: 0 }, evidenceObservationIds: [] },
  ],
  insights: [],
  themes: [
    { id: "strategy", label: "전략", counts: { own: 2, beta: 1 }, total: 3 },
    { id: "price", label: "가격", counts: { beta: 2 }, total: 2 },
  ],
  opportunities: [],
  formulas: { mediaShare: "mentions / mentions", sentiment: "weighted", bubbleSize: "mentions", heatmap: "co-mentions" },
};

const observations = [
  { id: "o1", prompt: "one", topic: "A", responseText: "Acme only", capturedAt: new Date("2026-08-03T00:00:00Z") },
  { id: "o2", prompt: "two", topic: "A", responseText: "Acme and Beta", capturedAt: new Date("2026-08-03T00:01:00Z") },
  { id: "o3", prompt: "three", topic: "B", responseText: "Beta only", capturedAt: new Date("2026-08-03T00:02:00Z") },
];

test("실제 근거 ID 교집합으로 공유·공백 프롬프트를 계산한다", () => {
  const result = buildCompetitorResearch(report, observations, [
    { id: "own", name: "Acme", aliases: [], domain: "acme.test", kind: "own", source: "project", enabled: true },
    { id: "beta", name: "Beta", aliases: ["Beta Inc"], domain: "beta.test", kind: "competitor", source: "manual", enabled: true },
    { id: "gamma", name: "Gamma", aliases: [], domain: null, kind: "competitor", source: "manual", enabled: true },
  ]);

  assert.equal(result.summary.observedCompetitors, 1);
  assert.equal(result.summary.sharedPromptCount, 1);
  assert.equal(result.summary.gapPromptCount, 1);
  assert.equal(result.competitors[0]?.sharedPromptCount, 1);
  assert.equal(result.competitors[0]?.gapPromptCount, 1);
  assert.deepEqual(result.competitors[0]?.leadingThemes.map((theme) => theme.label), ["가격", "전략"]);
  assert.equal(result.competitors[1]?.observed, false);
  assert.equal(result.prompts[2]?.ownMentioned, false);
  assert.deepEqual(result.prompts[2]?.competitorIds, ["beta"]);
});

test("리포트가 없으면 가짜 지표 없이 빈 조사 결과를 반환한다", () => {
  const result = buildCompetitorResearch(null, observations, []);
  assert.equal(result.ownBrand, null);
  assert.equal(result.competitors.length, 0);
  assert.equal(result.summary.ownShareOfVoice, null);
});
