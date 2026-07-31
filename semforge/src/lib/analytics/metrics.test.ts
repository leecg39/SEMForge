import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDomainAnalytics,
  calculateAuthorityScore,
  calculateKeywordDifficulty,
  ctrForPosition,
  domainMatchesTarget,
  estimateOrganicTraffic,
  normalizeDomain,
  rollingAverageVolume,
  summarizeWeightedClickstream,
} from "@/lib/analytics/metrics";

test("12개월 검색량 평균은 월별 최신값만 사용한다", () => {
  const result = rollingAverageVolume([
    { periodStart: "2026-01-01T00:00:00Z", volume: 100 },
    { periodStart: "2026-02-01T00:00:00Z", volume: 200 },
    { periodStart: "2026-03-01T00:00:00Z", volume: 300 },
  ]);
  assert.deepEqual(result, { value: 200, monthsUsed: 3 });
});

test("Organic Traffic은 검색량 × 순위별 CTR의 합이다", () => {
  const result = estimateOrganicTraffic([
    { position: 1, volume: 1_000 },
    { position: 2, volume: 2_000 },
    { position: 11, volume: 50_000 },
  ]);
  assert.equal(result, Math.round(1_000 * ctrForPosition(1) + 2_000 * ctrForPosition(2)));
  assert.equal(ctrForPosition(11), 0);
});

test("클릭스트림은 다중 페이지뷰를 방문으로 중복 집계하지 않는다", () => {
  const result = summarizeWeightedClickstream([
    { sessionHash: "s1", anonymousUserHash: "u1", populationWeight: 100 },
    { sessionHash: "s1", anonymousUserHash: "u1", populationWeight: 100 },
    { sessionHash: "s2", anonymousUserHash: "u1", populationWeight: 120 },
  ]);
  assert.equal(result.visitsEstimate, 220);
  assert.equal(result.uniqueVisitorsEstimate, 120);
  assert.equal(result.pagesPerVisit, 1.45);
  assert.equal(result.bounceRate, 54.5);
});

test("Authority Score와 KD는 0~100 범위이며 강한 입력에서 증가한다", () => {
  const weakAuthority = calculateAuthorityScore({
    linkPower: 12,
    organicTrafficEstimate: 200,
    spamScore: 65,
  });
  const strongAuthority = calculateAuthorityScore({
    linkPower: 82,
    organicTrafficEstimate: 120_000,
    spamScore: 5,
  });
  assert.ok(strongAuthority > weakAuthority);
  assert.ok(weakAuthority >= 0 && strongAuthority <= 100);

  const easy = calculateKeywordDifficulty({
    top10AuthorityScores: [10, 12, 15],
    volume: 100,
    medianReferringDomains: 4,
    followShare: 30,
    serpFeatureCount: 0,
    isBranded: false,
  });
  const hard = calculateKeywordDifficulty({
    top10AuthorityScores: [70, 80, 90],
    volume: 100_000,
    medianReferringDomains: 2_000,
    followShare: 95,
    serpFeatureCount: 3,
    isBranded: true,
  });
  assert.ok(hard > easy);
  assert.ok(easy >= 0 && hard <= 100);
});

test("도메인 입력을 안전한 hostname으로 정규화한다", () => {
  assert.equal(normalizeDomain("https://WWW.Northwind.Example.com/pricing?q=1"), "northwind.example.com");
  assert.equal(normalizeDomain("northwind.example.com/"), "northwind.example.com");
  assert.equal(normalizeDomain(""), "");
});

test("루트 도메인 분석은 해당 사이트의 서브도메인 순위를 포함한다", () => {
  assert.equal(domainMatchesTarget("blog.example.com", "example.com"), true);
  assert.equal(domainMatchesTarget("notexample.com", "example.com"), false);

  const dataset = {
    keywords: [
      {
        id: "kw_subdomain",
        keyword: "example guide",
        normalizedKeyword: "example guide",
        countryCode: "US",
        device: "desktop" as const,
        periodStart: "2026-07-01T00:00:00Z",
        volume: 0,
        cpcCents: 0,
        currencyCode: "USD",
        intent: "informational" as const,
        source: "talordata-serp",
        updatedAt: "2026-07-30T00:00:00Z",
      },
    ],
    serp: [
      {
        id: "serp_subdomain",
        keywordMetricId: "kw_subdomain",
        searchEngine: "google" as const,
        domain: "blog.example.com",
        url: "https://blog.example.com/guide",
        position: 3,
        isAd: false,
        serpFeatures: "[]",
        source: "talordata",
        capturedAt: "2026-07-30T00:00:00Z",
      },
    ],
    clickstream: [],
    links: [],
  };

  const report = buildDomainAnalytics(dataset, {
    domain: "example.com",
    countryCode: "US",
    device: "desktop",
  });
  assert.ok(report);
  assert.equal(report.metrics.organicKeywords, 1);
  assert.equal(report.topKeywords[0]?.url, "https://blog.example.com/guide");
});

test("외부 분석 스냅샷이 있으면 SERP 미노출 도메인도 빈 실측 리포트를 만든다", () => {
  const dataset = { keywords: [], serp: [], clickstream: [], links: [] };
  const query = { domain: "example.com", countryCode: "US", device: "desktop" as const };
  assert.equal(buildDomainAnalytics(dataset, query), null);

  const report = buildDomainAnalytics(dataset, { ...query, allowEmptyDomain: true });
  assert.ok(report);
  assert.equal(report.query.domain, "example.com");
  assert.equal(report.metrics.organicKeywords, 0);
  assert.equal(report.metrics.authorityScore, null);
  assert.equal(report.metrics.organicTrafficEstimate, null);
  assert.equal(report.metrics.visitsEstimate, null);
  assert.equal(report.metrics.backlinks, null);
  assert.deepEqual(report.topKeywords, []);
});
