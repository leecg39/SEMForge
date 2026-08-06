// @TASK NAVER-OVERVIEW-MVP - NAVER 키워드 개요 UI 계약
// @SPEC 사용자 승인 계획#로그인-기능
// @TEST node:test + react-dom/server

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KeywordEngineTabs,
  NaverKeywordOverview,
  NaverKeywordSearchForm,
  buildNaverOverviewHandoffLinks,
  formatNaverCount,
  normalizeNaverKeyword,
  parseNaverKeywordOverviewReport,
} from "./NaverKeywordOverview";
import type {
  NaverKeywordOverviewReport,
  NaverProviderEnvelope,
} from "./types";

function live<T>(data: T, measurement: NaverProviderEnvelope<T>["measurement"]): NaverProviderEnvelope<T> {
  return {
    status: "live",
    cache: "fresh",
    measurement,
    source: "naver-search-ads",
    fetchedAt: "2026-08-04T00:00:00.000Z",
    expiresAt: "2026-08-11T00:00:00.000Z",
    data,
  };
}

const REPORT: NaverKeywordOverviewReport = {
  keyword: "커피 머신",
  normalizedKeyword: "커피 머신",
  locale: "ko-KR",
  generatedAt: "2026-08-04T00:00:00.000Z",
  volume: live(
    {
      pc: { min: 0, maxExclusive: 10, display: "<10" },
      mobile: { min: 1200, maxExclusive: null, display: "1,200" },
      total: { min: 1200, maxExclusive: 1210, display: "1,200–1,209" },
      period: "최근 30일",
    },
    "absolute",
  ),
  advertising: live(
    {
      competition: "high",
      averagePcClicks: 12.5,
      averageMobileClicks: 41.2,
      averagePcCtr: 0.74,
      averageMobileCtr: 1.82,
      pcAdDepth: 8,
    },
    "absolute",
  ),
  trend: {
    ...live(
      {
        points: [
          { period: "2026-07-01", ratio: 74 },
          { period: "2026-08-01", ratio: 100 },
        ],
        unit: "relative-index",
      },
      "relative",
    ),
    source: "naver-api-hub-search-trend",
  },
  demographics: {
    ...live(
      {
        device: [
          { key: "pc", label: "PC", ratio: 21 },
          { key: "mobile", label: "모바일", ratio: 79 },
        ],
        gender: [],
        age: [],
      },
      "relative",
    ),
    source: "naver-api-hub-search-trend",
  },
  blog: {
    ...live(
      {
        total: 42310,
        items: [
          {
            title: "가정용 커피 머신 비교",
            link: "https://blog.naver.com/example/1",
            bloggerName: "홈카페 연구소",
            postDate: "20260801",
          },
        ],
      },
      "absolute",
    ),
    source: "naver-api-hub-blog-search",
  },
  related: live(
    {
      items: [
        {
          keyword: "가정용 커피 머신",
          pc: { min: 80, maxExclusive: null, display: "80" },
          mobile: { min: 640, maxExclusive: null, display: "640" },
          total: { min: 720, maxExclusive: null, display: "720" },
          competition: "medium",
        },
      ],
    },
    "absolute",
  ),
};

test("검색량의 <10과 범위 표현을 숫자로 왜곡하지 않는다", () => {
  assert.equal(formatNaverCount({ min: 0, maxExclusive: 10, display: "<10" }, "ko"), "<10");
  assert.equal(
    formatNaverCount({ min: 1200, maxExclusive: 1210, display: "1,200–1,209" }, "ko"),
    "1,200–1,209",
  );
  assert.equal(formatNaverCount(null, "ko"), "사용 불가");
});

test("API data wrapper와 직접 리포트를 모두 안전하게 해석한다", () => {
  assert.equal(parseNaverKeywordOverviewReport({ data: REPORT })?.keyword, "커피 머신");
  assert.equal(parseNaverKeywordOverviewReport(REPORT)?.normalizedKeyword, "커피 머신");
  assert.equal(parseNaverKeywordOverviewReport({ data: { keyword: 42 } }), null);
});

test("확정된 searchAds primary/relatedKeywords 응답을 화면 섹션으로 변환한다", () => {
  const parsed = parseNaverKeywordOverviewReport({
    data: {
      keyword: "커피 머신",
      generatedAt: "2026-08-04T00:00:00.000Z",
      searchAds: {
        status: "live",
        cache: "fresh",
        measurement: "absolute",
        source: "naver-search-ads",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-11T00:00:00.000Z",
        data: {
          primary: {
            keyword: "커피 머신",
            monthlyPcQueries: { relation: "lt", min: 0, maxExclusive: 10, display: "<10" },
            monthlyMobileQueries: { relation: "exact", min: 1200, maxExclusive: null, display: "1,200", value: 1200 },
            monthlyTotalQueries: { relation: "range", min: 1200, maxExclusive: 1210, display: "1,200–1,209" },
            monthlyAveragePcClicks: 12.5,
            monthlyAverageMobileClicks: 41.2,
            monthlyAveragePcCtr: 0.74,
            monthlyAverageMobileCtr: 1.82,
            averageAdDepth: 8,
            competition: "high",
            competitionLabel: "높음",
          },
          relatedKeywords: [
            {
              keyword: "가정용 커피 머신",
              monthlyPcQueries: { relation: "exact", min: 80, maxExclusive: null, display: "80", value: 80 },
              monthlyMobileQueries: { relation: "exact", min: 640, maxExclusive: null, display: "640", value: 640 },
              monthlyTotalQueries: { relation: "exact", min: 720, maxExclusive: null, display: "720", value: 720 },
              competition: "medium",
            },
          ],
        },
      },
      trend: {
        status: "live",
        cache: "fresh",
        measurement: "relative",
        source: "naver-api-hub-search-trend",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-11T00:00:00.000Z",
        data: {
          title: "커피 머신 검색 추이",
          keywords: ["커피 머신"],
          points: [{ period: "2026-08-01", ratio: 100 }],
        },
      },
      blog: {
        status: "live",
        cache: "fresh",
        measurement: "absolute",
        source: "naver-api-hub-blog-search",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-05T00:00:00.000Z",
        data: {
          total: 42310,
          resultLabel: "네이버 블로그 검색 API 응답 예시",
          items: [],
        },
      },
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.normalizedKeyword, "커피 머신");
  assert.equal(parsed.volume.data?.pc?.display, "<10");
  assert.equal(parsed.advertising.data?.averagePcClicks, 12.5);
  assert.equal(parsed.advertising.data?.averageMobileCtr, 1.82);
  assert.equal(parsed.advertising.data?.pcAdDepth, 8);
  assert.equal(parsed.related.data?.items[0]?.keyword, "가정용 커피 머신");
  assert.equal(parsed.demographics, undefined);
});

test("NAVER 입력은 NFKC와 공백 정규화를 적용한다", () => {
  assert.equal(normalizeNaverKeyword("  커피   머신  "), "커피 머신");
});

test("엔진 탭은 Google/Bing과 NAVER를 명확히 구분한다", () => {
  const html = renderToStaticMarkup(
    <KeywordEngineTabs activeEngine="naver" locale="ko" onChange={() => undefined} />,
  );

  assert.match(html, /role="tablist"/);
  assert.match(html, /Google \/ Bing/);
  assert.match(html, /NAVER/);
  assert.match(html, /aria-selected="true"[^>]*>[\s\S]*NAVER/);
});

test("NAVER 검색 폼은 대한민국 고정 조건과 접근 가능한 진행 상태를 제공한다", () => {
  const html = renderToStaticMarkup(
    <NaverKeywordSearchForm
      keyword="커피 머신"
      locale="ko"
      loading
      onKeywordChange={() => undefined}
      onSubmit={() => undefined}
      onExample={() => undefined}
    />,
  );

  assert.match(html, /대한민국/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /maxLength="80"/);
  assert.match(html, /NAVER 데이터 수집 중/);
});

test("NAVER 패널은 공식 수치와 출처를 표시하고 블로그 결과를 순위로 부르지 않는다", () => {
  const html = renderToStaticMarkup(
    <NaverKeywordOverview
      locale="ko"
      report={REPORT}
      loading={false}
      error={null}
      onRetry={() => undefined}
    />,
  );

  assert.match(html, /PC 검색량/);
  assert.match(html, /1,200–1,209/);
  assert.match(html, /광고 경쟁도/);
  assert.match(html, /자연검색 난이도와 다른 Search Ads 지표/);
  assert.match(html, /12개월 상대 검색 관심도/);
  assert.match(html, /네이버 블로그 검색 API 응답 예시/);
  assert.match(html, /가정용 커피 머신 비교/);
  assert.match(html, /naver-api-hub-blog-search/);
  assert.doesNotMatch(html, /VIEW 순위|스마트블록 순위|통합검색 순위/);
});

test("부분 실패 섹션은 이유와 사용 불가 상태를 표시한다", () => {
  const report: NaverKeywordOverviewReport = {
    ...REPORT,
    demographics: {
      status: "unavailable",
      cache: "fresh",
      measurement: "relative",
      source: "naver-api-hub-search-trend",
      fetchedAt: null,
      expiresAt: null,
      reason: "API 자격 증명이 연결되지 않았습니다.",
      data: null,
    },
  };

  const html = renderToStaticMarkup(
    <NaverKeywordOverview
      locale="ko"
      report={report}
      loading={false}
      error={null}
      onRetry={() => undefined}
    />,
  );

  assert.match(html, /사용 불가/);
  assert.match(html, /API 자격 증명이 연결되지 않았습니다/);
});

test("재수집 중에도 이전 리포트를 유지하고 진행 상태를 알린다", () => {
  const html = renderToStaticMarkup(
    <NaverKeywordOverview
      locale="ko"
      report={REPORT}
      loading
      error={null}
      onRetry={() => undefined}
    />,
  );

  assert.match(html, /최신 데이터를 확인하는 동안 이전 결과를 표시합니다/);
  assert.match(html, /커피 머신/);
  assert.match(html, /aria-busy="true"/);
});

test("공식 NAVER 데이터만 콘텐츠 브리프와 광고 초안 링크에 전달한다", () => {
  const links = buildNaverOverviewHandoffLinks(REPORT);
  const contentUrl = new URL(links.content, "https://semforge.test");
  const advertisingUrl = new URL(links.advertising, "https://semforge.test");

  assert.equal(contentUrl.pathname, "/content/");
  assert.equal(contentUrl.searchParams.get("intent"), "brief");
  assert.equal(contentUrl.searchParams.get("keyword"), "커피 머신");
  assert.equal(contentUrl.searchParams.get("source"), "naver-keyword-overview");
  assert.equal(contentUrl.searchParams.get("naverIntent"), "informational");
  assert.deepEqual(contentUrl.searchParams.getAll("naverSource"), [
    "naver-search-ads",
    "naver-api-hub-search-trend",
    "naver-api-hub-blog-search",
  ]);
  assert.match(contentUrl.searchParams.get("naverTrend") ?? "", /상대 지수/);
  assert.deepEqual(contentUrl.searchParams.getAll("naverBlogTitle"), ["가정용 커피 머신 비교"]);
  assert.equal(contentUrl.searchParams.get("measurement"), "relative");
  assert.equal(contentUrl.searchParams.get("naverFetchedAt"), "2026-08-04T00:00:00.000Z");

  assert.equal(advertisingUrl.pathname, "/analytics/adwords/positions/");
  assert.equal(advertisingUrl.searchParams.get("keyword"), "커피 머신");
  assert.equal(advertisingUrl.searchParams.get("keywords"), "커피 머신");
  assert.equal(advertisingUrl.searchParams.get("source"), "naver-keyword-overview");
  assert.equal(advertisingUrl.searchParams.get("naverSource"), "naver-search-ads");
  assert.equal(advertisingUrl.searchParams.get("naverMonthlyPcQueries"), "<10");
  assert.equal(advertisingUrl.searchParams.get("naverMonthlyMobileQueries"), "1,200");
  assert.equal(advertisingUrl.searchParams.get("naverMonthlyTotalQueries"), "1,200–1,209");
  assert.equal(advertisingUrl.searchParams.get("naverAveragePcClicks"), "12.5");
  assert.equal(advertisingUrl.searchParams.get("naverAverageMobileClicks"), "41.2");
  assert.equal(advertisingUrl.searchParams.get("naverAveragePcCtr"), "0.74");
  assert.equal(advertisingUrl.searchParams.get("naverAverageMobileCtr"), "1.82");
  assert.equal(advertisingUrl.searchParams.get("naverAdCompetition"), "high");
  assert.equal(advertisingUrl.searchParams.has("rawResponse"), false);
});

test("사용 불가 공급자 값은 handoff에서 생략하고 키워드 문맥만 유지한다", () => {
  const unavailable = <T,>(source: string, measurement: NaverProviderEnvelope<T>["measurement"]): NaverProviderEnvelope<T> => ({
    status: "unavailable",
    cache: "fresh",
    measurement,
    source,
    fetchedAt: null,
    expiresAt: null,
    reason: "자격 증명 없음",
    data: null,
  });
  const report: NaverKeywordOverviewReport = {
    ...REPORT,
    volume: unavailable("naver-search-ads", "absolute"),
    advertising: unavailable("naver-search-ads", "absolute"),
    trend: unavailable("naver-api-hub-search-trend", "relative"),
    blog: unavailable("naver-api-hub-blog-search", "absolute"),
    related: unavailable("naver-search-ads", "absolute"),
  };

  const links = buildNaverOverviewHandoffLinks(report);
  for (const href of [links.content, links.advertising]) {
    const params = new URL(href, "https://semforge.test").searchParams;
    assert.equal(params.get("keyword"), "커피 머신");
    assert.equal(params.has("naverSource"), false);
    assert.equal(params.has("naverFetchedAt"), false);
    assert.equal(params.has("measurement"), false);
    assert.equal(params.has("naverTrend"), false);
    assert.equal(params.has("naverBlogTitle"), false);
    assert.equal(params.has("naverMonthlyPcQueries"), false);
    assert.equal(params.has("naverAdCompetition"), false);
  }
});

test("handoff URL은 최근 상대 추이와 블로그 응답 제목 3개 이내로 제한한다", () => {
  const longText = "가".repeat(2_000);
  const report: NaverKeywordOverviewReport = {
    ...REPORT,
    trend: {
      ...REPORT.trend,
      data: {
        points: Array.from({ length: 48 }, (_, index) => ({
          period: `2026-${String((index % 12) + 1).padStart(2, "0")}-${longText}`,
          ratio: index,
        })),
        unit: "relative-index",
      },
    },
    blog: {
      ...REPORT.blog,
      data: {
        total: 4,
        items: Array.from({ length: 4 }, (_, index) => ({
          title: `${index + 1}-${longText}`,
          link: `https://blog.naver.com/example/${index + 1}`,
          bloggerName: null,
          postDate: null,
        })),
      },
    },
  };

  const links = buildNaverOverviewHandoffLinks(report);
  const contentUrl = new URL(links.content, "https://semforge.test");
  assert.ok(links.content.length <= 4_096);
  assert.ok(contentUrl.searchParams.getAll("naverBlogTitle").length <= 3);
  assert.doesNotMatch(contentUrl.searchParams.get("naverTrend") ?? "", /2026-01-[가-힣]{500}/);
});

test("리포트 하단 CTA는 게시·캠페인 실행이 아닌 검토용 초안 handoff임을 알린다", () => {
  const html = renderToStaticMarkup(
    <NaverKeywordOverview
      locale="ko"
      report={REPORT}
      loading={false}
      error={null}
      onRetry={() => undefined}
    />,
  );

  assert.match(html, />네이버 콘텐츠 브리프</);
  assert.match(html, />광고 키워드 초안</);
  assert.match(html, /검토용 초안/);
  assert.match(html, /게시하거나 캠페인을 생성하지 않습니다/);
  assert.match(html, /href="\/content\/?\?[^\"]*source=naver-keyword-overview/);
  assert.match(html, /href="\/analytics\/adwords\/positions\/?\?[^\"]*source=naver-keyword-overview/);
});
