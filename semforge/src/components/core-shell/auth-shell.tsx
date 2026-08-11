// @TASK P1-F1-T1 - Authentication page shell
// @SPEC SEMForge paid beta plan#invite-only-auth
import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="sf-auth-page" tabIndex={-1}>
      <section className="sf-auth-story" aria-label="SEMForge 소개">
        <Link href="/" aria-label="SEMForge 홈">
          <BrandMark />
        </Link>
        <div>
          <p className="sf-eyebrow">주간 관측 기록장</p>
          <p className="sf-auth-story__headline">흩어진 검색 신호를<br />한 주의 변화로 정리합니다.</p>
          <p>Google 순위, AI Overview, Search Console, NAVER 수요 데이터를 같은 기준으로 확인하세요.</p>
        </div>
        <small>초대받은 한국 SEO 대행사를 위한 비공개 베타</small>
      </section>
      <section className="sf-auth-panel" aria-labelledby="auth-page-title">
        <div className="sf-auth-panel__inner">
          <p className="sf-eyebrow">{eyebrow}</p>
          <h1 id="auth-page-title">{title}</h1>
          <p className="sf-auth-panel__description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
