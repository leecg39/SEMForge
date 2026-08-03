import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationAriaLabel, translateNotificationText } from "@/i18n/notifications";

// Regression: ISSUE-012 — 영어 로케일의 앱 알림 접근성 이름·메뉴·실행 결과가 한국어로 노출됨
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("알림 셸과 저장된 동적 알림을 로케일에 맞게 번역한다", () => {
  assert.equal(notificationAriaLabel("en", 2), "App notifications, 2 unread");
  assert.equal(notificationAriaLabel("ko", 2), "앱 알림, 읽지 않음 2개");
  assert.equal(translateNotificationText("en", "모두 읽음"), "Mark all as read");
  assert.equal(
    translateNotificationText("en", "Soverin 사이트 진단이 완료되었습니다"),
    "Soverin site audit completed",
  );
  assert.equal(
    translateNotificationText("en", "2개 페이지 · Site Health 0 · 오류 2건 · 경고 1건"),
    "2 pages · Site Health 0 · 2 errors · 1 warning",
  );
  assert.equal(
    translateNotificationText("en", "검색 캠페인 주간 순위 업데이트"),
    "검색 캠페인 weekly ranking update",
  );
  assert.equal(
    translateNotificationText("en", "12개 키워드 수집 완료 · 2개 실패"),
    "12 keywords collected · 2 failed",
  );
  assert.equal(translateNotificationText("ko", "알림"), "알림");
});
