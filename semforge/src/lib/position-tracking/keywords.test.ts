import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TRACKING_KEYWORDS,
  mergeSetupKeywords,
  parseKeywordCsv,
  parseKeywordText,
} from "@/lib/position-tracking/keywords";

test("줄바꿈·쉼표 입력을 정리하고 대소문자 중복을 제거한다", () => {
  assert.deepEqual(parseKeywordText("SEO, seo\n  검색   최적화 ", ["공통"]), [
    { keyword: "SEO", tags: ["공통"] },
    { keyword: "검색 최적화", tags: ["공통"] },
  ]);
});

test("UTF-8 BOM CSV와 quoted comma, 개별 태그를 읽는다", () => {
  assert.deepEqual(parseKeywordCsv('\uFEFFkeyword,tags\n"seo, tool","제품|영문"\n검색 최적화,"국문;핵심"'), [
    { keyword: "seo, tool", tags: ["제품", "영문"] },
    { keyword: "검색 최적화", tags: ["국문", "핵심"] },
  ]);
});

test("합칠 때 중복 태그를 보존하며 20개 제한을 넘지 않는다", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ keyword: `keyword ${index}`, tags: [] }));
  const merged = mergeSetupKeywords(
    [{ keyword: "SEO", tags: ["기존"] }],
    [{ keyword: "seo", tags: ["신규"] }, ...rows],
  );
  assert.equal(merged.length, MAX_TRACKING_KEYWORDS);
  assert.deepEqual(merged[0], { keyword: "SEO", tags: ["기존", "신규"] });
});
