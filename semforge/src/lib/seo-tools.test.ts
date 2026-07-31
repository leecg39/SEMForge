import assert from "node:assert/strict";
import test from "node:test";
import type { AnalyticsRawDataset, DomainAnalyticsReport } from "./analytics/types";
import { buildKeywordGap, buildSerpVolatility, buildTopPages } from "./seo-tools";

function report(domain: string, keywords: DomainAnalyticsReport["topKeywords"]): DomainAnalyticsReport {
  return {
    query: { domain, countryCode: "US", device: "desktop" },
    availableDomains: [domain],
    metrics: {
      authorityScore: null,
      organicTrafficEstimate: null,
      visitsEstimate: null,
      uniqueVisitorsEstimate: null,
      organicKeywords: keywords.length,
      backlinks: null,
      referringDomains: null,
      pagesPerVisit: null,
      bounceRate: null,
      followShare: null,
    },
    trend: [],
    topKeywords: keywords,
    intentDistribution: [],
    serpFeatures: [],
    positionDistribution: [],
    brandedSplit: null,
    refDomainsByAuthority: [],
    topLinkedPages: [],
    channels: [],
    sources: [],
    freshness: {
      keywordMetricsThrough: null,
      serpCapturedAt: null,
      clickstreamThrough: null,
      linksThrough: null,
    },
    models: {
      organicTraffic: "clone-organic-traffic-v1",
      clickstream: "clone-clickstream-v1",
      authority: "clone-authority-v1",
      keywordDifficulty: "clone-kd-v1",
    },
  };
}

const keyword = (
  value: string,
  position: number,
  url: string,
): DomainAnalyticsReport["topKeywords"][number] => ({
  keyword: value,
  intent: null,
  position,
  volume: null,
  difficulty: null,
  trafficContribution: null,
  url,
  cpcCents: null,
});

test("상위 페이지는 실제 랭킹 URL별 키워드 수와 최고 순위를 집계한다", () => {
  const rows = buildTopPages(
    report("example.com", [
      keyword("alpha", 8, "https://example.com/a"),
      keyword("beta", 3, "https://example.com/a"),
      keyword("gamma", 2, "https://example.com/b"),
    ]),
  );
  assert.deepEqual(rows, [
    { url: "https://example.com/a", keywords: 2, bestPosition: 3, trafficEstimate: null },
    { url: "https://example.com/b", keywords: 1, bestPosition: 2, trafficEstimate: null },
  ]);
});

test("키워드 갭은 누락·약함·공유·고유를 실제 두 리포트의 순위로 분류한다", () => {
  const rows = buildKeywordGap(
    report("ours.com", [keyword("shared", 2, "https://ours.com/s"), keyword("weak", 9, "https://ours.com/w"), keyword("unique", 1, "https://ours.com/u")]),
    report("rival.com", [keyword("shared", 5, "https://rival.com/s"), keyword("weak", 3, "https://rival.com/w"), keyword("missing", 4, "https://rival.com/m")]),
  );
  assert.deepEqual(rows.map((row) => [row.keyword, row.gap]), [
    ["missing", "missing"],
    ["weak", "weak"],
    ["shared", "shared"],
    ["unique", "unique"],
  ]);
});

test("SERP 변동성은 최근 두 스냅샷에 모두 존재하는 URL의 실제 순위 이동만 계산한다", () => {
  const dataset: AnalyticsRawDataset = {
    keywords: [
      {
        id: "kw_1",
        keyword: "observed keyword",
        normalizedKeyword: "observed keyword",
        countryCode: "US",
        device: "desktop",
        periodStart: "2026-07-01T00:00:00.000Z",
        volume: 0,
        cpcCents: 0,
        currencyCode: "USD",
        intent: "informational",
        source: "talordata-serp",
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
    ],
    serp: [
      { id: "s1", keywordMetricId: "kw_1", searchEngine: "google", domain: "a.com", url: "https://a.com/", position: 2, isAd: false, serpFeatures: "[]", source: "talordata", capturedAt: "2026-07-01T00:00:00.000Z" },
      { id: "s2", keywordMetricId: "kw_1", searchEngine: "google", domain: "b.com", url: "https://b.com/", position: 6, isAd: false, serpFeatures: "[]", source: "talordata", capturedAt: "2026-07-01T00:00:00.000Z" },
      { id: "s3", keywordMetricId: "kw_1", searchEngine: "google", domain: "a.com", url: "https://a.com/", position: 5, isAd: false, serpFeatures: "[]", source: "talordata", capturedAt: "2026-07-02T00:00:00.000Z" },
      { id: "s4", keywordMetricId: "kw_1", searchEngine: "google", domain: "c.com", url: "https://c.com/", position: 1, isAd: false, serpFeatures: "[]", source: "talordata", capturedAt: "2026-07-02T00:00:00.000Z" },
    ],
    clickstream: [],
    links: [],
  };
  assert.deepEqual(buildSerpVolatility(dataset, "google"), [
    {
      keyword: "observed keyword",
      previousCapturedAt: "2026-07-01T00:00:00.000Z",
      latestCapturedAt: "2026-07-02T00:00:00.000Z",
      comparedUrls: 1,
      movedUrls: 1,
      averagePositionMovement: 3,
    },
  ]);
});
