// @TASK P5-L1-T1 - Runtime-bound paid beta terms
// @SPEC docs/release/legal-launch-gate.md
import type { Metadata } from "next";

import { readLegalReleaseManifest } from "@/app/legal/release";
import { PublicShell } from "@/components/core-shell/public-shell";

export const metadata: Metadata = { title: "이용약관" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const manifest = readLegalReleaseManifest();

  if (!manifest) {
    return (
      <PublicShell>
        <article className="sf-legal">
          <header>
            <p className="sf-eyebrow">출시 전 안내</p>
            <h1>서비스 이용약관</h1>
          </header>
          <aside role="alert">
            이용약관이 아직 승인·공개되지 않았습니다. 이 상태에서는 유료 비공개 베타의 웹
            런타임과 자동결제를 시작할 수 없습니다.
          </aside>
        </article>
      </PublicShell>
    );
  }

  const { operator, release, terms } = manifest;
  return (
    <PublicShell>
      <article className="sf-legal">
        <header>
          <p className="sf-eyebrow">유료 비공개 베타</p>
          <h1>서비스 이용약관</h1>
          <p>시행일: {terms.effectiveDate} · 문서 버전: {release.documentVersion}</p>
        </header>
        <aside role="note">
          이 약관은 SEMForge 이용계약에 적용되며, 이용자 개인에 대한 법률 자문을 제공하지
          않습니다.
        </aside>

        <section>
          <h2>사업자 정보</h2>
          <p>{operator.businessName} · 대표 {operator.representativeName}</p>
          <p>사업자등록번호: {operator.businessRegistrationNumber}</p>
          {operator.mailOrderRegistration ? (
            <p>
              통신판매업 신고번호: {operator.mailOrderRegistration.number} · 신고기관: {operator.mailOrderRegistration.authority}
            </p>
          ) : null}
          <p>주소: {operator.businessAddress}</p>
          <p>고객지원: {operator.supportEmail} · {operator.supportPhone}</p>
        </section>

        <section>
          <h2>서비스 범위</h2>
          <p>
            SEMForge는 초대된 한국 SEO 대행사에 Google 검색 순위, AI Overview, Search
            Console, NAVER 수요 데이터를 이용한 주간 검색 가시성 리포트를 웹·PDF·이메일로
            제공합니다.
          </p>
          <p>
            외부 공급자 장애나 데이터 지연이 있는 경우 확인 가능한 영역만 제공하며, 확인할 수
            없는 데이터를 추정값으로 대체하지 않습니다.
          </p>
        </section>

        <section>
          <h2>계정과 이용 한도</h2>
          <p>
            초대는 지정 이메일에 한해 1회 사용할 수 있습니다. 기본 베타 플랜은 워크스페이스당
            사이트 3개, 사이트당 순위 키워드 20개와 AI Overview 프롬프트 20개를 포함합니다.
          </p>
        </section>

        <section>
          <h2>요금과 자동결제</h2>
          <p>
            요금은 월 {terms.priceKrw.toLocaleString("ko-KR")}원(VAT 포함)이며 Toss
            자동결제로 청구합니다. 자동결제 인증 직후 첫 결제가 성공해야 서비스가 활성화됩니다.
          </p>
          <p>취소는 현재 결제기간 말에 적용됩니다.</p>
        </section>

        <section>
          <h2>청약철회와 환불</h2>
          <p>{terms.withdrawalPolicy}</p>
          <p>{terms.refundPolicy}</p>
        </section>

        <section>
          <h2>허용되는 이용</h2>
          <p>
            이용자는 자신 또는 적법한 권한을 받은 고객 사이트만 등록해야 합니다. 계정이나 연결
            토큰을 제3자와 공유하거나 서비스 안정성을 해치는 자동화 요청을 보내서는 안 됩니다.
          </p>
        </section>

        <section>
          <h2>베타 운영과 변경</h2>
          <p>
            베타 기간에는 기능과 일정이 조정될 수 있습니다. 데이터 보존이나 요금에 영향을 주는
            중대한 변경은 적용 전에 안내합니다.
          </p>
        </section>

        <section>
          <h2>분쟁과 문의</h2>
          <p>{terms.disputeProcedure}</p>
          <p>{operator.supportEmail} · {operator.supportPhone}</p>
        </section>
      </article>
    </PublicShell>
  );
}
