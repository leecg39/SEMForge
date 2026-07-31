import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "@/lib/analytics/intent";

test("구매/할인 패턴은 transactional 로 분류하고 근거를 남긴다", () => {
  const result = classifyIntent({ keyword: "커피 머신 최저가 구매" });
  assert.equal(result.intent, "transactional");
  assert.equal(result.model, "clone-intent-v1");
  assert.ok(
    result.evidence.some((item) => item.rule === "keyword-pattern" && item.match === "구매")
  );
});

test("추천/비교/리뷰 패턴은 commercial 로 분류한다", () => {
  assert.equal(classifyIntent({ keyword: "커피 머신 추천" }).intent, "commercial");
  assert.equal(classifyIntent({ keyword: "best coffee machine" }).intent, "commercial");
});

test("transactional 이 commercial 보다 우선한다", () => {
  const result = classifyIntent({ keyword: "커피 머신 추천 할인" });
  assert.equal(result.intent, "transactional");
});

test("로그인/공식 패턴은 navigational 로 분류한다", () => {
  assert.equal(classifyIntent({ keyword: "네이버 로그인" }).intent, "navigational");
  assert.equal(classifyIntent({ keyword: "starbucks official website" }).intent, "navigational");
});

test("질문형 패턴은 informational 근거와 함께 분류한다", () => {
  const result = classifyIntent({ keyword: "에스프레소 추출 방법" });
  assert.equal(result.intent, "informational");
  assert.ok(result.evidence.length > 0);
});

test("영어 패턴은 단어 경계로 매칭한다 (asbestos ≠ best)", () => {
  const result = classifyIntent({ keyword: "asbestos removal" });
  assert.equal(result.intent, "informational");
  assert.ok(!result.evidence.some((item) => item.match === "best"));
});

test("키워드 패턴이 없으면 SERP 피처를 보조 신호로 사용한다", () => {
  const result = classifyIntent({
    keyword: "캡슐 커피 머신",
    serpFeatures: ["shopping", "people_also_ask"],
  });
  assert.equal(result.intent, "commercial");
  assert.ok(
    result.evidence.some((item) => item.rule === "serp-feature" && item.match === "shopping")
  );
});

test("아무 신호도 없으면 informational 기본값 (근거 없음)", () => {
  const result = classifyIntent({ keyword: "제주도 날씨" });
  assert.equal(result.intent, "informational");
  assert.deepEqual(result.evidence, []);
});

test("키워드 패턴이 피처 신호보다 우선한다", () => {
  const result = classifyIntent({
    keyword: "커피 머신 구매",
    serpFeatures: ["people_also_ask"],
  });
  assert.equal(result.intent, "transactional");
});
