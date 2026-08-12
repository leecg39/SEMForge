// @TASK P5-PRIVACY - Final beta legal document identity used at invite acceptance
// @SPEC paid-beta privacy lifecycle blockers
import { createHash } from "node:crypto";

export type LegalDocumentKey = "terms" | "privacy";

export interface LegalDocumentIdentity {
  readonly key: LegalDocumentKey;
  readonly version: string;
  readonly sha256: string;
}

export interface LegalAcceptanceInput {
  readonly termsVersion: string;
  readonly termsSha256: string;
  readonly privacyVersion: string;
  readonly privacySha256: string;
  readonly presentedAt: Date | string;
  readonly accepted?: boolean;
}

export interface VerifiedLegalAcceptance {
  readonly termsVersion: string;
  readonly termsSha256: string;
  readonly privacyVersion: string;
  readonly privacySha256: string;
  readonly presentedAt: Date;
}

const TERMS_TEXT = [
  "SEMForge paid beta terms beta-final-2026-08-12.",
  "초대받은 한국 SEO 대행사에 주간 검색 가시성 리포트만 제공합니다.",
  "월 49,000원(VAT 포함) Toss 자동결제 성공 후 활성화됩니다.",
  "워크스페이스당 사이트 3개, 사이트당 Google 순위 키워드 20개와 AIO 프롬프트 20개로 제한합니다.",
  "외부 공급자 장애와 지연 데이터는 추정하지 않고 확인 불가로 표시합니다.",
  "취소는 기간 말 적용을 기본으로 하며 법정 환불과 차지백 처리를 우선합니다.",
].join("\n");

const PRIVACY_TEXT = [
  "SEMForge paid beta privacy notice beta-final-2026-08-12.",
  "초대, 계정, 세션, 결제, Search Console 연결, 사이트, 추적 질의, 리포트 전달에 필요한 정보를 처리합니다.",
  "Google Search Console, TalorData, NAVER, Toss Payments, Resend, S3 호환 저장소를 processor로 사용할 수 있습니다.",
  "운영자 검증 DSAR 절차로 export, correction, deletion을 처리하고 각 단계와 실패를 감사 로그에 남깁니다.",
  "법정 보존 또는 결제 분쟁에 필요한 billing ledger는 원문 식별자를 제거한 tombstone 형태로 분리 보존합니다.",
  "베타 기본 보존 기간은 정책값이며 법률상 확정 기간이 아니고 환경별로 조정할 수 있습니다.",
].join("\n");

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const documents = {
  terms: {
    key: "terms",
    version: "beta-final-2026-08-12",
    sha256: sha256(TERMS_TEXT),
  },
  privacy: {
    key: "privacy",
    version: "beta-final-2026-08-12",
    sha256: sha256(PRIVACY_TEXT),
  },
} as const satisfies Record<LegalDocumentKey, LegalDocumentIdentity>;

export function currentLegalDocuments(): {
  readonly terms: LegalDocumentIdentity;
  readonly privacy: LegalDocumentIdentity;
} {
  return documents;
}

export function requireCurrentLegalAcceptance(
  input: LegalAcceptanceInput,
): VerifiedLegalAcceptance {
  if (!input.accepted) throw new Error("LEGAL_CONSENT_REQUIRED");
  const presentedAt = input.presentedAt instanceof Date
    ? input.presentedAt
    : new Date(input.presentedAt);
  if (Number.isNaN(presentedAt.getTime())) throw new Error("LEGAL_CONSENT_INVALID_TIME");
  if (
    input.termsVersion !== documents.terms.version ||
    input.termsSha256 !== documents.terms.sha256 ||
    input.privacyVersion !== documents.privacy.version ||
    input.privacySha256 !== documents.privacy.sha256
  ) {
    throw new Error("LEGAL_CONSENT_MISMATCH");
  }
  return {
    termsVersion: documents.terms.version,
    termsSha256: documents.terms.sha256,
    privacyVersion: documents.privacy.version,
    privacySha256: documents.privacy.sha256,
    presentedAt,
  };
}
