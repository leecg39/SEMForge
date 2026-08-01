import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEATURED_SNIPPET_TOKENS,
  buildPageRankings,
  detectCannibalization,
  extractFeaturedSnippets,
  type PageInsightSerpRow,
} from "@/server/position-tracking/page-insights";

function row(
  overrides: Partial<PageInsightSerpRow> &
    Pick<PageInsightSerpRow, "keyword_metric_id" | "domain" | "url">,
): PageInsightSerpRow {
  return {
    search_engine: "google",
    position: 1,
    is_ad: false,
    title: null,
    description: null,
    serp_features: "[]",
    source: "talordata",
    captured_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

test("페이지별 순위는 광고와 유사 도메인을 제외하고 서브도메인을 포함한다", () => {
  const rows = [
    row({
      keyword_metric_id: "kw-1",
      domain: "example.com",
      url: "https://example.com/guide",
      position: 8,
    }),
    row({
      keyword_metric_id: "kw-2",
      domain: "blog.example.com",
      url: "https://blog.example.com/post",
      position: 3,
    }),
    row({
      keyword_metric_id: "kw-ad",
      domain: "example.com",
      url: "https://example.com/ad",
      position: 1,
      is_ad: true,
    }),
    row({
      keyword_metric_id: "kw-lookalike",
      domain: "notexample.com",
      url: "https://notexample.com/guide",
      position: 2,
    }),
  ];
  const before = structuredClone(rows);

  assert.deepEqual(buildPageRankings(rows, "https://www.example.com/path"), [
    {
      url: "https://blog.example.com/post",
      keywords: 1,
      bestPosition: 3,
      averagePosition: 3,
      lastSeenAt: "2026-07-31T00:00:00.000Z",
    },
    {
      url: "https://example.com/guide",
      keywords: 1,
      bestPosition: 8,
      averagePosition: 8,
      lastSeenAt: "2026-07-31T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(rows, before);
});

test("페이지 평균은 null 순위를 제외하고 유효 표본이 없으면 null이다", () => {
  const rows = [
    row({
      keyword_metric_id: "kw-1",
      domain: "example.com",
      url: "https://example.com/a",
      position: 4,
      captured_at: "2026-07-30T00:00:00.000Z",
    }),
    row({
      keyword_metric_id: "kw-2",
      domain: "example.com",
      url: "https://example.com/a",
      position: null,
      captured_at: "2026-07-31T00:00:00.000Z",
    }),
    row({
      keyword_metric_id: "kw-3",
      domain: "example.com",
      url: "https://example.com/unranked",
      position: null,
    }),
  ];

  assert.deepEqual(buildPageRankings(rows, "example.com"), [
    {
      url: "https://example.com/a",
      keywords: 2,
      bestPosition: 4,
      averagePosition: 4,
      lastSeenAt: "2026-07-31T00:00:00.000Z",
    },
    {
      url: "https://example.com/unranked",
      keywords: 1,
      bestPosition: null,
      averagePosition: null,
      lastSeenAt: "2026-07-31T00:00:00.000Z",
    },
  ]);
});

test("카니발리제이션은 키워드별 2개와 3개 자사 URL을 심각도 순으로 찾는다", () => {
  const rows = [
    row({ keyword_metric_id: "kw-two", domain: "example.com", url: "https://example.com/a", position: 4 }),
    row({ keyword_metric_id: "kw-two", domain: "blog.example.com", url: "https://blog.example.com/b", position: 9 }),
    row({ keyword_metric_id: "kw-three", domain: "example.com", url: "https://example.com/c", position: 12 }),
    row({ keyword_metric_id: "kw-three", domain: "example.com", url: "https://example.com/d", position: 18 }),
    row({ keyword_metric_id: "kw-three", domain: "shop.example.com", url: "https://shop.example.com/e", position: null }),
    row({ keyword_metric_id: "kw-ad", domain: "example.com", url: "https://example.com/ad-a", position: 1, is_ad: true }),
    row({ keyword_metric_id: "kw-ad", domain: "example.com", url: "https://example.com/ad-b", position: 2, is_ad: true }),
    row({ keyword_metric_id: "kw-rival", domain: "notexample.com", url: "https://notexample.com/x", position: 1 }),
  ];

  assert.deepEqual(detectCannibalization(rows, "example.com"), [
    {
      keyword: "kw-three",
      urls: [
        { url: "https://example.com/c", position: 12 },
        { url: "https://example.com/d", position: 18 },
        { url: "https://shop.example.com/e", position: null },
      ],
      bestPosition: 12,
      competingCount: 3,
    },
    {
      keyword: "kw-two",
      urls: [
        { url: "https://example.com/a", position: 4 },
        { url: "https://blog.example.com/b", position: 9 },
      ],
      bestPosition: 4,
      competingCount: 2,
    },
  ]);
});

test("자사 URL이 키워드마다 하나뿐이면 카니발리제이션이 없다", () => {
  const rows = [
    row({ keyword_metric_id: "kw-1", domain: "example.com", url: "https://example.com/a" }),
    row({ keyword_metric_id: "kw-2", domain: "blog.example.com", url: "https://blog.example.com/b" }),
    row({
      keyword_metric_id: "kw-changed",
      domain: "example.com",
      url: "https://example.com/old",
      captured_at: "2026-07-30T00:00:00.000Z",
    }),
    row({
      keyword_metric_id: "kw-changed",
      domain: "example.com",
      url: "https://example.com/new",
      captured_at: "2026-07-31T00:00:00.000Z",
    }),
  ];
  assert.deepEqual(detectCannibalization(rows, "example.com"), []);
});

test("추천 스니펫 표기 변형을 찾아 자사와 경쟁사 관측으로 나눈다", () => {
  assert.ok(FEATURED_SNIPPET_TOKENS.includes("featured_snippet"));
  assert.ok(FEATURED_SNIPPET_TOKENS.includes("answer_box"));

  const rows = [
    row({
      keyword_metric_id: "kw-own",
      domain: "blog.example.com",
      url: "https://blog.example.com/answer",
      position: 1,
      serp_features: '["featured-snippet"]',
    }),
    row({
      keyword_metric_id: "kw-own",
      domain: "rival.com",
      url: "https://rival.com/ordinary-result",
      position: 2,
      serp_features: '["featured-snippet"]',
    }),
    row({
      keyword_metric_id: "kw-rival",
      domain: "rival.com",
      url: "https://rival.com/answer",
      position: 1,
      serp_features: '["answer box"]',
    }),
    row({
      keyword_metric_id: "kw-rival",
      domain: "example.com",
      url: "https://example.com/ordinary-result",
      position: 3,
      serp_features: '["answer box"]',
    }),
    row({
      keyword_metric_id: "kw-ordinary",
      domain: "example.com",
      url: "https://example.com/ordinary",
      serp_features: '["people_also_ask"]',
    }),
  ];

  assert.deepEqual(extractFeaturedSnippets(rows, "example.com"), {
    owned: [
      {
        keyword: "kw-own",
        domain: "blog.example.com",
        url: "https://blog.example.com/answer",
        position: 1,
        capturedAt: "2026-07-31T00:00:00.000Z",
      },
    ],
    competitors: [
      {
        keyword: "kw-rival",
        domain: "rival.com",
        url: "https://rival.com/answer",
        position: 1,
        capturedAt: "2026-07-31T00:00:00.000Z",
      },
    ],
  });
});

test("깨진 JSON과 빈 입력은 예외 없이 빈 결과를 만든다", () => {
  const broken = row({
    keyword_metric_id: "kw-broken",
    domain: "example.com",
    url: "https://example.com/broken",
    serp_features: "[broken",
  });

  assert.deepEqual(extractFeaturedSnippets([broken], "example.com"), {
    owned: [],
    competitors: [],
  });
  assert.deepEqual(buildPageRankings([], "example.com"), []);
  assert.deepEqual(detectCannibalization([], "example.com"), []);
  assert.deepEqual(extractFeaturedSnippets([], "example.com"), {
    owned: [],
    competitors: [],
  });
});
