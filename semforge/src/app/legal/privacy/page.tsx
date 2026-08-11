// @TASK P1-F1-T1 - Beta privacy notice
// @SPEC SEMForge paid beta plan#legal-pages
import type { Metadata } from "next";
import { PublicShell } from "@/components/core-shell/public-shell";

export const metadata: Metadata = { title: "개인정보 처리방침" };

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="sf-legal">
        <header>
          <p className="sf-eyebrow">비공개 베타 안내</p>
          <h1>개인정보 처리방침</h1>
          <p>시행 예정일: 유료 비공개 베타 개시일</p>
        </header>
        <aside role="note">
          이 문서는 베타 준비를 위한 기본 안내이며 법률 검토가 완료된 최종 문서가 아닙니다.
          유료 초대 발송 전 사업자 정보, 위탁사, 국외 이전 및 보유 기간을 법률 전문가와 확정합니다.
        </aside>
        <section>
          <h2>수집하는 정보</h2>
          <p>초대·계정 운영을 위한 이메일, 담당자 이름, 암호화된 인증 정보와 워크스페이스 활동 기록을 처리합니다.</p>
          <p>리포트 제공을 위해 등록 도메인, 추적 질의, Search Console 읽기 전용 연결 토큰과 공급자 응답의 출처·수집 시각을 처리합니다.</p>
        </section>
        <section>
          <h2>이용 목적</h2>
          <p>본인 확인, 워크스페이스 접근 제어, 검색 가시성 수집, 주간 리포트 생성·전달, 결제·고객 지원과 보안 감사에 사용합니다.</p>
        </section>
        <section>
          <h2>보관과 삭제</h2>
          <p>계정과 계약이 유지되는 동안 필요한 범위에서 보관하고, 관계 법령상 의무가 없는 정보는 계약 종료와 삭제 요청 후 정해진 절차에 따라 삭제합니다.</p>
        </section>
        <section>
          <h2>외부 서비스</h2>
          <p>Google Search Console, 검색 데이터 공급자, NAVER API, Toss Payments, 이메일·파일 저장 서비스를 이용할 수 있습니다. 확정된 처리위탁 및 국외 이전 내역은 출시 전 이 문서에 공개합니다.</p>
        </section>
        <section>
          <h2>문의와 권리</h2>
          <p>이용자는 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 공식 개인정보 보호 문의처는 법률 검토 후 출시 전에 명시합니다.</p>
        </section>
      </article>
    </PublicShell>
  );
}
