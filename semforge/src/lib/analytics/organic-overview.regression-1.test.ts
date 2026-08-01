import assert from "node:assert/strict";
import test from "node:test";
import { buildOrganicOverviewExtras } from "@/lib/analytics/organic-overview";
import type { AnalyticsRawDataset } from "@/lib/analytics/types";

// Regression: ISSUE-001 — analysis target appeared in organic competitors
// Found by /qa on 2026-08-01
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-01.md
test("자연검색 경쟁자 목록은 분석 대상 도메인을 제외한다", () => {
  const dataset: AnalyticsRawDataset = {
    keywords: [
      {
        id: "keyword-1",
        keyword: "검색 최적화",
        normalizedKeyword: "검색 최적화",
        countryCode: "KR",
        device: "desktop",
        periodStart: "2026-08-01T00:00:00Z",
        volume: 1_000,
        cpcCents: 0,
        currencyCode: "KRW",
        intent: "informational",
        source: "regression-test",
        updatedAt: "2026-08-01T00:00:00Z",
      },
    ],
    serp: [
      {
        id: "serp-target",
        keywordMetricId: "keyword-1",
        searchEngine: "google",
        domain: "www.example.com",
        url: "https://www.example.com/seo",
        position: 1,
        isAd: false,
        serpFeatures: "[]",
        source: "regression-test",
        capturedAt: "2026-08-01T00:00:00Z",
      },
      {
        id: "serp-competitor",
        keywordMetricId: "keyword-1",
        searchEngine: "google",
        domain: "competitor.example",
        url: "https://competitor.example/seo",
        position: 2,
        isAd: false,
        serpFeatures: "[]",
        source: "regression-test",
        capturedAt: "2026-08-01T00:00:00Z",
      },
    ],
    clickstream: [],
    links: [],
  };

  const result = buildOrganicOverviewExtras(dataset, {
    domain: "www.example.com",
    countryCode: "KR",
    device: "desktop",
  });

  assert.deepEqual(result.competitors.map((row) => row.domain), ["competitor.example"]);
  assert.ok(result.bubbles.some((row) => row.domain === "example.com"));
});
