"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { notificationAriaLabel, translateNotificationText } from "@/i18n/notifications";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  source: "app" | "site-audit";
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}

interface AppInboxResponse {
  unread: number;
  items: {
    id: string;
    title: string;
    message: string;
    href: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
}

interface SiteAuditNotification {
  id: string;
  campaignId: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export function AppNotificationsMenu() {
  const { locale } = useLocale();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const tx = (text: string) => translateNotificationText(locale, text);

  const load = useCallback(async () => {
    const [appResult, auditResult] = await Promise.allSettled([
      api.get<AppInboxResponse>("/api/app-notifications/"),
      api.get<SiteAuditNotification[]>("/api/site-audits/notifications/"),
    ]);
    const next: NotificationItem[] = [];
    if (appResult.status === "fulfilled") {
      next.push(...appResult.value.data.items.map((item) => ({
        ...item,
        source: "app" as const,
        href: item.href || "/position-tracking/",
      })));
    }
    if (auditResult.status === "fulfilled") {
      next.push(...auditResult.value.data.map((item) => ({
        ...item,
        source: "site-audit" as const,
        href: `/siteaudit/?campaign=${encodeURIComponent(item.campaignId)}`,
      })));
    }
    setItems(next.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30));
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const unread = items.filter((item) => !item.readAt).length;

  const markRead = async (item?: NotificationItem) => {
    try {
      if (item) {
        await api.patch(
          item.source === "app" ? "/api/app-notifications/" : "/api/site-audits/notifications/",
          { id: item.id },
        );
        setItems((current) => current.map((row) => row.id === item.id && row.source === item.source
          ? { ...row, readAt: row.readAt ?? new Date().toISOString() }
          : row));
        return;
      }
      await Promise.allSettled([
        api.patch("/api/app-notifications/", { all: true }),
        api.patch("/api/site-audits/notifications/", { all: true }),
      ]);
      setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    } catch {
      // 알림 읽음 저장 실패는 링크 이동과 다른 헤더 기능을 막지 않는다.
    }
  };

  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (open) void load(); }}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={notificationAriaLabel(locale, unread)}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-faint text-hof hover:bg-bebe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rausch"
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
        <DropdownMenu.Content align="end" sideOffset={8} className="z-[600] w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-[12px] border border-bebe bg-white shadow-[var(--shadow-dropdown)]">
          <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
            <p className="text-[14px] font-semibold text-app-text">{tx("알림")}</p>
            {unread > 0 && <button type="button" onClick={() => void markRead()} className="text-[11px] font-medium text-app-blue hover:underline">{tx("모두 읽음")}</button>}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-app-text-secondary">{tx("아직 알림이 없습니다.")}</p>
            ) : items.map((item) => (
              <DropdownMenu.Item key={`${item.source}-${item.id}`} asChild>
                <Link
                  href={item.href}
                  onClick={() => { if (!item.readAt) void markRead(item); }}
                  className={cn("block border-b border-app-border px-4 py-3 outline-none last:border-b-0 hover:bg-app-bg focus:bg-app-bg", !item.readAt && "bg-[#f4f7fe]")}
                >
                  <span className="flex items-start gap-2">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-app-blue")} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-app-text">{tx(item.title)}</span>
                      <span className="mt-0.5 block text-[12px] leading-5 text-app-text-secondary">{tx(item.message)}</span>
                      <span className="mt-1 block text-[10px] text-app-text-secondary" suppressHydrationWarning>
                        {new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}
                      </span>
                    </span>
                  </span>
                </Link>
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
