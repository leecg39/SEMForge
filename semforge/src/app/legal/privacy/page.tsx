// @TASK P5-L1-T1 - Runtime-bound privacy notice
// @SPEC docs/release/legal-launch-gate.md
import type { Metadata } from "next";

import { readLegalReleaseManifest } from "@/app/legal/release";
import { PublicShell } from "@/components/core-shell/public-shell";

export const metadata: Metadata = { title: "개인정보 처리방침" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const manifest = readLegalReleaseManifest();

  if (!manifest) {
    return (
      <PublicShell>
        <article className="sf-legal">
          <header>
            <p className="sf-eyebrow">출시 전 안내</p>
            <h1>개인정보 처리방침</h1>
          </header>
          <aside role="alert">
            개인정보 처리방침이 아직 승인·공개되지 않았습니다. 이 상태에서는 유료 비공개
            베타의 웹 런타임과 자동결제를 시작할 수 없습니다.
          </aside>
        </article>
      </PublicShell>
    );
  }

  const { operator, privacy, release } = manifest;
  return (
    <PublicShell>
      <article className="sf-legal">
        <header>
          <p className="sf-eyebrow">개인정보 보호 안내</p>
          <h1>개인정보 처리방침</h1>
          <p>시행일: {privacy.effectiveDate} · 문서 버전: {release.documentVersion}</p>
        </header>
        <aside role="note">
          이 방침은 SEMForge의 개인정보 처리 사실을 알리기 위한 것이며, 이용자 개인에 대한
          법률 자문을 제공하지 않습니다.
        </aside>

        <section>
          <h2>개인정보처리자와 문의처</h2>
          <p>{operator.businessName} · 대표 {operator.representativeName}</p>
          <p>사업자등록번호: {operator.businessRegistrationNumber}</p>
          <p>주소: {operator.businessAddress}</p>
          <p>고객지원: {operator.supportEmail} · {operator.supportPhone}</p>
          <p>개인정보 보호책임자: {privacy.officerName} · {privacy.contactEmail}</p>
        </section>

        <section>
          <h2>처리 목적과 개인정보 항목</h2>
          <p>
            초대·계정 운영을 위한 이메일, 담당자 이름, 암호화된 인증 정보, 세션 및 보안 감사
            기록을 처리합니다. 본인 확인, 워크스페이스 접근 제어, 결제, 고객지원과 보안 대응에
            사용합니다.
          </p>
          <p>
            주간 리포트를 제공하기 위해 등록 도메인, 추적 질의, Search Console 읽기 전용 연결
            토큰, 공급자 응답과 수집 시각을 처리합니다. 검색 가시성 수집, 리포트 생성·전달에만
            사용합니다.
          </p>
        </section>

        <section>
          <h2>처리 및 보유 기간</h2>
          <ul>
            {privacy.retentionRules.map((rule) => (
              <li key={`${rule.category}:${rule.period}`}>
                <strong>{rule.category}</strong>: {rule.period} ({rule.basis})
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>파기 절차와 방법</h2>
          <p>{privacy.deletionProcedure}</p>
        </section>

        <section>
          <h2>처리위탁</h2>
          {privacy.processors.length > 0 ? (
            <ul>
              {privacy.processors.map((processor) => (
                <li key={`${processor.provider}:${processor.purpose}`}>
                  <strong>{processor.provider}</strong> — {processor.purpose}; 보유·이용 기간: {processor.retention}
                </li>
              ))}
            </ul>
          ) : <p>공개할 처리위탁 내역이 없습니다.</p>}
        </section>

        <section>
          <h2>개인정보의 제3자 제공</h2>
          {privacy.thirdPartyDisclosures.length > 0 ? (
            <ul>
              {privacy.thirdPartyDisclosures.map((disclosure) => (
                <li key={`${disclosure.recipient}:${disclosure.purpose}`}>
                  <strong>{disclosure.recipient}</strong> — 목적: {disclosure.purpose};
                  항목: {disclosure.items}; 보유·이용 기간: {disclosure.retention}
                </li>
              ))}
            </ul>
          ) : <p>공개할 개인정보 제3자 제공 내역이 없습니다.</p>}
        </section>

        <section>
          <h2>개인정보의 국외 이전</h2>
          {privacy.overseasTransfers.length > 0 ? (
            <ul>
              {privacy.overseasTransfers.map((transfer) => (
                <li key={`${transfer.recipient}:${transfer.country}:${transfer.purpose}`}>
                  <strong>{transfer.recipient} ({transfer.country})</strong> — 목적: {transfer.purpose};
                  항목: {transfer.items}; 방법·시기: {transfer.method}, {transfer.timing};
                  보유·이용 기간: {transfer.retention}
                </li>
              ))}
            </ul>
          ) : <p>공개할 개인정보 국외 이전 내역이 없습니다.</p>}
        </section>

        <section>
          <h2>이용자의 권리와 행사 방법</h2>
          <p>이용자는 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다.</p>
          <p>{privacy.rightsRequestMethod}</p>
        </section>

        <section>
          <h2>안전성 확보 조치</h2>
          <p>{privacy.securityMeasures}</p>
        </section>
      </article>
    </PublicShell>
  );
}
