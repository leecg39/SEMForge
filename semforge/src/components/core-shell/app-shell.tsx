// @TASK P1-F1-T1 - Responsive paid beta app shell
// @SPEC SEMForge paid beta plan#allowed-app-pages
// @TEST src/components/core-shell/core-shell.test.ts
import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { CoreIcon } from "./core-icon";

export type CoreNavKey = "overview" | "sites" | "reports" | "billing" | "settings";

const navItems: ReadonlyArray<{
  key: CoreNavKey;
  href: string;
  label: string;
  shortLabel: string;
}> = [
  { key: "overview", href: "/app", label: "가시성 개요", shortLabel: "개요" },
  { key: "sites", href: "/app/sites", label: "사이트", shortLabel: "사이트" },
  { key: "reports", href: "/app/reports", label: "주간 리포트", shortLabel: "리포트" },
  { key: "billing", href: "/app/billing", label: "결제", shortLabel: "결제" },
  { key: "settings", href: "/app/settings", label: "설정", shortLabel: "설정" },
];

function Navigation({
  active,
  mobile = false,
}: {
  active: CoreNavKey;
  mobile?: boolean;
}) {
  return (
    <nav
      className={mobile ? "sf-mobile-nav" : "sf-core-nav"}
      aria-label={mobile ? "모바일 주요 탐색" : "주요 탐색"}
    >
      {navItems.map((item) => (
        <Link
          className={mobile ? "sf-mobile-nav__link" : "sf-core-nav__link"}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          key={item.key}
        >
          <CoreIcon name={item.key} />
          <span>{mobile ? item.shortLabel : item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  active,
  children,
}: React.PropsWithChildren<{
  active: CoreNavKey;
}>) {
  return (
    <div className="sf-app-shell">
      <aside className="sf-app-sidebar">
        <Link className="sf-app-sidebar__brand" href="/app" aria-label="SEMForge 앱 홈">
          <BrandMark />
        </Link>
        <Navigation active={active} />
        <div className="sf-app-sidebar__foot">
          <span className="sf-beta-badge">초대 전용 베타</span>
          <p>월요일 오전, 지난주 검색 변화를 한 장으로 확인합니다.</p>
        </div>
      </aside>

      <div className="sf-app-stage">
        <header className="sf-app-topbar">
          <Link href="/app" aria-label="SEMForge 앱 홈">
            <BrandMark compact />
          </Link>
          <details className="sf-nav-drawer">
            <summary>메뉴</summary>
            <Navigation active={active} />
          </details>
          <span className="sf-beta-badge sf-app-topbar__badge">비공개 베타</span>
        </header>
        <main id="main-content" className="sf-app-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Navigation active={active} mobile />
    </div>
  );
}
