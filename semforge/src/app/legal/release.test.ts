// @TASK P5-L1-T1 - Paid beta legal release manifest contract
// @SPEC docs/release/legal-launch-gate.md
// @TEST src/app/legal/release.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LegalReleaseConfigurationError,
  parseLegalReleaseManifest,
} from "@/app/legal/release";

export const approvedLegalReleaseManifest = JSON.stringify({
  schemaVersion: 2,
  release: {
    status: "approved",
    documentVersion: "2026-08-12.1",
    approvedAt: "2026-08-12T09:00:00+09:00",
    approvedBy: "법무 검토 책임자",
    attestation: "paid-beta-legal-review-approved",
  },
  operator: {
    businessName: "검증용 주식회사",
    representativeName: "검증 책임자",
    businessRegistrationNumber: "123-45-67890",
    mailOrderRegistration: {
      number: "제2026-검증-0001호",
      authority: "검증구청",
    },
    businessAddress: "서울특별시 검증구 검증로 100",
    supportEmail: "support@approved-fixture.co.kr",
    supportPhone: "02-1234-5678",
  },
  privacy: {
    effectiveDate: "2026-08-19",
    officerName: "개인정보 보호책임자",
    contactEmail: "privacy@approved-fixture.co.kr",
    rightsRequestMethod: "개인정보 문의 이메일로 본인 확인 후 요청합니다.",
    deletionProcedure: "목적 달성 후 복구할 수 없는 방식으로 지체 없이 파기합니다.",
    securityMeasures: "접근 권한 통제, 전송구간 보호, 암호화와 감사 로그를 운영합니다.",
    retentionRules: [
      {
        category: "계정 정보",
        period: "계약 종료 후 30일",
        basis: "계약 이행 및 분쟁 대응",
      },
    ],
    processingActivities: [
      {
        category: "계정 및 접근 제어",
        requiredForService: true,
        noticeMode: "required_notice_acknowledgement",
        basisType: "contract",
        purpose: "초대된 이용자의 계정 생성과 워크스페이스 접근 제어",
        items: "이메일, 담당자 이름, 인증 및 세션 식별자",
        lawfulBasis: "법률 검토로 승인된 서비스 계약 이행 근거",
        retentionCategory: "계정 정보",
        refusalOrServiceImpact: "필수 항목을 제공하지 않으면 계정 기반 서비스를 제공할 수 없습니다.",
        withdrawalOrObjectionMethod: "개인정보 문의 이메일로 적용 가능한 처리정지 또는 이의 요청을 접수합니다.",
      },
    ],
    processors: [
      {
        provider: "검토 완료 위탁사",
        purpose: "주간 리포트 전달",
        retention: "위탁 목적 달성 또는 계약 종료 시까지",
      },
    ],
    thirdPartyDisclosures: [],
    overseasTransfers: [],
  },
  terms: {
    effectiveDate: "2026-08-19",
    priceKrw: 49000,
    vatIncluded: true,
    billingPeriod: "monthly",
    cancellationTiming: "end_of_current_period",
    refundPolicy: "중복·오류 결제와 법정 환불 사유를 확인한 뒤 처리합니다.",
    withdrawalPolicy: "관련 법령상 청약철회 가능 여부와 절차를 개별 안내합니다.",
    disputeProcedure: "고객지원 문의 후 합의가 되지 않으면 관할 절차를 따릅니다.",
  },
});

test("승인된 manifest는 공개 고지에 필요한 구조화된 운영 사실을 반환한다", () => {
  const manifest = parseLegalReleaseManifest(approvedLegalReleaseManifest);

  assert.equal(manifest.release.status, "approved");
  assert.equal(manifest.operator.businessRegistrationNumber, "123-45-67890");
  assert.equal(manifest.privacy.retentionRules[0]?.category, "계정 정보");
  assert.deepEqual(manifest.privacy.thirdPartyDisclosures, []);
  assert.deepEqual(manifest.privacy.overseasTransfers, []);
  assert.equal(manifest.terms.priceKrw, 49_000);
  assert.equal(manifest.terms.vatIncluded, true);
});

test("manifest 누락·손상·미승인 상태는 법률 출시 게이트를 통과하지 못한다", () => {
  assert.throws(
    () => parseLegalReleaseManifest(undefined),
    (error: unknown) => {
      assert.ok(error instanceof LegalReleaseConfigurationError);
      assert.deepEqual(error.issues, ["LEGAL_RELEASE_MANIFEST is required"]);
      return true;
    },
  );
  assert.throws(
    () => parseLegalReleaseManifest("{"),
    (error: unknown) => {
      assert.ok(error instanceof LegalReleaseConfigurationError);
      assert.deepEqual(error.issues, ["LEGAL_RELEASE_MANIFEST must be valid JSON"]);
      return true;
    },
  );

  const draft = JSON.parse(approvedLegalReleaseManifest) as Record<string, unknown> & {
    release: Record<string, unknown>;
  };
  draft.release.status = "draft";
  assert.throws(() => parseLegalReleaseManifest(JSON.stringify(draft)),
    LegalReleaseConfigurationError);

  const legacy = JSON.parse(approvedLegalReleaseManifest) as Record<string, unknown>;
  legacy.schemaVersion = 1;
  assert.throws(() => parseLegalReleaseManifest(JSON.stringify(legacy)),
    LegalReleaseConfigurationError);
});

test("placeholder와 실제 서비스 계약에 어긋나는 가격은 승인으로 위장할 수 없다", () => {
  const placeholder = JSON.parse(approvedLegalReleaseManifest) as {
    operator: { businessName: string };
    terms: { priceKrw: number };
  };
  placeholder.operator.businessName = "추후 확정";
  assert.throws(
    () => parseLegalReleaseManifest(JSON.stringify(placeholder)),
    (error: unknown) => {
      assert.ok(error instanceof LegalReleaseConfigurationError);
      assert.ok(error.issues.some((issue) => issue.includes("operator.businessName")));
      return true;
    },
  );

  const wrongPrice = JSON.parse(approvedLegalReleaseManifest) as {
    terms: { priceKrw: number };
  };
  wrongPrice.terms.priceKrw = 39_000;
  assert.throws(() => parseLegalReleaseManifest(JSON.stringify(wrongPrice)),
    LegalReleaseConfigurationError);
});

test("처리 활동은 서비스 필수 여부와 권리 행사 방법을 명시하고 승인된 보유 항목에 연결한다", () => {
  const candidate = JSON.parse(approvedLegalReleaseManifest) as {
    privacy: {
      processingActivities?: Array<{
        category: string;
        requiredForService: boolean;
        noticeMode: "required_notice_acknowledgement" | "separate_optional_consent";
        basisType: "contract" | "legal_obligation" | "legitimate_interests" | "consent" | "other";
        purpose: string;
        items: string;
        lawfulBasis: string;
        retentionCategory: string;
        refusalOrServiceImpact: string;
        withdrawalOrObjectionMethod: string;
      }>;
    };
  };
  candidate.privacy.processingActivities = [
    {
      category: "계정 및 접근 제어",
      requiredForService: true,
      noticeMode: "required_notice_acknowledgement",
      basisType: "contract",
      purpose: "초대된 이용자의 계정 생성과 워크스페이스 접근 제어",
      items: "이메일, 담당자 이름, 인증 및 세션 식별자",
      lawfulBasis: "법률 검토로 승인된 서비스 계약 이행 근거",
      retentionCategory: "계정 정보",
      refusalOrServiceImpact: "필수 항목을 제공하지 않으면 계정 기반 서비스를 제공할 수 없습니다.",
      withdrawalOrObjectionMethod: "개인정보 문의 이메일로 적용 가능한 처리정지 또는 이의 요청을 접수합니다.",
    },
  ];

  const parsed = parseLegalReleaseManifest(JSON.stringify(candidate));
  assert.equal(parsed.privacy.processingActivities[0]?.requiredForService, true);

  candidate.privacy.processingActivities[0]!.retentionCategory = "승인되지 않은 보유 항목";
  assert.throws(
    () => parseLegalReleaseManifest(JSON.stringify(candidate)),
    (error: unknown) => {
      assert.ok(error instanceof LegalReleaseConfigurationError);
      assert.ok(error.issues.some((issue) => issue.includes("retentionCategory")));
      return true;
    },
  );
});
