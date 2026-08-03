"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { appToolkits } from "@/data/app-nav";
import { ChevronDownIcon } from "@/components/app/app-icons";
import { cn } from "@/lib/utils";
import { useLocalizedValue, useSiteText } from "@/i18n/useLocalizedValue";
import { api } from "@/lib/client-api";
import { buildToolkitToolHref } from "@/components/app/toolkit-navigation";

interface ToolkitSideNavProps {
  toolkitKey: string;
  activeHref?: string;
}

function ToolIcon({ name }: { name?: "home" | "workspaces" | "library" }) {
  if (name === "home") {
    return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 7.1 8 2.6l5.5 4.5v6.1H9.8V9.5H6.2v3.7H2.5V7.1Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" /></svg>;
  }
  if (name === "workspaces") {
    return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.2" y="2.4" width="4.7" height="4.7" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="9.1" y="2.4" width="4.7" height="4.7" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="2.2" y="9.1" width="4.7" height="4.7" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="9.1" y="9.1" width="4.7" height="4.7" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>;
  }
  if (name === "library") {
    return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2.4h7.1a2 2 0 0 1 2 2v9.2H5a2 2 0 0 1-2-2V2.4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 4.8h4.8M5 7.2h4.8M5 9.6h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
  }
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h7l3 3v8H3v-11Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M10 2.5v3h3M5.2 8h5.6M5.2 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}

/** 데스크톱 사이드바를 사용할 수 없는 화면에서 현재 툴킷 도구를 가로 탭으로 제공한다. */
export function ToolkitMobileNav({ toolkitKey, activeHref }: ToolkitSideNavProps) {
  const sourceToolkit = appToolkits[toolkitKey];
  const toolkit = useLocalizedValue(sourceToolkit);
  const tx = useSiteText();
  const searchParams = useSearchParams();
  const selectedFolderId = searchParams.get("fid") ?? "";
  if (!sourceToolkit || !toolkit) return null;
  const tools = toolkit.groups.flatMap((group) => group.tools);

  return (
    <nav
      aria-label={tx("Toolkit tools").replace("{toolkit}", toolkit.label)}
      className="sticky top-[109px] z-30 flex max-w-full gap-1 overflow-x-auto border-b border-bebe bg-white px-2 py-[6px] min-[1025px]:hidden"
    >
      {tools.map((tool) => {
        const active = tool.href === activeHref;
        const href = buildToolkitToolHref({ toolkitKey, href: tool.href, selectedFolderId });
        return (
          <Link
            key={tool.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-[32px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px]",
              active
                ? "bg-faint font-semibold text-hof"
                : "text-foggy hover:bg-faint",
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

  const folderHref = (href: string) =>
    buildToolkitToolHref({ toolkitKey, href, selectedFolderId });
  if (!sourceToolkit || !toolkit) return null;

  return (
    <aside
      aria-label={tx("Toolkit tools").replace("{toolkit}", toolkit.label)}
      className={cn(
        "sticky top-[64px] z-20 hidden h-[calc(100dvh-64px)] shrink-0 flex-col overflow-y-auto border-r border-bebe bg-white transition-[width] min-[1025px]:flex",
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
          aria-label={collapsed ? tx("Expand sidebar") : tx("Collapse sidebar")}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg"
        >
          <ChevronDownIcon width={14} height={14} className={collapsed ? "-rotate-90" : "rotate-90"} />
        </button>
      </div>

      {!collapsed && <div className="px-3 pt-3">
        <label className="sr-only" htmlFor={`toolkit-folder-${toolkitKey}`}>{tx("Select project")}</label>
        <select
          id={`toolkit-folder-${toolkitKey}`}
          value={selectedFolderId}
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString());
            if (event.target.value) params.set("fid", event.target.value);
            else params.delete("fid");
            router.push(`${pathname}${params.size ? `?${params}` : ""}`);
          }}
          className="h-[40px] w-full rounded-[8px] border border-bebe bg-white px-3 text-[13px] text-hof outline-none transition-colors hover:bg-faint focus:border-rausch focus:ring-2 focus:ring-rausch/20"
        >
          <option value="">{tx("My projects")}</option>
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
                      aria-label={collapsed ? tool.label : undefined}
                      title={collapsed ? tool.label : undefined}
                      className={cn(
                        "flex h-[34px] items-center rounded-[8px] text-[13px] transition-colors",
                        collapsed ? "justify-center px-1" : "px-3",
                        active
                          ? "bg-faint font-semibold text-hof"
                          : "text-hof hover:bg-faint"
                      )}
                    >
                      {collapsed ? <ToolIcon name={tool.icon} /> : (
                        <>
                          <span className="mr-2 shrink-0 text-foggy"><ToolIcon name={tool.icon} /></span>
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
