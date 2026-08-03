"use client";

import Image from "next/image";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import type { SeoGscDashboardState } from "@/components/seo-dash/use-seo-gsc";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export function WidgetGoogleConnect({
  gsc,
  domain,
  onRefresh,
}: {
  gsc: SeoGscDashboardState;
  domain: string;
  onRefresh: () => void;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const connected = gsc.kind === "live" || gsc.kind === "empty" || gsc.kind === "loading" || gsc.kind === "mismatch";
  const siteUrl = connected ? gsc.siteUrl : null;

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setActionError(null);
    try {
      const response = await fetch("/api/gsc/disconnect/", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onRefresh();
    } catch (error) {
      setActionError(
        ko
          ? `Search Console 연결을 해제하지 못했습니다 (${error instanceof Error ? error.message : "오류"}).`
          : "Could not disconnect Search Console.",
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const connectHref = `/api/gsc/auth/start/?siteUrl=${encodeURIComponent(`sc-domain:${domain}`)}`;

  return (
    <WidgetCard big ariaLabel={ko ? "Google 서비스 연결" : "Connect Google services"} className="h-full min-h-[250px]">
      <div className="flex min-h-[210px] flex-col items-center justify-center gap-2 px-4 py-4 text-center sm:flex-row sm:gap-8 sm:text-left">
        <Image
          src="/seo-dashboard/connect-google.png"
          alt=""
          width={132}
          height={132}
          loading="eager"
          className="h-[132px] w-[132px] shrink-0 object-contain"
        />
        <div className="max-w-[520px]">
          <WidgetTitle>{ko ? "Google Search Console 연결" : "Connect Google Search Console"}</WidgetTitle>
          <p className={cn("mt-2 text-[13px] leading-5", SM.caption)}>
            {ko
              ? "SEO 대시보드에서 실제 검색 클릭, 노출, CTR, 평균 게재순위와 상위 검색 페이지를 확인합니다. Google Analytics 연동은 아직 준비 중입니다."
              : "Use measured search clicks, impressions, CTR, average position, and top pages. Google Analytics integration is coming soon."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {gsc.kind === "checking" || gsc.kind === "loading" ? (
              <span className="inline-flex h-8 items-center gap-2 rounded-[6px] border border-app-border px-3 text-[12px] text-a2-text-muted" role="status">
                <ReloadIcon className="animate-spin" aria-hidden="true" />
                {ko ? "연결 확인 중" : "Checking connection"}
              </span>
            ) : connected ? (
              <>
                <span className="max-w-[320px] truncate rounded-full bg-[#eef7ee] px-2.5 py-1 text-[12px] font-medium text-[#1c6b3c]" title={siteUrl ?? undefined}>
                  {gsc.kind === "mismatch" ? (ko ? "다른 도메인 연결됨" : "Different domain connected") : siteUrl}
                </span>
                <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="h-8 rounded-[6px] border border-app-border bg-white px-3 text-[12px] font-medium text-a2-text hover:bg-app-bg disabled:opacity-50">
                  {disconnecting ? (ko ? "해제 중" : "Disconnecting") : (ko ? "연결 해제" : "Disconnect")}
                </button>
                {gsc.kind === "mismatch" && (
                  <a href={connectHref} className={cn(SM.darkCta, "h-8 text-[12px]")}>{ko ? "올바른 계정 연결" : "Connect matching account"}</a>
                )}
              </>
            ) : (
              <a href={connectHref} className={cn(SM.darkCta, "h-8 text-[12px]")}>{ko ? "Search Console 연결" : "Connect Search Console"}</a>
            )}
            <span className="rounded-full bg-[#eef2f7] px-2 py-1 text-[11px] font-medium text-[#586174]">
              Google Analytics · {ko ? "준비 중" : "Coming soon"}
            </span>
          </div>
          {actionError && <p role="alert" className="mt-2 text-[12px] text-app-red">{actionError}</p>}
        </div>
      </div>
    </WidgetCard>
  );
}

export interface HiddenWidgetItem {
  id: string;
  label: string;
}

export function WidgetHiddenWidgets({
  hidden,
  onRestore,
  onRestoreAll,
}: {
  hidden: HiddenWidgetItem[];
  onRestore: (id: string) => void;
  onRestoreAll: () => void;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <WidgetCard ariaLabel={ko ? "숨겨진 위젯" : "Hidden widgets"} className="h-full min-h-[180px]">
      <div className="flex items-center justify-between gap-3 pt-2">
        <WidgetTitle>{ko ? "숨겨진 위젯" : "Hidden widgets"}</WidgetTitle>
        {hidden.length > 1 && (
          <button type="button" onClick={onRestoreAll} className={cn("text-[12px] font-medium hover:underline", SM.link)}>
            {ko ? "모두 복원" : "Restore all"}
          </button>
        )}
      </div>
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-center sm:flex-row sm:text-left">
        <Image src="/seo-dashboard/hidden-widgets.png" alt="" width={84} height={84} className="h-[84px] w-[84px] object-contain" />
        {hidden.length === 0 ? (
          <p className={cn("text-[14px] font-semibold", SM.stub)}>{ko ? "대시보드에 모든 위젯이 표시됩니다" : "All widgets are shown on the dashboard"}</p>
        ) : (
          <div className="flex max-w-[760px] flex-wrap justify-center gap-2 sm:justify-start">
            {hidden.map((widget) => (
              <button key={widget.id} type="button" onClick={() => onRestore(widget.id)} className="h-8 rounded-full border border-app-border bg-white px-3 text-[12px] font-medium text-a2-text hover:border-app-blue hover:text-app-blue">
                {widget.label} · {ko ? "복원" : "Restore"}
              </button>
            ))}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
