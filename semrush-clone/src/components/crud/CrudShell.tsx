"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { appIcons } from "@/components/app/app-icons";
import { crudNavGroups } from "@/data/crud/nav";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface SessionInfo {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; plan: string };
  role: string;
  roleLabel: string;
  capabilities: Record<string, boolean>;
}

/**
 * CRUD 앱 셸.
 * 원본 실측 구조를 따른다: 헤더 56px(전역 검색 + 우측 유틸리티) + 좌측 아이콘 레일(라벨 포함),
 * 1024px 미만에서는 레일을 숨기고 상단 가로 스크롤 탭으로 전환.
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
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href);
  const allItems = crudNavGroups.flatMap((g) => g.items);

  async function logout() {
    await api.post("/api/auth/logout/");
    router.push("/app/signin/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-bg text-app-text">
      <header className="sticky top-0 z-50 flex h-[56px] shrink-0 items-center gap-3 border-b border-app-border bg-white px-4">
        <Link href="/app/home/" className="flex shrink-0 flex-col justify-center leading-none">
          <span className="text-[18px] font-semibold leading-[20px] tracking-[-0.36px]">
            Semrush
          </span>
          <span className="text-[9px] leading-[11px] text-app-text-secondary">
            CRUD 재구축 클론
          </span>
        </Link>

        {/* 원본 전역 검색 placeholder 를 그대로 사용 (증거 O) */}
        <div className="mx-auto hidden h-[36px] w-full max-w-[480px] flex-1 items-center gap-2 rounded-[8px] bg-app-bg px-3 sm:flex">
          <appIcons.search width={16} height={16} className="shrink-0 text-app-text-secondary" />
          <input
            type="text"
            placeholder="작업, 웹사이트 또는 키워드를 입력하세요"
            aria-label="전역 검색"
            className="h-full w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-app-text-secondary"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden rounded-[6px] bg-app-bg px-2 py-1 text-[12px] text-app-text-secondary md:inline">
            {session.workspace.name} · {session.roleLabel}
          </span>
          <div className="relative">
            <button
              type="button"
              aria-label="내 프로필"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-[#7b5cf0] text-[13px] font-semibold text-white"
            >
              {session.user.name.slice(0, 1)}
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="프로필"
                className="absolute right-0 top-[40px] w-[240px] overflow-hidden rounded-[8px] border border-app-border bg-white py-1 shadow-lg"
              >
                <div className="border-b border-app-border px-3 py-2">
                  <p className="truncate text-[13px] font-semibold">{session.user.name}</p>
                  <p className="truncate text-[12px] text-app-text-secondary">
                    {session.user.email}
                  </p>
                </div>
                <Link
                  role="menuitem"
                  href="/app/account/profile/"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 text-[13px] hover:bg-app-bg"
                >
                  프로필 설정
                </Link>
                <Link
                  role="menuitem"
                  href="/app/account/members/"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 text-[13px] hover:bg-app-bg"
                >
                  사용자 관리
                </Link>
                <button
                  role="menuitem"
                  type="button"
                  onClick={logout}
                  className="block w-full border-t border-app-border px-3 py-2 text-left text-[13px] hover:bg-app-bg"
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 모바일: 가로 스크롤 탭 (원본 375px 동작에 맞춘 대체 내비) */}
      <nav
        aria-label="메뉴"
        className="sticky top-[56px] z-40 flex gap-1 overflow-x-auto border-b border-app-border bg-white px-2 py-[6px] lg:hidden"
      >
        {allItems.map((item) => {
          const Icon = appIcons[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[32px] shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-[13px]",
                active
                  ? "bg-[#eaf0fd] font-medium text-app-link"
                  : "text-app-text-secondary hover:bg-app-bg"
              )}
            >
              {Icon && <Icon width={16} height={16} />}
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-1 flex-row">
        <aside
          aria-label="메뉴"
          className="sticky top-[56px] z-30 hidden h-[calc(100dvh-56px)] w-[76px] shrink-0 flex-col items-center overflow-y-auto border-r border-app-border bg-white pb-4 pt-2 lg:flex"
        >
          {crudNavGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="flex w-full flex-col items-center">
              {groupIndex > 0 && <span className="my-2 h-px w-[44px] bg-app-border" />}
              {group.items.map((item) => {
                const Icon = appIcons[item.icon];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className="group flex w-full flex-col items-center gap-[2px] py-[6px]"
                  >
                    <span
                      className={cn(
                        "flex h-[40px] w-[40px] items-center justify-center rounded-[8px] transition-colors",
                        active
                          ? "bg-[#1b1f23] text-white"
                          : "text-app-text-secondary group-hover:bg-app-bg group-hover:text-app-text"
                      )}
                    >
                      {Icon && <Icon width={20} height={20} />}
                    </span>
                    <span
                      className={cn(
                        "max-w-[70px] px-[2px] text-center text-[10px] leading-[12px]",
                        active ? "font-semibold text-app-text" : "text-app-text-secondary"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 bg-app-bg">{children}</main>
      </div>
    </div>
  );
}
