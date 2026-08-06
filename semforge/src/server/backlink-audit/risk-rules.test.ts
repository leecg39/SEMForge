import assert from "node:assert/strict";
import test from "node:test";
import { assessBacklinkRisk } from "@/server/backlink-audit/risk-rules";

test("확인 불가는 위험으로 오판하지 않는다", () => {
  const result = assessBacklinkRisk({
    auditStatus: "unavailable", targetStatus: null, sourceDomain: "blocked.example",
    providerAnchor: null, observedAnchor: null, domainLinkCount: 500,
    anchorOccurrenceCount: 500, domainDistinctAnchorCount: 1,
  });
  assert.equal(result.riskLevel, "unscored");
  assert.equal(result.riskScore, 0);
  assert.deepEqual(result.signals, []);
});

test("대상 오류·도메인 집중·반복 앵커를 근거와 함께 합산한다", () => {
  const result = assessBacklinkRisk({
    auditStatus: "active", targetStatus: 404, sourceDomain: "network.example",
    providerAnchor: "cheap widgets", observedAnchor: "cheap widgets", domainLinkCount: 230,
    anchorOccurrenceCount: 90, domainDistinctAnchorCount: 1,
  });
  assert.equal(result.riskLevel, "high");
  assert.equal(result.riskScore, 95);
  assert.deepEqual(result.signals.map((signal) => signal.code), ["target_http_error", "domain_concentration", "repeated_anchor"]);
});
