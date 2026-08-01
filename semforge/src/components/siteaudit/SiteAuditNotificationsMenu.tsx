"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface SiteAuditNotification {
  id: string;
  campaignId: string;
  runId: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export function SiteAuditNotificationsMenu() {
  const [rows, setRows] = useState<SiteAuditNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await api.get<SiteAuditNotification[]>("/api/site-audits/notifications/");
      setRows(response.data);
      setUnread((response.meta as { unread?: number } | undefined)?.unread ?? 0);
    } catch {
      // 헤더의 선택 기능이므로 네트워크 실패가 다른 탐색을 막지 않게 조용히 유지한다.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const markRead = async (id?: string) => {
    try {
      await api.patch("/api/site-audits/notifications/", id ? { id } : { all: true });
      setRows((current) => current.map((row) => !id || row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row));
      setUnread((current) => id ? Math.max(0, current - 1) : 0);
    } catch {
      // 링크 이동은 읽음 저장 실패와 독립적으로 동작한다.
    }
  };

  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (open) void load(); }}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`사이트 진단 알림${unread > 0 ? `, 읽지 않음 ${unread}개` : ""}`}
          className="relative flex h-8 w-8 items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-blue"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </svg>
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-app-red px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-[600] w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[9px] border border-app-border bg-white shadow-[0_16px_44px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
            <p className="text-[14px] font-semibold text-app-text">사이트 진단 알림</p>
            {unread > 0 && <button type="button" onClick={() => void markRead()} className="text-[11px] font-medium text-app-blue hover:underline">모두 읽음</button>}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-app-text-secondary">아직 알림이 없습니다.</p>
            ) : rows.map((row) => (
              <DropdownMenu.Item key={row.id} asChild>
                <Link
                  href={`/siteaudit/?campaign=${encodeURIComponent(row.campaignId)}`}
                  onClick={() => { if (!row.readAt) void markRead(row.id); }}
                  className={cn("block border-b border-app-border px-4 py-3 outline-none last:border-b-0 hover:bg-app-bg focus:bg-app-bg", !row.readAt && "bg-[#f4f7fe]")}
                >
                  <span className="flex items-start gap-2">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", row.readAt ? "bg-transparent" : "bg-app-blue")} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-app-text">{row.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-5 text-app-text-secondary">{row.message}</span>
                      <span className="mt-1 block text-[10px] text-app-text-secondary" suppressHydrationWarning>{new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(row.createdAt))}</span>
                    </span>
                  </span>
                </Link>
              </DropdownMenu.Item>
            ))}
          </div>
          <DropdownMenu.Item asChild>
            <Link href="/siteaudit/" className="block border-t border-app-border px-4 py-3 text-center text-[12px] font-medium text-app-blue outline-none hover:bg-app-bg focus:bg-app-bg">사이트 진단 프로젝트 보기</Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
