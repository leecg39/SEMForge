// @TASK P1-F1-T1 - Independent public shell
// @SPEC SEMForge paid beta plan#public-pages
import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sf-public-shell">
      <header className="sf-public-header">
        <Link href="/" aria-label="SEMForge 홈">
          <BrandMark />
        </Link>
        <nav aria-label="공개 메뉴">
          <Link href="/legal/privacy">개인정보</Link>
          <Link href="/legal/terms">이용약관</Link>
          <Link className="sf-button sf-button--secondary" href="/login">로그인</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="sf-public-footer">
        <div>
          <BrandMark compact />
          <p>확인된 검색 신호만 기록하는 주간 가시성 리포트</p>
        </div>
        <nav aria-label="푸터 메뉴">
          <Link href="/legal/privacy">개인정보 처리방침</Link>
          <Link href="/legal/terms">이용약관</Link>
        </nav>
        <small>© {new Date().getFullYear()} SEMForge. 비공개 베타.</small>
      </footer>
    </div>
  );
}
