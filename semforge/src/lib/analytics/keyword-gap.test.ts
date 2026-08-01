import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKeywordGap,
  classifyGapCategories,
  formatGapTargetParam,
  gapTargetLabel,
  parseGapTargetParam,
} from "@/lib/analytics/keyword-gap";
import type {
  AnalyticsRawDataset,
  RawKeywordMetric,
  RawSerpSnapshot,
} from "@/lib/analytics/types";

function metric(input: Partial<RawKeywordMetric> & { id: string; keyword: string }): RawKeywordMetric {
  return {
    normalizedKeyword: input.keyword.toLowerCase(),
    countryCode: "KR",
    device: "desktop",
    periodStart: "2026-07-01T00:00:00Z",
    volume: 0,
    cpcCents: 0,
    currencyCode: "USD",
    intent: "informational",
    source: "talordata-serp",
    updatedAt: "2026-07-31T00:00:00Z",
    ...input,
  };
}

function snapshot(
  input: Partial<RawSerpSnapshot> & {
    id: string;
    keywordMetricId: string;
    domain: string;
    position: number;
  },
): RawSerpSnapshot {
  return {
    searchEngine: "google",
    url: `https://${input.domain}/page-${input.position}`,
    isAd: false,
    serpFeatures: "[]",
    source: "talordata",
    capturedAt: "2026-07-31T09:00:00Z",
    ...input,
  };
}

function dataset(
  keywords: RawKeywordMetric[],
  serp: RawSerpSnapshot[],
): AnalyticsRawDataset {
  return { keywords, serp, clickstream: [], links: [] };
}

test("카테고리 분류는 Semrush 의미론을 따른다 (나 = 첫 번째)", () => {
  assert.deepEqual(classifyGapCategories([3, 5, 9]), ["shared", "strong"]);
  assert.deepEqual(classifyGapCategories([9, 3, 5]), ["shared", "weak"]);
  assert.deepEqual(classifyGapCategories([null, 3, 5]), ["missing", "untapped"]);
  assert.deepEqual(classifyGapCategories([null, 3, null]), ["untapped"]);
  assert.deepEqual(classifyGapCategories([4, null, null]), ["unique"]);
  // 경쟁자 사이에 끼면 weak 도 strong 도 아니다.
  assert.deepEqual(classifyGapCategories([5, 3, 9]), ["shared"]);
});

test("buildKeywordGap 은 최신 스냅샷 기준으로 포지션·카운트·겹침을 집계한다", () => {
  const keywords = [
    metric({ id: "k1", keyword: "seo tool", volume: 900 }),
    metric({ id: "k2", keyword: "rank checker", volume: 400 }),
    metric({ id: "k3", keyword: "unrelated", volume: 100 }),
  ];
  const serp = [
    // k1 과거 수집분 — 최신 수집에서 me.com 이 3위로 올라섰다.
    snapshot({ id: "s0", keywordMetricId: "k1", domain: "me.com", position: 9, capturedAt: "2026-07-01T09:00:00Z" }),
    snapshot({ id: "s1", keywordMetricId: "k1", domain: "me.com", position: 3 }),
    snapshot({ id: "s2", keywordMetricId: "k1", domain: "rival.com", position: 5 }),
    // k2 는 경쟁자만 순위 보유 → missing/untapped.
    snapshot({ id: "s3", keywordMetricId: "k2", domain: "rival.com", position: 2 }),
    // k3 은 두 대상 모두 순위 없음 → rows 에서 제외.
    snapshot({ id: "s4", keywordMetricId: "k3", domain: "other.com", position: 1 }),
  ];

  const report = buildKeywordGap(dataset(keywords, serp), {
    targets: [
      { value: "me.com", scope: "root" },
      { value: "rival.com", scope: "root" },
    ],
    countryCode: "kr",
    device: "desktop",
  });

  assert.equal(report.rows.length, 2);
  const [first, second] = report.rows;
  // 검색량 내림차순 정렬.
  assert.equal(first.keyword, "seo tool");
  assert.deepEqual(first.positions, [3, 5]);
  assert.deepEqual(first.categories, ["shared", "strong"]);
  assert.equal(second.keyword, "rank checker");
  assert.deepEqual(second.positions, [null, 2]);
  assert.deepEqual(second.categories, ["missing", "untapped"]);

  assert.equal(report.counts.all, 2);
  assert.equal(report.counts.shared, 1);
  assert.equal(report.counts.missing, 1);
  assert.equal(report.counts.strong, 1);
  assert.deepEqual(report.overlaps, [{ a: 0, b: 1, count: 1 }]);
  assert.deepEqual(
    report.targets.map((target) => target.rankedKeywords),
    [1, 2],
  );
  assert.equal(report.universe.keywordCount, 3);
  assert.equal(report.universe.comparedKeywordCount, 2);
  assert.equal(report.universe.lastCapturedAt, "2026-07-31T09:00:00.000Z");
});

test("scope 매칭 — root 는 서브도메인 포함, sub 는 정확한 호스트, folder/url 은 프리픽스·일치", () => {
  const keywords = [metric({ id: "k1", keyword: "docs guide", volume: 10 })];
  const serp = [
    snapshot({ id: "s1", keywordMetricId: "k1", domain: "blog.me.com", position: 4, url: "https://blog.me.com/docs/guide" }),
  ];
  const build = (value: string, scope: "root" | "sub" | "folder" | "url") =>
    buildKeywordGap(dataset(keywords, serp), {
      targets: [
        { value, scope },
        { value: "rival.com", scope: "root" },
      ],
      countryCode: "KR",
      device: "desktop",
    }).rows[0]?.positions[0] ?? null;

  assert.equal(build("me.com", "root"), 4);
  assert.equal(build("me.com", "sub"), null);
  assert.equal(build("blog.me.com", "sub"), 4);
  assert.equal(build("blog.me.com/docs", "folder"), 4);
  assert.equal(build("blog.me.com/other", "folder"), null);
  assert.equal(build("https://blog.me.com/docs/guide", "url"), 4);
  assert.equal(build("https://blog.me.com/docs", "url"), null);
});

test("갭 대상 파라미터는 scope 접두어를 왕복 인코딩한다", () => {
  assert.deepEqual(parseGapTargetParam("uinus.co.kr"), {
    value: "uinus.co.kr",
    scope: "root",
  });
  assert.deepEqual(parseGapTargetParam("sub:blog.a.com"), {
    value: "blog.a.com",
    scope: "sub",
  });
  assert.deepEqual(parseGapTargetParam("url:https://a.com/pricing"), {
    value: "https://a.com/pricing",
    scope: "url",
  });
  // https: 는 scope 접두어가 아니므로 root 도메인으로 해석한다.
  assert.deepEqual(parseGapTargetParam("https://a.com"), {
    value: "https://a.com",
    scope: "root",
  });
  assert.equal(parseGapTargetParam("   "), null);
  assert.equal(parseGapTargetParam("sub:"), null);
  assert.equal(parseGapTargetParam("not a domain"), null);

  assert.equal(formatGapTargetParam({ value: "a.com", scope: "root" }), "a.com");
  assert.equal(formatGapTargetParam({ value: "b.com/docs", scope: "folder" }), "folder:b.com/docs");
  assert.equal(gapTargetLabel({ value: "https://WWW.A.com/Docs/", scope: "folder" }), "a.com/docs");
});
