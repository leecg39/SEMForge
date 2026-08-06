// @TASK NAVER-P0-EXPLORER - 한국형 키워드 탐색기 모델 계약
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/model.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_SIZE,
  buildActionHref,
  buildKeywordCsv,
  exactKeywordVolume,
  filterKeywordRows,
  normalizeExplorePayload,
  normalizeSeeds,
  paginateKeywordRows,
  sortKeywordRows,
} from "@/components/analytics/naver-keywords/model";
import type { NaverKeywordRow } from "@/components/analytics/naver-keywords/types";
import { parseNaverAdvertisingHandoff } from "@/components/advertising/naver-handoff";
import { parseNaverContentHandoff } from "@/components/content/naver-handoff";

const exact = (value: number) => ({
  relation: "exact" as const,
  value,
  min: value,
  maxExclusive: value + 1,
  display: value.toLocaleString("ko-KR"),
});

const underTen = {
  relation: "lt" as const,
  min: 0,
  maxExclusive: 10,
  display: "<10",
};

function row(overrides: Partial<NaverKeywordRow> & Pick<NaverKeywordRow, "keyword">): NaverKeywordRow {
  const { keyword, ...rest } = overrides;
  const base: NaverKeywordRow = {
    keyword,
    normalizedKeyword: keyword.toLocaleLowerCase("ko-KR"),
    monthlyPcQueries: exact(100),
    monthlyMobileQueries: exact(200),
    monthlyTotalQueries: exact(300),
    monthlyAveragePcClicks: 1.2,
    monthlyAverageMobileClicks: 2.3,
    monthlyAveragePcCtr: 0.5,
    monthlyAverageMobileCtr: 0.8,
    averageAdDepth: null,
    competition: "medium",
    competitionLabel: "중간",
    intent: "informational",
    intentMeasurement: "inferred",
    intentModel: "clone-intent-v1",
    source: "naver-search-ads",
    fetchedAt: "2026-08-04T00:00:00.000Z",
    expiresAt: "2026-08-11T00:00:00.000Z",
    cache: "fresh",
    snapshotId: null,
  };
  return { ...base, ...rest, keyword };
}

test("seed 입력은 NFKC·공백 정규화 후 중복을 제거하고 1~5개만 허용한다", () => {
  assert.deepEqual(normalizeSeeds(["  ＳＥＯ  ", "SEO", "검색   광고", ""]), ["SEO", "검색 광고"]);
  assert.throws(() => normalizeSeeds([]), /1개 이상/);
  assert.throws(() => normalizeSeeds(["a", "b", "c", "d", "e", "f"]), /최대 5개/);
});

test("기본 정렬은 검색량 하한값 내림차순이며 동률은 한국어 키워드 오름차순이다", () => {
  const rows = [
    row({ keyword: "하늘", monthlyTotalQueries: exact(100) }),
    row({ keyword: "가방", monthlyTotalQueries: exact(100) }),
    row({ keyword: "네이버 광고", monthlyTotalQueries: { ...underTen } }),
    row({ keyword: "검색 광고", monthlyTotalQueries: exact(800) }),
  ];

  assert.deepEqual(sortKeywordRows(rows).map((item) => item.keyword), ["검색 광고", "가방", "하늘", "네이버 광고"]);
  assert.deepEqual(rows.map((item) => item.keyword), ["하늘", "가방", "네이버 광고", "검색 광고"]);
});

test("검색·광고 경쟁도·추론 intent 필터는 원본 배열을 변경하지 않는다", () => {
  const rows = [
    row({ keyword: "검색 광고", competition: "high", intent: "commercial" }),
    row({ keyword: "검색엔진 최적화", competition: "low", intent: "informational" }),
  ];

  const result = filterKeywordRows(rows, {
    query: "광고",
    competition: "high",
    intent: "commercial",
  });
  assert.deepEqual(result.map((item) => item.keyword), ["검색 광고"]);
  assert.equal(rows.length, 2);
});

test("페이지 크기는 50개로 고정되고 범위를 벗어난 페이지는 마지막 페이지로 보정한다", () => {
  const rows = Array.from({ length: 111 }, (_, index) => row({ keyword: `키워드 ${index}` }));
  const first = paginateKeywordRows(rows, 1);
  const last = paginateKeywordRows(rows, 99);
  assert.equal(PAGE_SIZE, 50);
  assert.equal(first.rows.length, 50);
  assert.equal(first.pageCount, 3);
  assert.equal(last.page, 3);
  assert.equal(last.rows.length, 11);
});

test("CSV는 현재 캐시된 행만 직렬화하고 <10/range display와 provenance를 보존한다", () => {
  const csv = buildKeywordCsv([
    row({
      keyword: "광고,키워드",
      monthlyPcQueries: underTen,
      monthlyTotalQueries: { relation: "range", min: 100, maxExclusive: 110, display: "100–109" },
    }),
  ]);

  assert.match(csv, /^\uFEFF키워드,/);
  assert.match(csv, /"광고,키워드"/);
  assert.match(csv, /<10/);
  assert.match(csv, /100–109/);
  assert.match(csv, /naver-search-ads/);
});

test("키워드 목록의 단일 volume에는 exact 값만 전달하고 범위 하한은 저장하지 않는다", () => {
  assert.equal(exactKeywordVolume(exact(123)), 123);
  assert.equal(exactKeywordVolume(underTen), null);
  assert.equal(
    exactKeywordVolume({ relation: "range", min: 100, maxExclusive: 110, display: "100–109" }),
    null,
  );
  assert.equal(exactKeywordVolume(null), null);
});

test("CSV는 스프레드시트 수식으로 해석될 수 있는 키워드를 텍스트로 고정한다", () => {
  const csv = buildKeywordCsv([row({ keyword: "=HYPERLINK(\"https://invalid.test\")" })]);
  assert.match(csv, /'\=HYPERLINK/);
});

test("액션 링크는 선택 키워드와 NAVER provenance만 안전한 query string으로 전달한다", () => {
  const context = {
    naverSource: "naver-search-ads",
    naverFetchedAt: "2026-08-04T00:00:00.000Z",
    measurement: "absolute" as const,
    intents: ["commercial", "informational"] as const,
  };
  const href = buildActionHref("content", ["검색 광고", "SEO"], context);
  const url = new URL(href, "https://semforge.test");
  assert.equal(url.pathname, "/content/");
  assert.equal(url.searchParams.get("intent"), "brief");
  assert.equal(url.searchParams.get("source"), "naver-keyword-explorer");
  assert.equal(url.searchParams.get("naverSource"), "naver-search-ads");
  assert.equal(url.searchParams.get("naverFetchedAt"), "2026-08-04T00:00:00.000Z");
  assert.equal(url.searchParams.get("measurement"), "absolute");
  assert.equal(url.searchParams.get("naverIntents"), "commercial,informational");
  assert.equal(url.searchParams.get("inferredIntent"), "commercial");
  assert.deepEqual(url.searchParams.getAll("keyword"), ["검색 광고", "SEO"]);

  const contentHandoff = parseNaverContentHandoff(url.searchParams);
  assert.deepEqual(contentHandoff?.keywords, ["검색 광고", "SEO"]);
  assert.equal(contentHandoff?.inferredIntent, "commercial");
  assert.equal(contentHandoff?.naverSource, "naver-search-ads");

  const advertisingUrl = new URL(
    buildActionHref("advertising", ["검색 광고", "SEO"], context),
    "https://semforge.test",
  );
  const advertisingHandoff = parseNaverAdvertisingHandoff(advertisingUrl.searchParams);
  assert.deepEqual(advertisingHandoff?.keywords, ["검색 광고", "SEO"]);
  assert.equal(advertisingHandoff?.providerSource, "naver-search-ads");
  assert.equal(advertisingHandoff?.fetchedAt, "2026-08-04T00:00:00.000Z");
  assert.equal(advertisingHandoff?.measurement, "absolute");
});

test("API envelope는 최대 1000개 행과 공급자 provenance로 정규화한다", () => {
  const normalized = normalizeExplorePayload({
    data: {
      seeds: ["검색 광고"],
      keywords: {
        status: "live",
        cache: "fresh",
        measurement: "absolute",
        source: "naver-search-ads",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-11T00:00:00.000Z",
        data: [
          {
            keyword: "검색광고",
            normalizedKeyword: "검색광고",
            monthlyPcQueries: underTen,
            monthlyMobileQueries: exact(80),
            monthlyTotalQueries: { relation: "range", min: 80, maxExclusive: 90, display: "80–89" },
            monthlyAveragePcClicks: 1,
            monthlyAverageMobileClicks: 2,
            monthlyAveragePcCtr: 0.1,
            monthlyAverageMobileCtr: 0.2,
            averageAdDepth: 4,
            competition: "high",
            competitionLabel: "높음",
          },
        ],
      },
    },
  });

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0]?.monthlyPcQueries?.display, "<10");
  assert.equal(normalized.rows[0]?.source, "naver-search-ads");
  assert.equal(normalized.provenance.measurement, "absolute");
});

test("공급자 unavailable envelope는 가짜 행 없이 reason을 보존한다", () => {
  const normalized = normalizeExplorePayload({
    data: {
      seeds: ["검색 광고"],
      generatedAt: "2026-08-04T00:00:00.000Z",
      total: 0,
      keywords: {
        status: "unavailable",
        cache: "fresh",
        measurement: "absolute",
        source: "naver-search-ads",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-04T00:00:00.000Z",
        reason: "Search Ads 연결이 필요합니다.",
      },
    },
  });
  assert.equal(normalized.provenance.status, "unavailable");
  assert.equal(normalized.provenance.reason, "Search Ads 연결이 필요합니다.");
  assert.deepEqual(normalized.rows, []);
});
