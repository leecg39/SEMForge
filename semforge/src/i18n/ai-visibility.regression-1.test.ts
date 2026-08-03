import assert from "node:assert/strict";
import { test } from "node:test";
import { translateAiVisibilityText } from "@/i18n/ai-visibility";
import { translateSiteText } from "@/i18n/site";

// Regression: ISSUE-011 — 영어 AI 가시성 본문과 한국어 툴킷 내비게이션이 서로 다른 언어로 남았음
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("AI 가시성의 정적·동적 카피와 툴킷 내비게이션을 로케일에 맞게 번역한다", () => {
  assert.equal(translateAiVisibilityText("en", "지금 수집"), "Collect now");
  assert.equal(
    translateAiVisibilityText("en", "실제 추적 12건을 완료했습니다."),
    "Completed 12 measured tracking items.",
  );
  assert.equal(
    translateAiVisibilityText("en", "Google AI 개요 노출 보강"),
    "Improve visibility on Google AI Overview",
  );
  assert.equal(
    translateAiVisibilityText("en", "측정 가능한 최신 셀 9개를 기준으로 계산했습니다."),
    "Calculated from 9 measurable cells in the latest collection.",
  );
  assert.equal(translateAiVisibilityText("ko", "지금 수집"), "지금 수집");
  assert.equal(translateAiVisibilityText("en", "사용자 프롬프트"), "사용자 프롬프트");

  assert.equal(translateSiteText("ko", "Visibility Overview"), "가시성 개요");
  assert.equal(translateSiteText("ko", "Prompt Research"), "프롬프트 리서치");
  assert.equal(translateSiteText("en", "Prompt Research"), "Prompt Research");
});
