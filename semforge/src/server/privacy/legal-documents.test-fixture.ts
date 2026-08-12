export const approvedLegalReleaseManifest = JSON.stringify({
  schemaVersion: 1,
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
    priceKrw: 49_000,
    vatIncluded: true,
    billingPeriod: "monthly",
    cancellationTiming: "end_of_current_period",
    refundPolicy: "중복·오류 결제와 법정 환불 사유를 확인한 뒤 처리합니다.",
    withdrawalPolicy: "관련 법령상 청약철회 가능 여부와 절차를 개별 안내합니다.",
    disputeProcedure: "고객지원 문의 후 합의가 되지 않으면 관할 절차를 따릅니다.",
  },
});

export const approvedLegalReleaseSource = {
  LEGAL_RELEASE_MANIFEST: approvedLegalReleaseManifest,
};
