import assert from "node:assert/strict";
import test from "node:test";
import type { AiVisibilityProvider, AiVisibilityStatus } from "@/db/schema";
import {
  buildCitationRows,
  buildTopicRows,
  computeAiVisibilityMetric,
  latestObservationPairs,
  metricBreakdown,
  selectRunObservationSets,
  selectTopicOpportunities,
  type DashboardCitation,
  type DashboardObservation,
} from "./dashboard";

function observation(input: Partial<DashboardObservation> & { id: string }): DashboardObservation {
  return {
    id: input.id,
    runId: input.runId ?? null,
    promptId: input.promptId ?? "p1",
    prompt: input.prompt ?? "브랜드 추천",
    topic: input.topic ?? "브랜드",
    provider: input.provider ?? "google_aio",
    countryCode: input.countryCode ?? "KR",
    locationKey: input.locationKey ?? "KR-SEOUL",
    visibilityStatus: input.visibilityStatus ?? "not_visible",
    brandMentioned: input.brandMentioned ?? false,
    citationsAvailable: input.citationsAvailable ?? true,
    responseText: input.responseText ?? null,
    source: input.source ?? "test",
    fromCache: input.fromCache ?? false,
    capturedAt: input.capturedAt ?? new Date("2026-08-01T00:00:00Z"),
  };
}

function citation(input: Partial<DashboardCitation> & { id: string; observationId: string; url: string }): DashboardCitation {
  return {
    id: input.id,
    observationId: input.observationId,
    position: input.position ?? 1,
    url: input.url,
    domain: input.domain ?? new URL(input.url).hostname,
    title: input.title ?? null,
    isOwnDomain: input.isOwnDomain ?? false,
  };
}

test("가시성은 unknown을 제외하고 브랜드 언급 또는 자사 인용이 있는 셀 비율이다", () => {
  const rows = [
    observation({ id: "visible-brand", brandMentioned: true, visibilityStatus: "visible" }),
    observation({ id: "visible-citation", promptId: "p2", visibilityStatus: "visible" }),
    observation({ id: "not-visible", promptId: "p3", visibilityStatus: "not_visible" }),
    observation({ id: "unknown", promptId: "p4", visibilityStatus: "unknown", brandMentioned: null }),
  ];
  const citations = [citation({ id: "c1", observationId: "visible-citation", url: "https://example.com/a", isOwnDomain: true })];
  const metric = computeAiVisibilityMetric(rows, citations);
  assert.equal(metric.visibility, 66.7);
  assert.equal(metric.measured, 3);
  assert.equal(metric.unknown, 1);
  assert.equal(metric.mentions, 1);
});

test("인용은 URL 행 수, 인용된 페이지는 자사 URL 고유 개수로 계산한다", () => {
  const rows = [observation({ id: "a" }), observation({ id: "b", promptId: "p2" })];
  const citations = [
    citation({ id: "c1", observationId: "a", url: "https://example.com/guide", isOwnDomain: true }),
    citation({ id: "c2", observationId: "b", url: "https://example.com/guide", isOwnDomain: true }),
    citation({ id: "c3", observationId: "b", url: "https://example.com/about", isOwnDomain: true }),
    citation({ id: "c4", observationId: "b", url: "https://outside.test/post", isOwnDomain: false }),
  ];
  const metric = computeAiVisibilityMetric(rows, citations);
  assert.equal(metric.citations, 3);
  assert.equal(metric.citedPages, 2);
});

test("직전 대비는 동일 프롬프트·플랫폼·위치 셀의 두 최신 관측을 고른다", () => {
  const rows = [
    observation({ id: "new", capturedAt: new Date("2026-08-01"), brandMentioned: true, visibilityStatus: "visible" }),
    observation({ id: "old", capturedAt: new Date("2026-07-25"), visibilityStatus: "not_visible" }),
    observation({ id: "other", promptId: "p2", provider: "chatgpt_web", capturedAt: new Date("2026-07-30") }),
  ];
  const pairs = latestObservationPairs(rows);
  assert.deepEqual(pairs.latest.map((row) => row.id).sort(), ["new", "other"]);
  assert.deepEqual(pairs.previous.map((row) => row.id), ["old"]);
});

test("최신·직전 집계는 셀 시각이 아니라 완료 실행 단위로 분리한다", () => {
  const rows = [
    observation({ id: "latest-a", runId: "run-new", promptId: "p1", capturedAt: new Date("2026-08-02T01:00:00Z") }),
    observation({ id: "latest-b", runId: "run-new", promptId: "p2", capturedAt: new Date("2026-08-02T01:01:00Z") }),
    observation({ id: "previous-a", runId: "run-old", promptId: "p1", capturedAt: new Date("2026-08-01T01:05:00Z") }),
    observation({ id: "legacy-newer", runId: null, promptId: "p3", capturedAt: new Date("2026-08-03T01:00:00Z") }),
  ];
  const selected = selectRunObservationSets(rows, [
    { id: "run-old", createdAt: new Date("2026-08-01T00:00:00Z"), completedAt: new Date("2026-08-01T01:10:00Z") },
    { id: "run-new", createdAt: new Date("2026-08-02T00:00:00Z"), completedAt: new Date("2026-08-02T01:10:00Z") },
  ]);
  assert.deepEqual(selected.latest.map((row) => row.id).sort(), ["latest-a", "latest-b"]);
  assert.deepEqual(selected.previous.map((row) => row.id), ["previous-a"]);
  assert.equal(selected.legacy, false);
});

test("부분 완료 실행도 최신 스냅샷으로 선택해 과거 성공 셀을 섞지 않는다", () => {
  const rows = [
    observation({ id: "partial-only", runId: "run-partial", promptId: "p1" }),
    observation({ id: "old-extra", runId: "run-complete", promptId: "p2" }),
  ];
  const selected = selectRunObservationSets(rows, [
    { id: "run-partial", createdAt: new Date("2026-08-02"), completedAt: new Date("2026-08-02T01:00:00Z") },
    { id: "run-complete", createdAt: new Date("2026-08-01"), completedAt: new Date("2026-08-01T01:00:00Z") },
  ]);
  assert.deepEqual(selected.latest.map((row) => row.id), ["partial-only"]);
  assert.deepEqual(selected.previous.map((row) => row.id), ["old-extra"]);
});

test("플랫폼·국가 분포는 같은 공식을 그룹별로 적용한다", () => {
  const rows = [
    observation({ id: "g-kr", visibilityStatus: "visible", brandMentioned: true }),
    observation({ id: "g-us", promptId: "p2", countryCode: "US", locationKey: "US-NEW-YORK" }),
    observation({ id: "c-kr", promptId: "p3", provider: "chatgpt_web", visibilityStatus: "visible", brandMentioned: true }),
  ];
  const byProvider = metricBreakdown(rows, [], (row) => row.provider, (key) => key);
  const google = byProvider.find((row) => row.key === "google_aio");
  const chatgpt = byProvider.find((row) => row.key === "chatgpt_web");
  assert.equal(google?.visibility, 50);
  assert.equal(chatgpt?.visibility, 100);
  assert.equal(google?.share, 50);
  assert.equal(chatgpt?.share, 50);
  const byCountry = metricBreakdown(rows, [], (row) => row.countryCode, (key) => key);
  assert.equal(byCountry.find((row) => row.key === "KR")?.visibility, 100);
  assert.equal(byCountry.find((row) => row.key === "US")?.visibility, 0);
});

test("주제 기회와 반복 외부 소스 기회는 최신 실측에서만 도출된다", () => {
  const rows = [
    observation({ id: "strong", topic: "강한 주제", brandMentioned: true, visibilityStatus: "visible" }),
    observation({ id: "weak", promptId: "p2", topic: "약한 주제", visibilityStatus: "not_visible" }),
  ];
  const citations = [
    citation({ id: "ext", observationId: "weak", url: "https://authority.test/article", domain: "authority.test" }),
  ];
  const topicRows = buildTopicRows(rows, citations, new Map());
  const opportunities = selectTopicOpportunities(topicRows, 50);
  assert.deepEqual(opportunities.map((row) => row.label), ["약한 주제"]);
  const sources = buildCitationRows(rows, citations, false, true);
  assert.equal(sources[0]?.label, "authority.test");
  assert.equal(sources[0]?.citations, 1);
});

test("형식 유니온은 공급자와 측정 상태를 고정한다", () => {
  const provider: AiVisibilityProvider = "gemini_grounded";
  const status: AiVisibilityStatus = "unknown";
  assert.equal(provider, "gemini_grounded");
  assert.equal(status, "unknown");
});
