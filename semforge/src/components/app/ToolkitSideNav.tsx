"use client";

import Link from "next/link";
import { appToolkits } from "@/data/app-nav";
import { ChevronDownIcon } from "@/components/app/app-icons";
import { cn } from "@/lib/utils";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";

interface ToolkitSideNavProps {
  toolkitKey: string;
  activeHref?: string;
}

/** 2번째 좌측 컬럼: 툴킷별 도구 목록 (240px, 데스크톱 전용) */
export function ToolkitSideNav({ toolkitKey, activeHref }: ToolkitSideNavProps) {
  const sourceToolkit = appToolkits[toolkitKey];
  const toolkit = useLocalizedValue(sourceToolkit);
  const tx = useSiteText();
  if (!sourceToolkit || !toolkit) return null;

  return (
    <aside
      aria-label={tx("Toolkit tools").replace("{toolkit}", toolkit.label)}
      className="sticky top-[56px] z-20 hidden h-[calc(100dvh-56px)] w-[240px] shrink-0 flex-col overflow-y-auto border-r border-app-border bg-white lg:flex"
    >
      {/* 툴킷 라벨 + 접기 버튼(시각용) */}
      <div className="flex items-center justify-between pl-6 pr-3 pt-4">
        <span className="text-[16px] font-semibold leading-[22px] text-app-text">
          {toolkit.label}
        </span>
        <button
          type="button"
          aria-label={tx("Collapse sidebar")}
          className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg"
        >
          <ChevronDownIcon width={14} height={14} className="rotate-90" />
        </button>
      </div>

      {/* 폴더/프로젝트 컨텍스트 셀렉터 (자리) */}
      <div className="px-3 pt-3">
        <button
          type="button"
          className="flex h-[36px] w-full items-center justify-between gap-2 rounded-[6px] bg-app-bg px-3 text-[13px] text-app-text transition-colors hover:bg-[#eceef4]"
        >
          <span className="truncate">example.com</span>
          <ChevronDownIcon width={14} height={14} className="shrink-0 text-app-text-secondary" />
        </button>
      </div>

      {/* 그룹별 도구 목록 */}
      <nav className="flex-1 px-3 pb-6">
        {toolkit.groups.map((group, groupIndex) => (
          <div key={group.heading ?? groupIndex}>
            {group.heading && (
              <div className="mb-1 mt-4 px-3 text-[11px] font-medium uppercase tracking-[0.5px] text-app-text-secondary">
                {group.heading}
              </div>
            )}
            <ul>
              {group.tools.map((tool) => {
                const active = tool.href === activeHref;
                return (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-[32px] items-center rounded-[6px] px-3 text-[13px] transition-colors",
                        active
                          ? "bg-[#eaf3ff] font-medium text-app-blue"
                          : "text-app-text hover:bg-app-bg"
                      )}
                    >
                      <span className="truncate">{tool.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
