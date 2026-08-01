import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketPlayers,
  buildPageMovers,
  normalizeGscTarget,
  previousDateRange,
  resolveAccessibleCampaign,
  resolveAccessibleGscProperty,
  summarizeGscRows,
} from "@/lib/traffic-market";

test("GSC 합계는 노출 가중 평균 포지션과 실제 CTR을 계산한다", () => {
  const totals = summarizeGscRows([
    { keys: ["2026-07-01"], clicks: 10, impressions: 100, ctr: 0.1, position: 2 },
    { keys: ["2026-07-02"], clicks: 5, impressions: 50, ctr: 0.1, position: 8 },
  ]);
  assert.equal(totals.clicks, 15);
  assert.equal(totals.impressions, 150);
  assert.equal(totals.ctr, 0.1);
  assert.equal(totals.position, 4);
});

test("일반 도메인은 연결 속성과 매칭하고 없으면 sc-domain 속성으로 정규화한다", () => {
  assert.equal(
    normalizeGscTarget("example.com", ["https://example.com/", "sc-domain:other.com"]),
    "https://example.com/",
  );
  assert.equal(normalizeGscTarget("www.newsite.com/path"), "sc-domain:newsite.com");
});

test("권한 없는 URL 속성은 실제 연결된 GSC 속성으로 전환한다", () => {
  assert.deepEqual(
    resolveAccessibleGscProperty({
      requested: "sc-domain:smb.soverin.cloud",
      properties: ["https://bsa.soverin.cloud/"],
      connected: "https://bsa.soverin.cloud/",
    }),
    {
      value: "https://bsa.soverin.cloud/",
      requestedUnavailable: true,
    },
  );
  assert.deepEqual(
    resolveAccessibleGscProperty({
      requested: "bsa.soverin.cloud",
      properties: ["https://bsa.soverin.cloud/"],
      connected: "https://bsa.soverin.cloud/",
    }),
    {
      value: "https://bsa.soverin.cloud/",
      requestedUnavailable: false,
    },
  );
});

test("현재 워크스페이스에 없는 캠페인은 수집 가능한 캠페인으로 대체한다", () => {
  assert.deepEqual(
    resolveAccessibleCampaign({
      requested: "stale-campaign",
      campaigns: [
        { id: "empty-campaign", configured: false },
        { id: "live-campaign", configured: true },
      ],
    }),
    { value: "live-campaign", requestedUnavailable: true },
  );
});

test("직전 기간은 현재 기간과 같은 일수로 계산한다", () => {
  assert.deepEqual(previousDateRange("2026-07-01", "2026-07-28"), {
    start: "2026-06-03",
    end: "2026-06-30",
  });
});

test("상위 페이지 변화는 신규·상승·하락을 실제 클릭 차이로 분류한다", () => {
  const current = [
    { keys: ["https://example.com/a"], clicks: 12, impressions: 100, ctr: 0.12, position: 2 },
    { keys: ["https://example.com/b"], clicks: 2, impressions: 30, ctr: 0.06, position: 8 },
  ];
  const previous = [
    { keys: ["https://example.com/a"], clicks: 5, impressions: 90, ctr: 0.05, position: 3 },
    { keys: ["https://example.com/c"], clicks: 2, impressions: 20, ctr: 0.1, position: 5 },
  ];
  const rows = buildPageMovers(current, previous);
  assert.equal(rows[0]?.state, "growing");
  assert.equal(rows[0]?.clickDelta, 7);
  assert.equal(rows[1]?.state, "new");
  assert.equal(rows[2]?.page, "https://example.com/c");
  assert.equal(rows[2]?.state, "declining");
  assert.equal(rows[2]?.clickDelta, -2);
  assert.equal(rows[2]?.position, null);
});

test("시장 플레이어 비중은 SERP 관측 키워드 수를 분모로 사용한다", () => {
  const rows = buildMarketPlayers({
    ownDomain: "example.com",
    ownAppearances: 5,
    ownAvgPosition: 4,
    keywordsWithSerp: 10,
    competitors: [{ domain: "rival.com", appearances: 8, avgPosition: 6, bestPosition: 1 }],
  });
  assert.equal(rows[0]?.domain, "rival.com");
  assert.equal(rows[0]?.presence, 80);
  assert.equal(rows.find((row) => row.own)?.presence, 50);
});
