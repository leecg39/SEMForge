// @TASK NKI-PUBLIC-UI - 네이버 키워드 공개 미리보기 계약
// @SPEC 사용자 승인 계획: SEMForge 국내형 키워드 인텔리전스 / 공개 무료 도구
// @TEST 이 파일
import assert from "node:assert/strict";
import test from "node:test";
import {
  PreviewHttpError,
  buildSignupHref,
  formatOptionalVolume,
  formatVolumeRange,
  normalizePreviewKeyword,
  requestPreview,
  summarizeReportAvailability,
} from "@/components/free-tools/NaverKeywordPreview";
import type { NaverKeywordOverviewReport } from "@/server/naver-keywords/contracts";

const unavailableSection = {
  status: "unavailable",
  cache: "fresh",
  measurement: "absolute",
  source: "naver-test",
  fetchedAt: "2026-08-04T00:00:00.000Z",
  expiresAt: "2026-08-04T00:00:00.000Z",
  reason: "연결 필요",
} as const;

const unavailableReport: NaverKeywordOverviewReport = {
  keyword: "검색 광고",
  generatedAt: "2026-08-04T00:00:00.000Z",
  searchAds: unavailableSection,
  trend: { ...unavailableSection, measurement: "relative" },
  demographics: { ...unavailableSection, measurement: "relative" },
  blog: unavailableSection,
};

test("normalizePreviewKeyword는 NFKC와 공백 정규화를 적용한다", () => {
  assert.equal(normalizePreviewKeyword("  ＳＥＭ　 마케팅   도구  "), "SEM 마케팅 도구");
});

test("formatVolumeRange는 정확값과 네이버의 <10 범위를 구분한다", () => {
  assert.equal(
    formatVolumeRange({ relation: "lt", min: 0, maxExclusive: 10, display: "<10" }, "ko"),
    "<10",
  );
  assert.equal(
    formatVolumeRange({ relation: "exact", min: 1234, maxExclusive: null, display: "1,234" }, "ko"),
    "1,234",
  );
  assert.equal(
    formatVolumeRange({ relation: "range", min: 100, maxExclusive: 110, display: "100–109" }, "en"),
    "100–109",
  );
});

test("formatOptionalVolume은 null 검색량을 0이 아닌 사용 불가로 표시한다", () => {
  assert.equal(formatOptionalVolume(null, "ko"), "사용 불가");
  assert.equal(formatOptionalVolume(null, "en"), "Unavailable");
});

test("buildSignupHref는 현재 키워드를 쿼리 파라미터로 보존한다", () => {
  assert.equal(
    buildSignupHref("  네이버   검색 광고 "),
    "/signup/?keyword=%EB%84%A4%EC%9D%B4%EB%B2%84+%EA%B2%80%EC%83%89+%EA%B4%91%EA%B3%A0",
  );
  assert.equal(buildSignupHref(""), "/signup/");
});

test("requestPreview는 모든 공급자가 실패한 503에서도 section report를 보존한다", async () => {
  const report = await requestPreview(
    "검색 광고",
    async () => Response.json({ data: unavailableReport }, { status: 503 }),
  );
  assert.deepEqual(report, unavailableReport);
  assert.deepEqual(summarizeReportAvailability(report), {
    liveSections: 0,
    partial: false,
    noneAvailable: true,
  });
});

test("requestPreview는 429의 retryAfter를 typed 오류로 전달한다", async () => {
  await assert.rejects(
    () =>
      requestPreview(
        "검색 광고",
        async () =>
          Response.json(
            {
              error: {
                code: "RATE_LIMITED",
                message: "무료 조회 한도",
                details: { retryAfter: 3_600 },
              },
            },
            { status: 429 },
          ),
      ),
    (error: unknown) =>
      error instanceof PreviewHttpError &&
      error.status === 429 &&
      error.retryAfterSeconds === 3_600,
  );
});

test("summarizeReportAvailability는 일부 성공을 partial로 구분한다", () => {
  const partialReport: NaverKeywordOverviewReport = {
    ...unavailableReport,
    trend: {
      status: "live",
      cache: "fresh",
      measurement: "relative",
      source: "naver-api-hub-search-trend",
      fetchedAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-11T00:00:00.000Z",
      data: { title: "검색 광고", keywords: ["검색 광고"], points: [] },
    },
  };
  assert.deepEqual(summarizeReportAvailability(partialReport), {
    liveSections: 1,
    partial: true,
    noneAvailable: false,
  });
});
