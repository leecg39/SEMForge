"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { appGlobalNav, appToolkits } from "@/data/app-nav";
import { appIcons } from "@/components/app/app-icons";
import { AppHeader } from "@/components/app/AppHeader";
import { AppGlobalNav } from "@/components/app/AppGlobalNav";
import { ToolkitSideNav } from "@/components/app/ToolkitSideNav";
import { cn } from "@/lib/utils";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

interface AppShellProps {
  /** appGlobalNav 의 key (home, seo, ai ...) */
  activeToolkit: string;
  /** ToolkitSideNav 에서 강조할 현재 도구 href */
  activeHref?: string;
  children: ReactNode;
  hideSideNav?: boolean;
  projectContext?: { label: string; href: string; projectId?: string };
}

/**
 * 로그인 앱 공통 셸: 헤더 + 아이콘 레일 + 툴킷 사이드냅 + 콘텐츠.
 * <1024px 에서는 좌측 레일/사이드냅 대신 상단 툴킷 탭 스크롤 바를 노출.
 */
export function AppShell({ activeToolkit, activeHref, children, hideSideNav, projectContext }: AppShellProps) {
  const globalNav = useLocalizedValue(appGlobalNav);
  const tx = useSiteText();
  const showSideNav = !hideSideNav && Boolean(appToolkits[activeToolkit]);

  return (
    <div className="flex min-h-screen flex-col bg-app-bg text-app-text">
      <AppHeader />

      {/* 모바일: 툴킷 가로 스크롤 탭 */}
      <nav
        aria-label={tx("Toolkits")}
        className="sticky top-[56px] z-40 flex gap-1 overflow-x-auto border-b border-app-border bg-white px-2 py-[6px] lg:hidden"
      >
        {globalNav.map((item) => {
          const Icon = appIcons[item.icon];
          const active = item.key === activeToolkit;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[32px] shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-[13px]",
                active
                  ? "bg-[#eaf3ff] font-medium text-app-blue"
                  : "text-app-text-secondary hover:bg-app-bg"
              )}
            >
              <Icon width={16} height={16} />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-1 flex-row">
        <AppGlobalNav activeKey={activeToolkit} />
        {showSideNav && (
          <ToolkitSideNav
            toolkitKey={activeToolkit}
            activeHref={activeHref}
            projectContext={projectContext}
          />
        )}
        <main className="min-w-0 flex-1 overflow-auto bg-app-bg">{children}</main>
      </div>
    </div>
  );
}
