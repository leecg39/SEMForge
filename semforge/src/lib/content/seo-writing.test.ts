import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSeoWriting } from "./seo-writing";

test("SEO 작성 분석은 입력 원문에서 단어·문장·키워드 사용량을 직접 계산한다", () => {
  const analysis = analyzeSeoWriting({
    title: "실제 SEO 콘텐츠 작성 가이드",
    body: "SEO 콘텐츠는 검색 의도를 설명합니다. 독자가 이해할 수 있는 문장을 씁니다.",
    keywords: ["SEO 콘텐츠"],
  });
  assert.equal(analysis.wordCount, 11);
  assert.equal(analysis.sentenceCount, 2);
  assert.equal(analysis.keywordOccurrences, 1);
  assert.equal(analysis.checks.find((check) => check.key === "keywordTitle")?.passed, true);
});

test("빈 원문은 점수와 밀도를 부풀리지 않는다", () => {
  const analysis = analyzeSeoWriting({ title: "", body: "", keywords: [] });
  assert.equal(analysis.score, 0);
  assert.equal(analysis.wordCount, 0);
  assert.equal(analysis.keywordDensity, 0);
});
