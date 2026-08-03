import assert from "node:assert/strict";
import test from "node:test";
import type { KeywordHighlights } from "@/server/position-tracking/highlights";
import type { CampaignOverview } from "@/server/position-tracking/overview";
import { buildPositionTrackingWidgetSummary } from "./widget";

test("SEO 위젯은 포지션 추적 overview와 highlights 값을 그대로 반영한다", () => {
  const overview: CampaignOverview = {
    campaignId: "c1",
    domain: "example.com",
    visibility: {
      current: 55,
      diff: 15,
      series: [
        { capturedAt: "2026-08-01T00:00:00.000Z", visibility: 40 },
        { capturedAt: "2026-08-02T00:00:00.000Z", visibility: 55 },
      ],
    },
    avgPosition: { current: 4.5, diff: -2, rankedCount: 2 },
    estimatedTraffic: {
      current: 10,
      diff: 2,
      coveredKeywords: 2,
      totalKeywords: 3,
      model: "clone-traffic-v1",
    },
    topBuckets: [
      { key: "top3", threshold: 3, count: 1, entered: 1, left: 0 },
      { key: "top10", threshold: 10, count: 2, entered: 1, left: 0 },
      { key: "top20", threshold: 20, count: 2, entered: 1, left: 0 },
      { key: "top100", threshold: 100, count: 2, entered: 1, left: 0 },
    ],
    rising: 1,
    falling: 1,
    newRanked: 1,
    dropped: 1,
    keywordCount: 3,
    latestCollection: null,
  };
  const highlights: KeywordHighlights = {
    campaignId: "c1",
    hasData: true,
    model: "clone-traffic-v1",
    top: [{
      keyword: "alpha",
      position: 2,
      previousPosition: 5,
      visibilityShare: 62.5,
      visibilityDelta: 22,
    }],
    gainers: [],
    losers: [],
  };

  const summary = buildPositionTrackingWidgetSummary(
    { id: "c1", location: "Seoul", device: "desktop", searchEngine: "google" },
    overview,
    highlights,
  );

  assert.equal(summary.visibility, 55);
  assert.equal(summary.visibilityDiff, 15);
  assert.equal(summary.avgPosition, 4.5);
  assert.equal(summary.lastCollectedAt, "2026-08-02T00:00:00.000Z");
  assert.equal(summary.topBuckets.find((row) => row.key === "top10")?.count, 2);
  assert.equal(summary.improvedCount, 2);
  assert.equal(summary.declinedCount, 2);
  assert.deepEqual(summary.keywords, [{
    keyword: "alpha",
    position: 2,
    previousPosition: 5,
    visibilityShare: 62.5,
  }]);
});
