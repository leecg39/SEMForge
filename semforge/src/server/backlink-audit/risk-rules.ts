import type { AuditRiskLevel, AuditSignal, AuditStatus } from "@/server/backlink-audit/contracts";

export const BACKLINK_AUDIT_RULESET_VERSION = "2026-08-v1";

export interface AuditRiskInput {
  auditStatus: AuditStatus;
  targetStatus: number | null;
  sourceDomain: string;
  providerAnchor: string | null;
  observedAnchor: string | null;
  domainLinkCount: number;
  anchorOccurrenceCount: number;
  domainDistinctAnchorCount: number;
}

export interface AuditRiskResult {
  riskLevel: AuditRiskLevel;
  riskScore: number;
  confidence: "low" | "medium" | "high";
  signals: AuditSignal[];
}

/**
 * 외부 사업자의 비공개 독성 점수를 흉내 내지 않는 설명 가능한 검토 우선순위 규칙.
 * 차단/타임아웃은 위험으로 간주하지 않고 unscored로 남긴다.
 */
export function assessBacklinkRisk(input: AuditRiskInput): AuditRiskResult {
  if (input.auditStatus === "unavailable" || input.auditStatus === "unverified") {
    return { riskLevel: "unscored", riskScore: 0, confidence: "low", signals: [] };
  }

  const signals: AuditSignal[] = [];
  if (input.auditStatus === "missing") {
    signals.push({
      code: "source_link_missing",
      label: "출처에서 링크를 찾을 수 없음",
      severity: "notice",
      weight: 10,
      evidence: "출처 페이지는 열렸지만 현재 HTML에 대상 링크가 없습니다.",
    });
  }
  if (input.targetStatus !== null && input.targetStatus >= 400) {
    signals.push({
      code: "target_http_error",
      label: "대상 페이지 HTTP 오류",
      severity: input.targetStatus >= 500 ? "high" : "warning",
      weight: 30,
      evidence: `대상 페이지가 HTTP ${input.targetStatus}를 반환했습니다.`,
    });
  }
  if (input.domainLinkCount >= 50) {
    signals.push({
      code: "domain_concentration",
      label: "동일 출처 도메인 링크 집중",
      severity: input.domainLinkCount >= 200 ? "high" : "warning",
      weight: input.domainLinkCount >= 200 ? 35 : 25,
      evidence: `${input.sourceDomain}에서 ${input.domainLinkCount.toLocaleString()}개의 링크가 확인됐습니다.`,
    });
  }
  const anchor = (input.observedAnchor ?? input.providerAnchor ?? "").trim();
  if (anchor && input.anchorOccurrenceCount >= 10 && input.domainDistinctAnchorCount <= 2) {
    signals.push({
      code: "repeated_anchor",
      label: "반복 앵커 패턴",
      severity: input.anchorOccurrenceCount >= 50 ? "high" : "warning",
      weight: input.anchorOccurrenceCount >= 50 ? 30 : 20,
      evidence: `같은 출처 도메인에서 유사 앵커가 ${input.anchorOccurrenceCount.toLocaleString()}회 반복됩니다.`,
    });
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const riskLevel: AuditRiskLevel = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return {
    riskLevel,
    riskScore: score,
    confidence: input.auditStatus === "active" ? "high" : "medium",
    signals,
  };
}
