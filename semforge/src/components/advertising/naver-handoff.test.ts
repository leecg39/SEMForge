import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_NAVER_HANDOFF_KEYWORDS,
  parseNaverAdvertisingHandoff,
} from "./naver-handoff";
import { buildActionHref } from "@/components/analytics/naver-keywords/model";

test("NAVER 광고 handoff 키워드를 NFKC·공백 정규화하고 중복과 초과 항목을 제거한다", () => {
  const keywords = [
    "  ＳＥＯ   컨설팅  ",
    "SEO 컨설팅",
    ...Array.from({ length: MAX_NAVER_HANDOFF_KEYWORDS + 4 }, (_, index) => `키워드 ${index + 1}`),
  ];
  const params = new URLSearchParams({
    source: "naver-keyword-explorer",
    keywords: keywords.join("，"),
  });

  const handoff = parseNaverAdvertisingHandoff(params);

  assert.ok(handoff);
  assert.equal(handoff.keywords.length, MAX_NAVER_HANDOFF_KEYWORDS);
  assert.equal(handoff.keywords[0], "SEO 컨설팅");
  assert.equal(handoff.keywords[1], "키워드 1");
  assert.equal(new Set(handoff.keywords.map((keyword) => keyword.toLocaleLowerCase("ko-KR"))).size, MAX_NAVER_HANDOFF_KEYWORDS);
});

test("NAVER 키워드 탐색기 출처가 아니거나 유효 키워드가 없으면 handoff로 취급하지 않는다", () => {
  assert.equal(
    parseNaverAdvertisingHandoff(new URLSearchParams({ source: "email", keywords: "검색 광고" })),
    null,
  );
  assert.equal(
    parseNaverAdvertisingHandoff(
      new URLSearchParams({
        source: "naver-keyword-explorer",
        keywords: `${"가".repeat(81)},\u0000\u0001`,
      }),
    ),
    null,
  );
  assert.equal(
    parseNaverAdvertisingHandoff(
      new URLSearchParams({
        source: "naver-keyword-explorer",
        keywords: "가".repeat(4_097),
      }),
    ),
    null,
  );
  assert.equal(
    parseNaverAdvertisingHandoff(
      new URLSearchParams({
        source: "naver-keyword-explorer",
        keywords: "정상 키워드,시각\u202E왜곡",
      }),
    )?.keywords.join(","),
    "정상 키워드",
  );
});

test("검증된 NAVER provenance와 선택적 Search Ads 통계만 보존한다", () => {
  const params = new URLSearchParams({
    source: "naver-keyword-explorer",
    keywords: "검색 광고,콘텐츠 마케팅",
    naverSource: "naver-search-ads",
    naverFetchedAt: "2026-08-04T00:00:00.000Z",
    measurement: "absolute",
    naverMonthlyPcQueries: "100–109",
    naverMonthlyMobileQueries: "<10",
    naverMonthlyTotalQueries: "110–119",
    naverAveragePcClicks: "12.3",
    naverAverageMobileClicks: "45.6",
    naverAveragePcCtr: "3.2%",
    naverAverageMobileCtr: "4.1%",
    naverAdCompetition: "높음",
  });

  const handoff = parseNaverAdvertisingHandoff(params);

  assert.deepEqual(handoff, {
    keywords: ["검색 광고", "콘텐츠 마케팅"],
    providerSource: "naver-search-ads",
    fetchedAt: "2026-08-04T00:00:00.000Z",
    measurement: "absolute",
    adStats: {
      monthlyPcQueries: "100–109",
      monthlyMobileQueries: "<10",
      monthlyTotalQueries: "110–119",
      averagePcClicks: "12.3",
      averageMobileClicks: "45.6",
      averagePcCtr: "3.2%",
      averageMobileCtr: "4.1%",
      competition: "높음",
    },
  });
});

test("잘못된 provenance와 광고 통계 값은 키워드 handoff와 분리해 폐기한다", () => {
  const params = new URLSearchParams({
    source: "naver-keyword-explorer",
    keywords: "검색 광고",
    naverSource: "x".repeat(81),
    naverFetchedAt: "not-a-date",
    measurement: "estimated",
    naverMonthlyPcQueries: "<script>alert(1)</script>",
    naverAdCompetition: "높음\u0000위험",
  });

  const handoff = parseNaverAdvertisingHandoff(params);

  assert.ok(handoff);
  assert.equal(handoff.providerSource, null);
  assert.equal(handoff.fetchedAt, null);
  assert.equal(handoff.measurement, null);
  assert.deepEqual(handoff.adStats, {});
});

test("키워드 탐색기의 현재 광고 CTA URL을 광고 리서치 초안으로 복원한다", () => {
  const href = buildActionHref("advertising", ["검색 광고", "SEO"], {
    naverSource: "naver-search-ads",
    naverFetchedAt: "2026-08-04T00:00:00.000Z",
    measurement: "absolute",
    intents: ["commercial", "informational"],
  });
  const url = new URL(href, "https://semforge.test");

  const handoff = parseNaverAdvertisingHandoff(url.searchParams);

  assert.ok(handoff);
  assert.deepEqual(handoff.keywords, ["검색 광고", "SEO"]);
  assert.equal(handoff.providerSource, "naver-search-ads");
  assert.equal(handoff.fetchedAt, "2026-08-04T00:00:00.000Z");
  assert.equal(handoff.measurement, "absolute");
});
