import assert from "node:assert/strict";
import test from "node:test";
import {
  brandPerformanceInputHash,
  buildBrandPerformanceReport,
  normalizeBrandName,
  parseBrandPerformanceModelJson,
  type BrandPerformanceTrackedBrandView,
} from "./brand-performance";

const capturedAt = new Date("2026-08-03T00:00:00Z");
const observations = [
  {
    id: "o1",
    runId: "r1",
    prompt: "컨설팅 회사 추천",
    topic: "추천",
    provider: "chatgpt_web" as const,
    countryCode: "KR",
    locationKey: "KR-SEOUL",
    responseText: "Acme is a strong strategy partner. Beta is fast.",
    capturedAt,
  },
  {
    id: "o2",
    runId: "r1",
    prompt: "저렴한 컨설팅 회사",
    topic: "가격",
    provider: "chatgpt_web" as const,
    countryCode: "KR",
    locationKey: "KR-SEOUL",
    responseText: "Beta is cheaper but has limited enterprise proof.",
    capturedAt,
  },
  {
    id: "o3",
    runId: "r1",
    prompt: "신뢰할 컨설팅 회사",
    topic: "신뢰",
    provider: "chatgpt_web" as const,
    countryCode: "KR",
    locationKey: "KR-SEOUL",
    responseText: "ACME is dependable for complex transformations.",
    capturedAt,
  },
];

const tracked: BrandPerformanceTrackedBrandView[] = [
  { id: "own", name: "Acme", aliases: ["ACME"], domain: "acme.test", kind: "own", source: "project", enabled: true },
  { id: "beta", name: "Beta", aliases: [], domain: "beta.test", kind: "competitor", source: "detected", enabled: true },
  { id: "gamma", name: "Gamma", aliases: [], domain: null, kind: "competitor", source: "manual", enabled: true },
  { id: "duplicate-own", name: "Acme Inc", aliases: ["ACME"], domain: null, kind: "competitor", source: "detected", enabled: true },
];

const analysis = {
  analyzedObservationIds: ["o1", "o2", "o3", "outside"],
  brands: [
    {
      name: "Acme",
      aliases: ["ACME"],
      isOwn: true,
      mentions: [
        { observationId: "o1", sentiment: "positive" as const, themes: ["Growth partner", "Strategy"] },
        { observationId: "o3", sentiment: "neutral" as const, themes: ["Trust"] },
      ],
    },
    {
      name: "Beta",
      aliases: [],
      isOwn: false,
      mentions: [
        { observationId: "o1", sentiment: "neutral" as const, themes: ["Speed"] },
        { observationId: "o2", sentiment: "negative" as const, themes: ["Proof gap"] },
      ],
    },
    {
      name: "Invented",
      aliases: [],
      isOwn: false,
      mentions: [{ observationId: "o2", sentiment: "positive" as const, themes: ["Made up"] }],
    },
  ],
  insights: [
    { title: "Acme owns trust", body: "The answers connect Acme to trust.", evidenceObservationIds: ["o3"] },
    { title: "Invalid", body: "No real evidence.", evidenceObservationIds: ["outside"] },
  ],
  opportunities: [{
    title: "Publish proof",
    summary: "Use quantified enterprise proof.",
    recommendations: ["Publish a case study"],
    urgency: "urgent" as const,
    evidenceObservationIds: ["o2"],
  }],
};

test("브랜드 이름 정규화는 대소문자·공백·기호를 제거한다", () => {
  assert.equal(normalizeBrandName(" ACME Korea™ "), "acmekorea");
});

test("매체점유율·감정·내러티브는 검증된 실제 응답 신호로만 계산한다", () => {
  const built = buildBrandPerformanceReport(
    { brandName: "Acme", brandAliases: '["ACME"]' },
    observations,
    tracked,
    analysis,
  );
  const own = built.report.brands.find((brand) => brand.id === "own");
  const beta = built.report.brands.find((brand) => brand.id === "beta");
  const gamma = built.report.brands.find((brand) => brand.id === "gamma");
  assert.equal(own?.mentionedAnswers, 2);
  assert.equal(own?.mediaShare, 50);
  assert.equal(own?.sentimentScore, 75);
  assert.equal(beta?.mediaShare, 50);
  assert.equal(beta?.sentimentScore, 25);
  assert.equal(gamma?.mediaShare, null);
  assert.equal(gamma?.sentimentScore, null);
  assert.equal(built.report.brands.some((brand) => brand.name === "Invented"), false);
  assert.equal(built.report.brands.some((brand) => brand.id === "duplicate-own"), false);
  assert.deepEqual(built.report.insights.map((row) => row.title), ["Acme owns trust"]);
  assert.equal(built.report.themes.find((theme) => theme.label === "Trust")?.counts.own, 1);
  assert.equal(built.analyzedCount, 3);
});

test("분석 입력 해시는 순서와 무관하고 응답 본문 변경을 감지한다", () => {
  const first = brandPerformanceInputHash(observations);
  const reordered = brandPerformanceInputHash([...observations].reverse());
  const changed = brandPerformanceInputHash([
    ...observations.slice(0, 2),
    { ...observations[2], responseText: `${observations[2].responseText} Updated.` },
  ]);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("분석 JSON은 설명문이나 코드 펜스가 함께 있어도 검증된 객체만 추출한다", () => {
  const parsed = parseBrandPerformanceModelJson(`분석 결과입니다.\n\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``);
  assert.deepEqual(parsed.analyzedObservationIds, analysis.analyzedObservationIds);
  assert.equal(parsed.brands[0]?.name, "Acme");
});

test("잘못된 하위 분석 항목만 폐기하고 유효한 실제 근거는 최종 스키마로 보존한다", () => {
  const parsed = parseBrandPerformanceModelJson(JSON.stringify({
    analyzedObservationIds: ["o1", 2],
    brands: [
      { name: "Beta", mentions: [{ observationId: "o1", sentiment: "neutral", themes: ["가격", 3] }] },
      { name: "X", mentions: [{ observationId: "o1", sentiment: "unknown", themes: [] }] },
    ],
    insights: [{ title: "근거 있음", body: "실제 응답 근거입니다.", evidenceObservationIds: ["o1"] }, { title: "x" }],
    opportunities: [{ title: "비교 근거 강화", summary: "경쟁 비교 근거를 보강합니다.", recommendations: ["검증 사례를 공개합니다."], urgency: "high", evidenceObservationIds: ["o1"] }],
  }));

  assert.deepEqual(parsed.analyzedObservationIds, ["o1"]);
  assert.equal(parsed.brands.length, 1);
  assert.deepEqual(parsed.brands[0]?.aliases, []);
  assert.deepEqual(parsed.brands[0]?.mentions[0]?.themes, ["가격"]);
  assert.equal(parsed.insights.length, 1);
  assert.equal(parsed.opportunities[0]?.urgency, "urgent");
});
