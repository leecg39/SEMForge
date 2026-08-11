// @TASK P1-F1-T1 - Beta service terms
// @SPEC SEMForge paid beta plan#legal-pages
import type { Metadata } from "next";
import { PublicShell } from "@/components/core-shell/public-shell";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="sf-legal">
        <header>
          <p className="sf-eyebrow">비공개 베타 안내</p>
          <h1>서비스 이용약관</h1>
          <p>시행 예정일: 유료 비공개 베타 개시일</p>
        </header>
        <aside role="note">
          이 문서는 베타 준비를 위한 기본 약관이며 법률 검토가 완료된 최종 문서가 아닙니다.
          유료 초대 발송 전 사업자 정보, 환불·청약철회, 책임 제한과 분쟁 조항을 법률 전문가와 확정합니다.
        </aside>
        <section>
          <h2>서비스 범위</h2>
          <p>SEMForge는 초대된 한국 SEO 대행사에 Google 순위, AI Overview, Search Console, NAVER 수요 데이터를 이용한 주간 가시성 리포트를 제공합니다.</p>
          <p>외부 공급자 장애나 데이터 지연이 있는 경우 확인 가능한 영역만 제공하며, 확인할 수 없는 데이터를 추정값으로 대체하지 않습니다.</p>
        </section>
        <section>
          <h2>계정과 이용 한도</h2>
          <p>초대는 지정 이메일에 한해 1회 사용할 수 있습니다. 기본 베타 플랜은 워크스페이스당 사이트 3개, 사이트당 순위 키워드 20개와 AI Overview 프롬프트 20개를 포함합니다.</p>
        </section>
        <section>
          <h2>요금과 자동결제</h2>
          <p>기본 요금은 월 49,000원(VAT 포함)이며 Toss 자동결제로 청구합니다. 자동결제 인증과 첫 결제가 성공한 이후 서비스가 활성화됩니다.</p>
          <p>취소는 다음 결제 기간부터 적용하는 것을 기본으로 하되, 법령상 청약철회·환불 권리와 중복·오류 결제의 환불이 우선합니다.</p>
        </section>
        <section>
          <h2>허용되는 이용</h2>
          <p>이용자는 자신 또는 적법한 권한을 받은 고객 사이트만 등록해야 하며, 계정·연결 토큰을 제3자와 공유하거나 서비스 안정성을 해치는 자동화 요청을 보내서는 안 됩니다.</p>
        </section>
        <section>
          <h2>베타 운영과 변경</h2>
          <p>베타 기간에는 기능과 일정이 조정될 수 있습니다. 데이터 보존이나 요금에 영향을 주는 중대한 변경은 적용 전에 안내합니다.</p>
        </section>
        <section>
          <h2>문의</h2>
          <p>공식 고객지원 및 사업자 연락처는 법률·운영 검토 후 유료 초대 발송 전에 명시합니다.</p>
        </section>
      </article>
    </PublicShell>
  );
}
