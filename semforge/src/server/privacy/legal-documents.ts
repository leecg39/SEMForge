// @TASK P5-PRIVACY - Invite legal document identity from approved release manifest
// @SPEC docs/release/legal-launch-gate.md
import { createHash } from "node:crypto";

import {
  LegalReleaseConfigurationError,
  readLegalReleaseManifest,
  type LegalReleaseManifest,
} from "@/app/legal/release";

export type LegalDocumentKey = "terms" | "privacy";

export interface LegalDocumentIdentity {
  readonly key: LegalDocumentKey;
  readonly version: string;
  readonly sha256: string;
}

export interface LegalDocumentSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly items?: readonly string[];
}

export interface LegalDocumentArtifact {
  readonly key: LegalDocumentKey;
  readonly title: string;
  readonly eyebrow: string;
  readonly note: string;
  readonly effectiveDate: string;
  readonly documentVersion: string;
  readonly sections: readonly LegalDocumentSection[];
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

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const processingBasisLabels = {
  contract: "계약",
  legal_obligation: "법적 의무",
  legitimate_interests: "정당한 이익",
  consent: "동의",
  other: "기타 승인 근거",
} as const satisfies Record<
  LegalReleaseManifest["privacy"]["processingActivities"][number]["basisType"],
  string
>;

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function legalDocumentArtifactsFromManifest(manifest: LegalReleaseManifest): {
  readonly terms: LegalDocumentArtifact;
  readonly privacy: LegalDocumentArtifact;
} {
  return {
    terms: {
      key: "terms",
      title: "서비스 이용약관",
      eyebrow: "유료 비공개 베타",
      note: "이 약관은 SEMForge 이용계약에 적용되며, 이용자 개인에 대한 법률 자문을 제공하지 않습니다.",
      effectiveDate: manifest.terms.effectiveDate,
      documentVersion: manifest.release.documentVersion,
      sections: [
        {
          heading: "사업자 정보",
          paragraphs: [
            `${manifest.operator.businessName} · 대표 ${manifest.operator.representativeName}`,
            `사업자등록번호: ${manifest.operator.businessRegistrationNumber}`,
            ...(manifest.operator.mailOrderRegistration
              ? [`통신판매업 신고번호: ${manifest.operator.mailOrderRegistration.number} · 신고기관: ${manifest.operator.mailOrderRegistration.authority}`]
              : []),
            `주소: ${manifest.operator.businessAddress}`,
            `고객지원: ${manifest.operator.supportEmail} · ${manifest.operator.supportPhone}`,
          ],
        },
        {
          heading: "서비스 범위",
          paragraphs: [
            "SEMForge는 초대된 한국 SEO 대행사에 Google 검색 순위, AI Overview, Search Console, NAVER 수요 데이터를 이용한 주간 검색 가시성 리포트를 웹·PDF·이메일로 제공합니다.",
            "외부 공급자 장애나 데이터 지연이 있는 경우 확인 가능한 영역만 제공하며, 확인할 수 없는 데이터를 추정값으로 대체하지 않습니다.",
          ],
        },
        {
          heading: "계정과 이용 한도",
          paragraphs: [
            "초대는 지정 이메일에 한해 1회 사용할 수 있습니다. 기본 베타 플랜은 워크스페이스당 사이트 3개, 사이트당 순위 키워드 20개와 AI Overview 프롬프트 20개를 포함합니다.",
          ],
        },
        {
          heading: "요금과 자동결제",
          paragraphs: [
            `요금은 월 ${manifest.terms.priceKrw.toLocaleString("ko-KR")}원(VAT 포함)이며 Toss 자동결제로 청구합니다. 자동결제 인증 직후 첫 결제가 성공해야 서비스가 활성화됩니다.`,
            "취소는 현재 결제기간 말에 적용됩니다.",
          ],
        },
        {
          heading: "청약철회와 환불",
          paragraphs: [manifest.terms.withdrawalPolicy, manifest.terms.refundPolicy],
        },
        {
          heading: "허용되는 이용",
          paragraphs: [
            "이용자는 자신 또는 적법한 권한을 받은 고객 사이트만 등록해야 합니다. 계정이나 연결 토큰을 제3자와 공유하거나 서비스 안정성을 해치는 자동화 요청을 보내서는 안 됩니다.",
          ],
        },
        {
          heading: "베타 운영과 변경",
          paragraphs: [
            "베타 기간에는 기능과 일정이 조정될 수 있습니다. 데이터 보존이나 요금에 영향을 주는 중대한 변경은 적용 전에 안내합니다.",
          ],
        },
        {
          heading: "분쟁과 문의",
          paragraphs: [manifest.terms.disputeProcedure, `${manifest.operator.supportEmail} · ${manifest.operator.supportPhone}`],
        },
      ],
    },
    privacy: {
      key: "privacy",
      title: "개인정보 처리방침",
      eyebrow: "개인정보 보호 안내",
      note: "이 방침은 SEMForge의 개인정보 처리 사실을 알리기 위한 것이며, 이용자 개인에 대한 법률 자문을 제공하지 않습니다.",
      effectiveDate: manifest.privacy.effectiveDate,
      documentVersion: manifest.release.documentVersion,
      sections: [
        {
          heading: "개인정보처리자와 문의처",
          paragraphs: [
            `${manifest.operator.businessName} · 대표 ${manifest.operator.representativeName}`,
            `사업자등록번호: ${manifest.operator.businessRegistrationNumber}`,
            `주소: ${manifest.operator.businessAddress}`,
            `고객지원: ${manifest.operator.supportEmail} · ${manifest.operator.supportPhone}`,
            `개인정보 보호책임자: ${manifest.privacy.officerName} · ${manifest.privacy.contactEmail}`,
          ],
        },
        {
          heading: "처리 목적과 개인정보 항목",
          paragraphs: [
            "초대·계정 운영을 위한 이메일, 담당자 이름, 암호화된 인증 정보, 세션 및 보안 감사 기록을 처리합니다. 본인 확인, 워크스페이스 접근 제어, 결제, 고객지원과 보안 대응에 사용합니다.",
            "주간 리포트를 제공하기 위해 등록 도메인, 추적 질의, Search Console 읽기 전용 연결 토큰, 공급자 응답과 수집 시각을 처리합니다. 검색 가시성 수집, 리포트 생성·전달에만 사용합니다.",
          ],
        },
        {
          heading: "처리 근거, 필수 여부와 권리 행사",
          items: manifest.privacy.processingActivities.map((activity) => {
            const requirement = activity.requiredForService
              ? "서비스 필수 처리·필수 고지 확인"
              : "선택 처리";
            const mechanism = activity.noticeMode === "separate_optional_consent"
              ? "별도 선택 동의"
              : "처리방침 확인";
            return `${activity.category} — ${requirement}; 고지·선택 방식: ${mechanism}; 목적: ${activity.purpose}; 항목: ${activity.items}; 검토된 처리 근거 유형: ${processingBasisLabels[activity.basisType]}; 세부 근거: ${activity.lawfulBasis}; 보유 규칙: ${activity.retentionCategory}; 거부 또는 서비스 영향: ${activity.refusalOrServiceImpact}; 철회·이의·처리정지 방법: ${activity.withdrawalOrObjectionMethod}`;
          }),
        },
        {
          heading: "처리 및 보유 기간",
          items: manifest.privacy.retentionRules.map((rule) => `${rule.category}: ${rule.period} (${rule.basis})`),
        },
        { heading: "파기 절차와 방법", paragraphs: [manifest.privacy.deletionProcedure] },
        {
          heading: "처리위탁",
          items: manifest.privacy.processors.length > 0
            ? manifest.privacy.processors.map((processor) => `${processor.provider} — ${processor.purpose}; 보유·이용 기간: ${processor.retention}`)
            : ["공개할 처리위탁 내역이 없습니다."],
        },
        {
          heading: "개인정보의 제3자 제공",
          items: manifest.privacy.thirdPartyDisclosures.length > 0
            ? manifest.privacy.thirdPartyDisclosures.map((disclosure) => `${disclosure.recipient} — 목적: ${disclosure.purpose}; 항목: ${disclosure.items}; 보유·이용 기간: ${disclosure.retention}`)
            : ["공개할 개인정보 제3자 제공 내역이 없습니다."],
        },
        {
          heading: "개인정보의 국외 이전",
          items: manifest.privacy.overseasTransfers.length > 0
            ? manifest.privacy.overseasTransfers.map((transfer) => `${transfer.recipient} (${transfer.country}) — 목적: ${transfer.purpose}; 항목: ${transfer.items}; 방법·시기: ${transfer.method}, ${transfer.timing}; 보유·이용 기간: ${transfer.retention}`)
            : ["공개할 개인정보 국외 이전 내역이 없습니다."],
        },
        {
          heading: "이용자의 권리와 행사 방법",
          paragraphs: ["이용자는 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다.", manifest.privacy.rightsRequestMethod],
        },
        { heading: "안전성 확보 조치", paragraphs: [manifest.privacy.securityMeasures] },
      ],
    },
  };
}

export function legalDocumentCanonicalSubsets(manifest: LegalReleaseManifest): {
  readonly terms: JsonValue;
  readonly privacy: JsonValue;
} {
  return legalDocumentArtifactsFromManifest(manifest) as unknown as {
    readonly terms: JsonValue;
    readonly privacy: JsonValue;
  };
}

export function legalDocumentsFromManifest(manifest: LegalReleaseManifest): {
  readonly terms: LegalDocumentIdentity;
  readonly privacy: LegalDocumentIdentity;
} {
  const subsets = legalDocumentCanonicalSubsets(manifest);
  return {
    terms: {
      key: "terms",
      version: manifest.release.documentVersion,
      sha256: sha256(canonicalJson(subsets.terms)),
    },
    privacy: {
      key: "privacy",
      version: manifest.release.documentVersion,
      sha256: sha256(canonicalJson(subsets.privacy)),
    },
  };
}

export function currentLegalDocuments(
  source: Record<string, string | undefined> = process.env,
): {
  readonly terms: LegalDocumentIdentity;
  readonly privacy: LegalDocumentIdentity;
} {
  const manifest = readLegalReleaseManifest(source);
  if (!manifest) {
    throw new LegalReleaseConfigurationError([
      "LEGAL_RELEASE_MANIFEST is required for invite legal consent",
    ]);
  }
  return legalDocumentsFromManifest(manifest);
}

export function requireCurrentLegalAcceptance(
  input: LegalAcceptanceInput,
  source: Record<string, string | undefined> = process.env,
): VerifiedLegalAcceptance {
  if (!input.accepted) throw new Error("LEGAL_CONSENT_REQUIRED");
  const presentedAt = input.presentedAt instanceof Date
    ? input.presentedAt
    : new Date(input.presentedAt);
  if (Number.isNaN(presentedAt.getTime())) throw new Error("LEGAL_CONSENT_INVALID_TIME");
  const documents = currentLegalDocuments(source);
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
