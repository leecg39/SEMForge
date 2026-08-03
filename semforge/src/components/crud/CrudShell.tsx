"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { appIcons } from "@/components/app/app-icons";
import { AppFooter } from "@/components/crud/AppFooter";
import { crudTools, railFlyouts, railGroups } from "@/data/crud/nav";
import type { RailFlyoutGroup } from "@/data/crud/nav";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { translateAppText } from "@/i18n/app";
import { useLocale } from "@/i18n/LocaleProvider";

export interface SessionInfo {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; plan: string };
  role: string;
  roleLabel: string;
  capabilities: Record<string, boolean>;
}

/**
 * 로그인 앱 셸.
 *
 * ko.semforge.com/home/ 를 1440px 에서 실측한 값으로 구성한다.
 * - 헤더 53px, 배경 rgb(244,245,245), 하단 보더 없음
 * - 좌측 레일 77px, 항목 64×64(2줄 라벨 80), radius 6px, 그룹 간격 15px
 * - 콘텐츠 열 x = 77 + 32 = 109
 * 근거: docs/research/components/app-rail.spec.md, app-topbar.spec.md
 */
export function CrudShell({
  session,
  children,
}: {
  session: SessionInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLocale();
  const tx = (text: string) => translateAppText(locale, text) ?? text;
  const [menuOpen, setMenuOpen] = useState(false);

  // 카테고리 호버/포커스 플라이아웃. 열림 100ms, 닫힘 150ms 지연으로 깜빡임을 막는다.
  const [flyout, setFlyout] = useState<{ key: string; top: number } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearFlyoutTimers() {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  /** 트리거 상단에 맞추되, 패널이 뷰포트 아래로 밀리지 않게 위로 클램프한다. */
  function flyoutTop(el: HTMLElement, groups: RailFlyoutGroup[]) {
    const estimated =
      16 + groups.reduce((h, g) => h + g.links.length * 32 + (g.heading ? 34 : 0), 0);
    const usable = Math.min(estimated, window.innerHeight - 16);
    return Math.min(el.getBoundingClientRect().top, Math.max(8, window.innerHeight - usable - 8));
  }

  function scheduleFlyoutOpen(key: string, el: HTMLElement) {
    const groups = railFlyouts[key];
    if (!groups) return;
    clearFlyoutTimers();
    const top = flyoutTop(el, groups);
    openTimer.current = setTimeout(() => setFlyout({ key, top }), 100);
  }

  function scheduleFlyoutClose() {
    clearFlyoutTimers();
    closeTimer.current = setTimeout(() => setFlyout(null), 150);
  }

  /** 플라이아웃이 없는 카테고리 위로 올라가면 예약된 열림을 취소하고 닫는다. */
  function cancelFlyout() {
    if (flyout) scheduleFlyoutClose();
    else clearFlyoutTimers();
  }

  function openFlyoutNow(key: string, el: HTMLElement) {
    const groups = railFlyouts[key];
    if (!groups) return;
    clearFlyoutTimers();
    setFlyout({ key, top: flyoutTop(el, groups) });
  }

  function closeFlyoutNow() {
    clearFlyoutTimers();
    setFlyout(null);
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/home/" && pathname.startsWith(href));

  const isSubActive = (href: string) => {
    if (href.includes("?")) return false;
    const strip = (v: string) => v.replace(/\/$/, "");
    return strip(pathname) === strip(href);
  };

  async function logout() {
    await api.post("/api/auth/logout/");
    router.push("/login/");
    router.refresh();
  }

  const railItems = railGroups.flat();

  return (
    // 원본은 레일이 y=0 부터 전체 높이를 차지하고, 헤더는 그 오른쪽 열에 놓인다.
    // 그래서 헤더 검색이 x=110 (레일 77 + 패딩 32) 에서 시작한다.
    <div className="flex min-h-screen flex-row bg-faint text-hof">
      {/* 좌측 레일 — 실측 77px, 항목 64×64, y=0 부터 */}
      {/* sticky가 스태킹 컨텍스트를 만들어 플라이아웃이 본문 positioned 요소 아래로
          깔리는 것을 막기 위해 aside 자체에 z-index를 준다 */}
      <aside
        aria-label={tx("툴킷")}
        onScroll={closeFlyoutNow}
        onMouseLeave={scheduleFlyoutClose}
        className="sticky top-0 z-40 hidden h-dvh w-[var(--a2-rail-width)] shrink-0 flex-col overflow-y-auto border-r border-bebe bg-white pt-[6px] lg:flex"
      >
        {railGroups.map((group, groupIndex) => (
          <div
            key={groupIndex}
            className={cn("flex flex-col gap-[4px]", groupIndex > 0 && "mt-[15px]")}
          >
            {group.map((item) => {
              const Icon = appIcons[item.icon];
              const active = isActive(item.href);
              const groups = railFlyouts[item.key];
              const open = flyout?.key === item.key && Boolean(groups);
              return (
                <div
                  key={item.key}
                  onMouseEnter={groups ? (e) => scheduleFlyoutOpen(item.key, e.currentTarget) : cancelFlyout}
                  onMouseLeave={groups ? scheduleFlyoutClose : undefined}
                  onFocus={groups ? (e) => openFlyoutNow(item.key, e.currentTarget) : undefined}
                  onBlur={
                    groups
                      ? (e) => {
                          const next = e.relatedTarget as Node | null;
                          if (!next || !e.currentTarget.contains(next)) scheduleFlyoutClose();
                        }
                      : undefined
                  }
                  onKeyDown={
                    groups
                      ? (e) => {
                          if (e.key === "Escape" && open) {
                            e.stopPropagation();
                            closeFlyoutNow();
                            e.currentTarget.querySelector<HTMLElement>(":scope > a")?.focus();
                          }
                        }
                      : undefined
                  }
                >
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-haspopup={groups ? "menu" : undefined}
                    aria-expanded={groups ? open : undefined}
                    className={cn(
                      "mx-[6px] flex min-h-[64px] flex-col items-center justify-center gap-[4px] rounded-[12px] px-[4px] py-[10px] text-center transition-colors",
                      active
                        ? "bg-faint text-hof shadow-[inset_3px_0_0_var(--color-rausch)]"
                        : "text-foggy hover:bg-faint hover:text-hof",
                      open && !active && "bg-faint"
                    )}
                  >
                    {Icon && (
                      <Icon
                        width={item.icon === "home" ? 36 : 24}
                        height={item.icon === "home" ? 36 : 24}
                      />
                    )}
                    <span
                      className={cn(
                        "text-[12px] font-medium leading-[16px]",
                        active ? "text-hof" : "text-foggy"
                      )}
                    >
                      {tx(item.label)}
                    </span>
                  </Link>

                  {/* 플라이아웃 — aside의 overflow 클리핑을 피하려고 fixed로 띄운다 */}
                  {open && groups && flyout && (
                    <div
                      className="fixed z-50 pl-[6px]"
                      style={{ top: flyout.top, left: "var(--a2-rail-width)" }}
                    >
                      <div
                        role="menu"
                        aria-label={tx(item.label)}
                        className="w-[240px] overflow-y-auto rounded-[12px] border border-bebe bg-white py-2 shadow-[var(--shadow-dropdown)]"
                        style={{ maxHeight: `calc(100dvh - ${flyout.top + 8}px)` }}
                      >
                        {groups.map((flyoutGroup, flyoutGroupIndex) => (
                          <div
                            key={flyoutGroup.heading ?? flyoutGroupIndex}
                            className={flyoutGroupIndex > 0 ? "mt-2" : undefined}
                          >
                            {flyoutGroup.heading && (
                              <p className="mb-1 px-4 pt-1 text-[11px] font-medium uppercase tracking-[0.5px] text-a2-text-faint">
                                {tx(flyoutGroup.heading)}
                              </p>
                            )}
                            <ul>
                              {flyoutGroup.links.map((link) => {
                                const subActive = isSubActive(link.href);
                                return (
                                  <li key={link.href}>
                                    <Link
                                      role="menuitem"
                                      href={link.href}
                                      aria-current={subActive ? "page" : undefined}
                                      onClick={closeFlyoutNow}
                                      className={cn(
                                        "mx-2 flex h-[32px] items-center rounded-[6px] px-2 text-[13px]",
                                        subActive
                                          ? "bg-faint font-medium text-hof"
                                          : "text-foggy hover:bg-faint hover:text-hof"
                                      )}
                                    >
                                      <span className="truncate">{tx(link.label)}</span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
      {/* 헤더 — 64px, 흰 캔버스 + 캡슐 검색 */}
      <header className="flex h-[64px] shrink-0 items-center border-b border-bebe bg-white px-[16px] lg:px-[32px]">
        <form
          className="flex h-[44px] w-full min-w-0 items-center rounded-full border border-bebe bg-white py-1 pl-4 pr-1 shadow-[var(--shadow-subtle)] lg:w-[560px] lg:shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
            if (q) router.push(`/analytics/overview/?domain=${encodeURIComponent(q)}`);
          }}
        >
          <input
            type="text"
            name="q"
            placeholder={tx("작업, 웹사이트 또는 키워드를 입력하세요")}
            aria-label={tx("전역 검색")}
            className="h-full min-w-0 flex-1 bg-transparent pr-[8px] text-[14px] text-hof outline-none placeholder:text-foggy"
          />
          <button
            type="submit"
            aria-label={tx("검색")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rausch text-white transition-colors hover:bg-rausch-600"
          >
            <appIcons.search width={16} height={16} />
          </button>
        </form>

        <div className="ml-auto flex shrink-0 items-center">
          <Link
            href="/pricing/"
            className="hidden rounded-full px-[12px] py-[9px] text-[14px] font-medium text-hof hover:bg-faint lg:block"
          >
            {tx("가격 책정")}
          </Link>
          <Link
            href="/enterprise/"
            className="hidden rounded-full px-[12px] py-[9px] text-[14px] font-medium text-hof hover:bg-faint lg:block"
          >
            {tx("엔터프라이즈")}
          </Link>
          <div className="relative">
            <button
              type="button"
              aria-label={tx("내 프로필")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="ml-[4px] flex h-10 w-10 items-center justify-center rounded-full bg-rausch text-[14px] font-medium text-white transition-colors hover:bg-rausch-600"
            >
              {session.user.name.slice(0, 1)}
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label={tx("프로필")}
                className="absolute right-0 top-[48px] z-50 w-[260px] overflow-hidden rounded-[12px] border border-bebe bg-white py-1 shadow-[var(--shadow-dropdown)]"
              >
                <div className="border-b border-black/10 px-[9px] py-[7px]">
                  <p className="truncate text-[14px] text-a2-text">{session.user.name}</p>
                  <p className="truncate text-[12px] text-a2-text-muted">
                    {session.user.email} · {tx(session.roleLabel)}
                  </p>
                </div>
                <Link
                  role="menuitem"
                  href="/app/account/profile/"
                  onClick={() => setMenuOpen(false)}
                  className="block px-[9px] py-[7px] text-[14px] hover:bg-black/5"
                >
                  {tx("프로필 설정")}
                </Link>
                <Link
                  role="menuitem"
                  href="/app/account/members/"
                  onClick={() => setMenuOpen(false)}
                  className="block px-[9px] py-[7px] text-[14px] hover:bg-black/5"
                >
                  {tx("사용자 관리")}
                </Link>

                {/* 원본 레일에는 없는, 이 클론에서만 동작하는 CRUD 화면 */}
                <p className="border-t border-black/10 px-[9px] pb-[2px] pt-[7px] text-[11px] text-a2-text-muted">
                  {tx("CRUD 도구 (이 클론 전용)")}
                </p>
                {crudTools.map((tool) => (
                  <Link
                    key={tool.href}
                    role="menuitem"
                    href={tool.href}
                    onClick={() => setMenuOpen(false)}
                    className="block px-[9px] py-[6px] text-[13px] hover:bg-black/5"
                  >
                    {tx(tool.label)}
                  </Link>
                ))}

                <button
                  role="menuitem"
                  type="button"
                  onClick={logout}
                  className="block w-full border-t border-black/10 px-[9px] py-[7px] text-left text-[14px] hover:bg-black/5"
                >
                  {tx("로그아웃")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 모바일: 레일이 숨는 구간의 대체 내비 (원본은 햄버거 드로어 — 다른 점) */}
      <nav
        aria-label={tx("툴킷")}
        className="flex gap-1 overflow-x-auto border-b border-bebe bg-white px-[16px] py-2 lg:hidden"
      >
        {railItems.map((item) => {
          const Icon = appIcons[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[32px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium",
                active ? "bg-faint text-hof" : "text-foggy"
              )}
            >
              {Icon && <Icon width={16} height={16} />}
              <span className="whitespace-nowrap">{tx(item.label)}</span>
            </Link>
          );
        })}
      </nav>

        <main className="flex-1 px-[16px] pt-[24px] lg:px-[40px]">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}
