import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KeywordInputError,
  normalizeKeyword,
  normalizeKeywordSeeds,
} from "@/server/naver-keywords/normalization";

test("키워드는 NFKC 정규화 후 양끝과 연속 공백을 정리한다", () => {
  assert.equal(normalizeKeyword("  ＳＥＭ\u3000 분석 \n 도구  "), "SEM 분석 도구");
});

test("빈 키워드와 80자를 넘는 키워드를 거부한다", () => {
  assert.throws(() => normalizeKeyword(" \n\t "), KeywordInputError);
  assert.throws(() => normalizeKeyword("가".repeat(81)), KeywordInputError);
  assert.equal(normalizeKeyword("가".repeat(80)).length, 80);
});

test("탐색 seed는 정규화 뒤 중복 제거하며 1~5개만 허용한다", () => {
  assert.deepEqual(
    normalizeKeywordSeeds([" 네이버 광고 ", "네이버\u3000광고", "SEO"]),
    ["네이버 광고", "SEO"],
  );
  assert.throws(() => normalizeKeywordSeeds([]), KeywordInputError);
  assert.throws(
    () => normalizeKeywordSeeds(["1", "2", "3", "4", "5", "6"]),
    KeywordInputError,
  );
});
