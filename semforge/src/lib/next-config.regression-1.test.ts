import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../../next.config";

// Regression: ISSUE-002 — 127.0.0.1에서 개발 클라이언트가 수화되지 않아 모든 버튼이 정적 폼처럼 동작
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("로컬 앱 브라우저가 사용하는 loopback 호스트를 개발 리소스 원본으로 허용한다", () => {
  assert.ok(nextConfig.allowedDevOrigins?.includes("127.0.0.1"));
});
