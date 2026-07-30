import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDomainAnalytics,
  calculateAuthorityScore,
  calculateKeywordDifficulty,
  calculateLinkProfile,
  ctrForPosition,
  estimateOrganicTraffic,
  normalizeDomain,
  rollingAverageVolume,
  summarizeWeightedClickstream,
} from "@/lib/analytics/metrics";
import type {
  AnalyticsRawDataset,
  RawClickstreamEvent,
  RawKeywordMetric,
  RawLinkGraphEdge,
  RawSerpSnapshot,
} from "@/lib/analytics/types";

type Group = "correctness" | "data_semantics" | "api_and_privacy" | "frontend_accessibility";

interface Result {
  group: Group;
  name: string;
  passed: boolean;
  detail: string;
}

const results: Result[] = [];

function check(group: Group, name: string, verify: () => void) {
  try {
    verify();
    results.push({ group, name, passed: true, detail: "pass" });
  } catch (error) {
    results.push({
      group,
      name,
      passed: false,
      detail: error instanceof Error ? error.message.replaceAll("\n", " ") : String(error),
    });
  }
}

function keyword(overrides: Partial<RawKeywordMetric> = {}): RawKeywordMetric {
  return {
    id: "kw-1",
    keyword: "analytics platform",
    normalizedKeyword: "analytics platform",
    countryCode: "US",
    device: "desktop",
    periodStart: "2026-07-01T00:00:00.000Z",
    volume: 1_000,
    cpcCents: 500,
    currencyCode: "USD",
    intent: "commercial",
    source: "fixture",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function serp(overrides: Partial<RawSerpSnapshot> = {}): RawSerpSnapshot {
  return {
    id: "serp-1",
    keywordMetricId: "kw-1",
    searchEngine: "google",
    domain: "target.example.com",
    url: "https://target.example.com/analytics",
    position: 3,
    isAd: false,
    serpFeatures: "[]",
    source: "fixture",
    capturedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function click(overrides: Partial<RawClickstreamEvent> = {}): RawClickstreamEvent {
  return {
    id: "click-1",
    anonymousUserHash: "sha256:user-1",
    sessionHash: "sha256:session-1",
    domain: "target.example.com",
    path: "/",
    countryCode: "US",
    device: "desktop",
    channel: "organic",
    populationWeight: 100,
    source: "fixture",
    occurredAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function link(overrides: Partial<RawLinkGraphEdge> = {}): RawLinkGraphEdge {
  return {
    id: "link-1",
    sourceDomain: "publisher.example",
    targetDomain: "target.example.com",
    sourceUrl: "https://publisher.example/a",
    targetUrl: "https://target.example.com/",
    sourceNetwork: "network:1",
    isFollow: true,
    sourceAuthority: 70,
    source: "fixture",
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

function dataset(overrides: Partial<AnalyticsRawDataset> = {}): AnalyticsRawDataset {
  return {
    keywords: [keyword()],
    serp: [serp()],
    clickstream: [click()],
    links: [link()],
    ...overrides,
  };
}

const query = { domain: "target.example.com", countryCode: "US", device: "desktop" as const };
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

check("correctness", "도메인 정규화가 URL 구성요소를 제거하고 잘못된 입력을 거부한다", () => {
  assert.equal(normalizeDomain(" HTTPS://WWW.Target.Example.com/path?q=1 "), "target.example.com");
  assert.equal(normalizeDomain("not a domain"), "");
});

check("correctness", "12개월 평균은 월별 최신 행과 가장 최근 12개월만 사용한다", () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    periodStart: new Date(Date.UTC(2025, index, 1)).toISOString(),
    volume: (index + 1) * 100,
  }));
  rows.push({ periodStart: "2026-01-20T00:00:00.000Z", volume: 1_400 });
  assert.deepEqual(rollingAverageVolume(rows), { value: 758, monthsUsed: 12 });
});

check("correctness", "잘못된 날짜와 비유한 검색량은 평균에서 제외된다", () => {
  assert.deepEqual(
    rollingAverageVolume([
      { periodStart: "invalid-date", volume: 9_999 },
      { periodStart: "2026-07-01T00:00:00.000Z", volume: 100 },
      { periodStart: "2026-06-01T00:00:00.000Z", volume: Number.NaN },
    ]),
    { value: 100, monthsUsed: 1 },
  );
});

check("correctness", "Organic Traffic은 지원 순위의 검색량×CTR 합과 정확히 같다", () => {
  assert.equal(
    estimateOrganicTraffic([
      { position: 1, volume: 1_000 },
      { position: 2, volume: 2_000 },
      { position: 11, volume: 99_000 },
    ]),
    Math.round(1_000 * ctrForPosition(1) + 2_000 * ctrForPosition(2)),
  );
});

check("correctness", "클릭스트림은 세션을 중복 집계하지 않고 사용자 가중치를 보수적으로 합친다", () => {
  assert.deepEqual(
    summarizeWeightedClickstream([
      click({ id: "c1", sessionHash: "s1", anonymousUserHash: "u1", populationWeight: 100 }),
      click({ id: "c2", sessionHash: "s1", anonymousUserHash: "u1", populationWeight: 100 }),
      click({ id: "c3", sessionHash: "s2", anonymousUserHash: "u1", populationWeight: 120 }),
    ]),
    { visitsEstimate: 220, uniqueVisitorsEstimate: 120, pagesPerVisit: 1.45, bounceRate: 54.5 },
  );
});

check("correctness", "비유한·음수 패널 가중치는 집계를 오염시키지 않는다", () => {
  const summary = summarizeWeightedClickstream([
    click({ id: "c1", sessionHash: "bad-1", populationWeight: Number.NaN }),
    click({ id: "c2", sessionHash: "bad-2", populationWeight: Number.POSITIVE_INFINITY }),
    click({ id: "c3", sessionHash: "bad-3", populationWeight: -10 }),
  ]);
  assert.deepEqual(summary, {
    visitsEstimate: 0,
    uniqueVisitorsEstimate: 0,
    pagesPerVisit: 0,
    bounceRate: 0,
  });
});

check("correctness", "링크 프로필은 참조 도메인을 중복 제거하고 모든 점수를 범위 안에 둔다", () => {
  const profile = calculateLinkProfile([
    link({ id: "l1", sourceUrl: "https://publisher.example/a", sourceAuthority: 120 }),
    link({ id: "l2", sourceUrl: "https://publisher.example/b", sourceAuthority: -20, isFollow: false }),
  ]);
  assert.equal(profile.backlinks, 2);
  assert.equal(profile.referringDomains, 1);
  for (const value of [profile.followShare, profile.averageSourceAuthority, profile.linkPower, profile.spamScore]) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 100);
  }
});

check("correctness", "Authority Score는 강한 신호에서 단조 증가하며 0~100이다", () => {
  const weak = calculateAuthorityScore({ linkPower: 10, organicTrafficEstimate: 100, spamScore: 80 });
  const strong = calculateAuthorityScore({ linkPower: 90, organicTrafficEstimate: 500_000, spamScore: 5 });
  assert.ok(strong > weak);
  assert.ok(weak >= 0 && strong <= 100);
});

check("correctness", "KD는 상위 10개 결과만 사용하고 0~100 범위를 유지한다", () => {
  const base = calculateKeywordDifficulty({
    top10AuthorityScores: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    volume: 10_000,
    medianReferringDomains: 100,
    followShare: 70,
    serpFeatureCount: 2,
    isBranded: false,
  });
  const withEleventh = calculateKeywordDifficulty({
    top10AuthorityScores: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 0],
    volume: 10_000,
    medianReferringDomains: 100,
    followShare: 70,
    serpFeatureCount: 2,
    isBranded: false,
  });
  assert.equal(withEleventh, base);
  assert.ok(base >= 0 && base <= 100);
});

check("data_semantics", "SERP 데이터만 있는 도메인도 오가닉 리포트를 만든다", () => {
  const report = buildDomainAnalytics(dataset({ clickstream: [], links: [] }), query);
  assert.ok(report);
  assert.ok(report.metrics.organicTrafficEstimate.value > 0);
  assert.equal(report.metrics.visitsEstimate.value, 0);
});

check("data_semantics", "링크 데이터만 있는 도메인도 백링크 리포트를 만든다", () => {
  const report = buildDomainAnalytics(dataset({ keywords: [], serp: [], clickstream: [] }), query);
  assert.ok(report);
  assert.equal(report.metrics.backlinks, 1);
});

check("data_semantics", "분석 가능 도메인은 세 원천의 합집합이다", () => {
  const report = buildDomainAnalytics(
    dataset({
      serp: [serp({ domain: "serp-only.example.com", url: "https://serp-only.example.com/" })],
      clickstream: [click({ domain: "target.example.com" })],
      links: [link({ targetDomain: "link-only.example.com", targetUrl: "https://link-only.example.com/" })],
    }),
    query,
  );
  assert.ok(report);
  assert.deepEqual(report.availableDomains, [
    "link-only.example.com",
    "serp-only.example.com",
    "target.example.com",
  ]);
});

check("data_semantics", "같은 키워드의 최신 SERP 캡처만 현재 순위에 사용한다", () => {
  const report = buildDomainAnalytics(
    dataset({
      serp: [
        serp({ id: "old-target", position: 1, capturedAt: "2026-07-01T00:00:00.000Z" }),
        serp({ id: "old-other", domain: "other.example", url: "https://other.example/", position: 2, capturedAt: "2026-07-01T00:00:00.000Z" }),
        serp({ id: "new-other", domain: "other.example", url: "https://other.example/", position: 1, capturedAt: "2026-07-10T00:00:00.000Z" }),
        serp({ id: "new-target", position: 10, capturedAt: "2026-07-10T00:00:00.000Z" }),
      ],
    }),
    query,
  );
  assert.ok(report);
  assert.equal(report.topKeywords[0]?.position, 10);
  assert.equal(report.topKeywords[0]?.trafficContribution, Math.round(1_000 * ctrForPosition(10)));
});

check("data_semantics", "트렌드는 시간순 최근 12개 구간만 반환한다", () => {
  const keywords = Array.from({ length: 13 }, (_, index) =>
    keyword({
      id: `kw-${index}`,
      periodStart: new Date(Date.UTC(2025, index, 1)).toISOString(),
      updatedAt: new Date(Date.UTC(2025, index, 2)).toISOString(),
    }),
  );
  const serpRows = keywords.map((row, index) =>
    serp({ id: `serp-${index}`, keywordMetricId: row.id, capturedAt: row.periodStart }),
  );
  const report = buildDomainAnalytics(dataset({ keywords, serp: serpRows }), query);
  assert.ok(report);
  assert.equal(report.trend.length, 12);
  assert.deepEqual(report.trend.map((row) => row.period), report.trend.map((row) => row.period).toSorted());
});

check("api_and_privacy", "파생 리포트 JSON에는 원시 패널·네트워크 식별자가 없다", () => {
  const report = buildDomainAnalytics(dataset(), query);
  assert.ok(report);
  assert.doesNotMatch(JSON.stringify(report), /anonymousUserHash|sessionHash|sourceNetwork|\"path\"/);
});

check("api_and_privacy", "API는 국가 코드를 알파벳 2자로 제한한다", () => {
  const api = source("src/app/api/analytics/domain-overview/route.ts");
  assert.match(api, /country:[\s\S]*?regex\(\/\^\[A-Z\]\{2\}\$\//);
});

check("api_and_privacy", "SERP 저장소 조회는 선택된 키워드 ID로 제한된다", () => {
  const server = source("src/server/analytics.ts");
  assert.match(server, /inArray\(serpSnapshots\.keywordMetricId/);
});

check("api_and_privacy", "링크 저장소 조회는 보고서 관련 target domain으로 제한된다", () => {
  const server = source("src/server/analytics.ts");
  assert.match(server, /inArray\(linkGraphEdges\.targetDomain/);
});

check("frontend_accessibility", "탭은 roving tabindex와 방향키 키보드 이동을 제공한다", () => {
  const ui = source("src/components/analytics/DomainIntelligenceDashboard.tsx");
  assert.match(ui, /onKeyDown=\{handleTabKeyDown\}/);
  assert.match(ui, /tabIndex=\{activeTab === key \? 0 : -1\}/);
});

check("frontend_accessibility", "비동기 결과 영역은 로딩 상태를 접근성 트리에 노출한다", () => {
  const ui = source("src/components/analytics/DomainIntelligenceDashboard.tsx");
  assert.match(ui, /aria-busy=\{status === "loading"\}/);
});

const passed = results.filter((result) => result.passed).length;
const score = (passed / results.length) * 100;

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"}\t${result.group}\t${result.name}${result.passed ? "" : `\t${result.detail}`}`);
}
console.log(`SUMMARY\t${passed}/${results.length}`);
console.log(`AUTORESEARCH_SCORE=${score.toFixed(2)}`);
