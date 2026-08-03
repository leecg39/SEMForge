import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialBacklinkSort } from "@/components/analytics/backlinks/list-state";

// Regression: ISSUE-005 — 탭 전환 시 이전 데이터셋 정렬값이 남아 목록 API가 400을 반환
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md
test("새 백링크 데이터셋에서 지원하지 않는 이전 탭 정렬값은 기본값으로 되돌린다", () => {
  assert.equal(resolveInitialBacklinkSort("ref_domains", "page_score"), "backlinks_count");
  assert.equal(resolveInitialBacklinkSort("anchors", "domain_score"), "domains_count");
  assert.equal(resolveInitialBacklinkSort("pages", "domains_count"), "domains_count");
});
