"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { appToolkits } from "@/data/app-nav";
import { ChevronDownIcon } from "@/components/app/app-icons";
import { cn } from "@/lib/utils";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";
import { api } from "@/lib/client-api";

interface ToolkitSideNavProps {
  toolkitKey: string;
  activeHref?: string;
}

/** 데스크톱 사이드바를 사용할 수 없는 화면에서 현재 툴킷 도구를 가로 탭으로 제공한다. */
export function ToolkitMobileNav({ toolkitKey, activeHref }: ToolkitSideNavProps) {
  const sourceToolkit = appToolkits[toolkitKey];
  const toolkit = useLocalizedValue(sourceToolkit);
  const searchParams = useSearchParams();
  const selectedFolderId = searchParams.get("fid") ?? "";
  if (!sourceToolkit || !toolkit) return null;
  const tools = toolkit.groups.flatMap((group) => group.tools);

  return (
    <nav
      aria-label={`${toolkit.label} 도구`}
      className="sticky top-[101px] z-30 flex max-w-full gap-1 overflow-x-auto border-b border-app-border bg-white px-2 py-[6px] min-[1025px]:hidden"
    >
      {tools.map((tool) => {
        const active = tool.href === activeHref;
        const separator = tool.href.includes("?") ? "&" : "?";
        const href = selectedFolderId && (toolkitKey === "advertising" || toolkitKey === "ai")
          ? `${tool.href}${separator}fid=${encodeURIComponent(selectedFolderId)}`
          : tool.href;
        return (
          <Link
            key={tool.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-[32px] shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-[12px]",
              active
                ? "bg-[#eaf3ff] font-semibold text-app-blue"
                : "text-app-text-secondary hover:bg-app-bg",
            )}
          >
            <span className="whitespace-nowrap">{tool.label}</span>
            {tool.badge && <span className="rounded-full bg-[#ff642d] px-1.5 py-0.5 text-[8px] font-semibold uppercase text-white">{tool.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

type FolderOption = { id: string; name: string; domain: string };
const COLLAPSE_EVENT = "semforge:toolkit-sidebar";

function subscribeCollapse(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

function collapsedSnapshot(key: string): boolean {
  return window.localStorage.getItem(key) === "collapsed";
}

/** 2번째 좌측 컬럼: 툴킷별 도구 목록 (240px, 데스크톱 전용) */
export function ToolkitSideNav({ toolkitKey, activeHref }: ToolkitSideNavProps) {
  const sourceToolkit = appToolkits[toolkitKey];
  const toolkit = useLocalizedValue(sourceToolkit);
  const tx = useSiteText();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const collapseKey = `semforge:toolkit-sidebar:${toolkitKey}`;
  const collapsed = useSyncExternalStore(
    subscribeCollapse,
    () => collapsedSnapshot(collapseKey),
    () => false,
  );
  const selectedFolderId = searchParams.get("fid") ?? "";

  useEffect(() => {
    let active = true;
    api
      .get<FolderOption[]>("/api/folders/?pageSize=50&sort=name:asc")
      .then(({ data }) => {
        if (active) setFolders(data);
      })
      .catch(() => {
        // 비로그인/미설정 상태에서는 선택기만 비워 두고 나머지 탐색은 유지한다.
      });
    return () => {
      active = false;
    };
  }, []);

  const setCollapsed = (value: boolean) => {
    window.localStorage.setItem(collapseKey, value ? "collapsed" : "expanded");
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };

  const folderHref = (href: string) => {
    if (!selectedFolderId || (toolkitKey !== "advertising" && toolkitKey !== "ai")) return href;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}fid=${encodeURIComponent(selectedFolderId)}`;
  };
  if (!sourceToolkit || !toolkit) return null;

  return (
    <aside
      aria-label={tx("Toolkit tools").replace("{toolkit}", toolkit.label)}
      className={cn(
        "sticky top-[56px] z-20 hidden h-[calc(100dvh-56px)] shrink-0 flex-col overflow-y-auto border-r border-app-border bg-white transition-[width] min-[1025px]:flex",
        collapsed ? "w-[44px]" : "w-[240px]",
      )}
    >
      {/* 툴킷 라벨 + 접기 버튼(시각용) */}
      <div className={cn("flex items-center pt-4", collapsed ? "justify-center" : "justify-between pl-6 pr-3")}>
        <span className={cn("text-[16px] font-semibold leading-[22px] text-app-text", collapsed && "sr-only")}>
          {toolkit.label}
        </span>
        <button
          type="button"
          aria-label={collapsed ? (toolkit.label + " 펼치기") : tx("Collapse sidebar")}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg"
        >
          <ChevronDownIcon width={14} height={14} className={collapsed ? "-rotate-90" : "rotate-90"} />
        </button>
      </div>

      {!collapsed && <div className="px-3 pt-3">
        <label className="sr-only" htmlFor={`toolkit-folder-${toolkitKey}`}>프로젝트 선택</label>
        <select
          id={`toolkit-folder-${toolkitKey}`}
          value={selectedFolderId}
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString());
            if (event.target.value) params.set("fid", event.target.value);
            else params.delete("fid");
            router.push(`${pathname}${params.size ? `?${params}` : ""}`);
          }}
          className="h-[36px] w-full rounded-[6px] bg-app-bg px-3 text-[13px] text-app-text outline-none transition-colors hover:bg-[#eceef4] focus:ring-2 focus:ring-app-blue/30"
        >
          <option value="">내 프로젝트</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name} · {folder.domain}</option>)}
        </select>
      </div>}

      {/* 그룹별 도구 목록 */}
      <nav className={cn("flex-1 pb-6", collapsed ? "px-1" : "px-3")}>
        {toolkit.groups.map((group, groupIndex) => (
          <div key={group.heading ?? groupIndex}>
            {group.heading && !collapsed && (
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
                      href={folderHref(tool.href)}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? tool.label : undefined}
                      className={cn(
                        "flex h-[32px] items-center rounded-[6px] text-[13px] transition-colors",
                        collapsed ? "justify-center px-1" : "px-3",
                        active
                          ? "bg-[#eaf3ff] font-medium text-app-blue"
                          : "text-app-text hover:bg-app-bg"
                      )}
                    >
                      {collapsed ? (
                        <span aria-hidden="true" className="text-[11px] font-semibold">{tool.label.slice(0, 1)}</span>
                      ) : (
                        <>
                          <span className="truncate">{tool.label}</span>
                          {tool.badge && <span className="ml-auto rounded-full bg-[#ff642d] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">{tool.badge}</span>}
                        </>
                      )}
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
