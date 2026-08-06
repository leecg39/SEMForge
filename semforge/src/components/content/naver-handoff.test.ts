// @TASK NAVER-P0-CONTENT-HANDOFF - NAVER 키워드 콘텐츠 브리프 전달 계약
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/content/naver-handoff.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNaverContentHandoff } from "@/components/content/naver-handoff";
import { translateContentText } from "@/i18n/content";

test("NAVER 탐색기 쿼리는 대표·연관 키워드와 provenance를 편집 가능한 브리프로 만든다", () => {
  const params = new URLSearchParams({
    intent: "brief",
    source: "naver-keyword-explorer",
    keyword: "  검색   광고  ",
    inferredIntent: "commercial",
    naverSource: "naver-search-ads",
    naverFetchedAt: "2026-08-04T00:00:00.000Z",
    naverTrend: "최근 12개월 상대 지수 42 → 67",
  });
  params.append("keyword", "SEO");
  params.append("naverBlogTitle", "검색광고 운영 가이드");
  params.append("naverBlogTitle", "소상공인 SEO 체크리스트");

  const handoff = parseNaverContentHandoff(params);

  assert.ok(handoff);
  assert.equal(handoff.primaryKeyword, "검색 광고");
  assert.deepEqual(handoff.keywords, ["검색 광고", "SEO"]);
  assert.equal(handoff.inferredIntent, "commercial");
  assert.equal(handoff.naverSourceLabel, "NAVER Search Ads");
  assert.equal(handoff.naverFetchedAt, "2026-08-04T00:00:00.000Z");
  assert.match(handoff.prefill, /핵심 키워드: 검색 광고/);
  assert.match(handoff.prefill, /함께 선택한 키워드: SEO/);
  assert.match(handoff.prefill, /추론 검색 의도: 상업 조사/);
  assert.match(handoff.prefill, /상대 검색 추이/);
  assert.match(handoff.prefill, /네이버 블로그 검색 API 응답 제목/);
  assert.match(handoff.prefill, /출처: NAVER Search Ads/);
  assert.match(handoff.prefill, /자동 게시하지 말고/);
});

test("복수 키워드는 NFKC 정규화·중복 제거 후 20개로 제한한다", () => {
  const params = new URLSearchParams({
    intent: "brief",
    source: "naver-keyword-overview",
  });
  params.append("keyword", "ＳＥＯ");
  params.append("keyword", "SEO");
  for (let index = 0; index < 30; index += 1) params.append("keyword", `키워드 ${index}`);

  const handoff = parseNaverContentHandoff(params);

  assert.ok(handoff);
  assert.equal(handoff.keywords[0], "SEO");
  assert.equal(handoff.keywords.length, 20);
  assert.equal(handoff.omittedKeywordCount, 11);
});

test("미인증 source·일반 글쓰기·키워드 누락은 NAVER 공식 전달로 취급하지 않는다", () => {
  assert.equal(parseNaverContentHandoff(new URLSearchParams("intent=brief&source=external&keyword=SEO")), null);
  assert.equal(parseNaverContentHandoff(new URLSearchParams("intent=create&source=naver-keyword-explorer&keyword=SEO")), null);
  assert.equal(parseNaverContentHandoff(new URLSearchParams("intent=brief&source=naver-keyword-explorer")), null);
});

test("임의 provenance·추론 intent·제어 문자를 표시하지 않고 안전한 값만 보존한다", () => {
  const params = new URLSearchParams({
    intent: "brief",
    source: "naver-keyword-explorer",
    keyword: "SEO\u0000\n 전략",
    inferredIntent: "definitely-official",
    naverSource: "<script>alert(1)</script>",
    naverFetchedAt: "not-a-date",
    naverTrend: "\u0000\u0007  상대   지수 ",
  });
  params.append("naverBlogTitle", "  블로그\n  제목  ");

  const handoff = parseNaverContentHandoff(params);

  assert.ok(handoff);
  assert.equal(handoff.primaryKeyword, "SEO 전략");
  assert.equal(handoff.inferredIntent, null);
  assert.equal(handoff.naverSourceLabel, "NAVER Search Ads");
  assert.equal(handoff.naverFetchedAt, null);
  assert.equal(handoff.naverTrend, "상대 지수");
  assert.deepEqual(handoff.naverBlogTitles, ["블로그 제목"]);
  assert.doesNotMatch(handoff.prefill, /script|alert/iu);
});

test("영어 locale은 provenance를 보존하면서 영어 콘텐츠 브리프를 생성한다", () => {
  const params = new URLSearchParams({
    intent: "brief",
    source: "naver-keyword-explorer",
    keyword: "search advertising",
    inferredIntent: "commercial",
    naverTrend: "relative index 42 to 67",
    naverFetchedAt: "2026-08-04T00:00:00.000Z",
  });
  params.append("keyword", "SEO");
  params.append("naverBlogTitle", "Search advertising operations guide");

  const handoff = parseNaverContentHandoff(params, "en");

  assert.ok(handoff);
  assert.equal(handoff.inferredIntentLabel, "Commercial investigation");
  assert.match(handoff.prefill, /Primary keyword: search advertising/);
  assert.match(handoff.prefill, /Also selected keywords: SEO/);
  assert.match(handoff.prefill, /Inferred search intent: Commercial investigation/);
  assert.match(handoff.prefill, /NAVER relative search trend: relative index 42 to 67/);
  assert.match(handoff.prefill, /NAVER Blog Search API response titles \(not integrated-search rankings\)/);
  assert.match(handoff.prefill, /Source: NAVER Search Ads/);
  assert.match(handoff.prefill, /Do not publish automatically/);
  assert.doesNotMatch(handoff.prefill, /핵심 키워드|자동 게시/);
});

test("NAVER handoff 표시 문구는 기존 content tx 흐름에서 영어로 번역된다", () => {
  assert.equal(translateContentText("en", "NAVER 공식 데이터에서 전달됨"), "Passed from official NAVER data");
  assert.equal(translateContentText("en", "공식 응답 · 추정값 임의 생성 안 함"), "Official response · no fabricated estimates");
  assert.equal(
    translateContentText("en", "아래 브리프 입력에 복사했습니다. 자유롭게 수정한 뒤 버튼을 눌러야 작업판이 생성되며, 자동 게시는 하지 않습니다."),
    "This information was copied into the brief below. Edit it freely, then press the button to create a workspace. Nothing is published automatically.",
  );
});
