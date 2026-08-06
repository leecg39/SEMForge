import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeSignupRestoreKeyword,
  signupSuccessHref,
} from "@/components/templates/auth-restore";

test("가입 복원 키워드는 NFKC·공백 정규화 후 탐색기로 안전하게 전달된다", () => {
  assert.equal(normalizeSignupRestoreKeyword("  ＮＡＶＥＲ\u3000광고  "), "NAVER 광고");
  assert.equal(
    signupSuccessHref("  ＮＡＶＥＲ\u3000광고  "),
    "/analytics/keywordmagic/?keyword=NAVER+%EA%B4%91%EA%B3%A0",
  );
});

test("누락·과도한 가입 복원 값은 홈으로 fail closed한다", () => {
  assert.equal(signupSuccessHref(undefined), "/home/");
  assert.equal(signupSuccessHref("가".repeat(81)), "/home/");
  assert.equal(signupSuccessHref("hello\u0000world"), "/home/");
});
