import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@/lib/api";
import { parseBacklinkTarget } from "@/server/backlinks/target";

// Regression: ISSUE-006 — IP 주소가 백링크 분석 대상으로 통과해 공급자 호출까지 진행됐음
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("백링크 대상은 공개·사설 및 축약 IPv4 주소를 모두 거부한다", () => {
  for (const target of [
    "127.0.0.1",
    "192.168.1.10",
    "8.8.8.8",
    "0177.0.0.1",
    "0x7f000001",
    "2130706433",
  ]) {
    assert.throws(
      () => parseBacklinkTarget(target, "root_domain"),
      (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
      target,
    );
  }
});
