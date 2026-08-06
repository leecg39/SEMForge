import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NaverAdvertisingHandoffNotice } from "./NaverAdvertisingHandoffNotice";

test("NAVER handoff 안내는 provenance, 광고 통계, 수동 검토 경계를 접근 가능하게 표시한다", () => {
  const html = renderToStaticMarkup(
    <NaverAdvertisingHandoffNotice
      ko
      handoff={{
        keywords: ["검색 광고", "콘텐츠 마케팅"],
        providerSource: "naver-search-ads",
        fetchedAt: "2026-08-04T00:00:00.000Z",
        measurement: "absolute",
        adStats: {
          monthlyTotalQueries: "100–109",
          competition: "높음",
        },
      }}
    />,
  );

  assert.match(html, /aria-labelledby="naver-ad-handoff-title"/);
  assert.match(html, /id="naver-ad-handoff-guidance"/);
  assert.match(html, /NAVER Search Ads에서 전달됨/);
  assert.match(html, /합계 월간 검색수/);
  assert.match(html, /100–109/);
  assert.match(html, /광고 경쟁도/);
  assert.match(html, /캠페인은 자동 생성되지 않습니다/);
  assert.match(html, /자연검색 난이도 또는 경쟁사 광고 이력/);
});
