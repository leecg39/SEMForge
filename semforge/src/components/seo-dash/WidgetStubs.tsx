"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

/** Google 서비스 연결 상태 폴링 주기 (밀리초) */
const GSC_STATUS_POLL_MS = 30_000;

type GscConnectionState =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | { kind: "disconnected" }
  | { kind: "connected"; siteUrl?: string; email?: string };

interface GscStatusBody {
  status?: string;
  data?: { connected?: boolean; siteUrl?: string; email?: string };
  reason?: string;
}

async function fetchGscConnectionState(): Promise<GscConnectionState> {
  let response: Response;
  try {
    response = await fetch("/api/gsc/status/", { cache: "no-store" });
  } catch {
    return { kind: "error", reason: "network" };
  }
  if (!response.ok) {
    return { kind: "error", reason: `HTTP ${response.status}` };
  }
  const body = (await response.json()) as GscStatusBody;
  if (body.status !== "live" || !body.data) {
    return { kind: "error", reason: body.reason ?? "unavailable" };
  }
  if (!body.data.connected) {
    return { kind: "disconnected" };
  }
  return {
    kind: "connected",
    ...(body.data.siteUrl ? { siteUrl: body.data.siteUrl } : {}),
    ...(body.data.email ? { email: body.data.email } : {}),
  };
}

/**
 * Google 서비스 연결하기 (spec: widget-organic-backlinks.spec.md C-1)
 *
 * - Search Console: /api/gsc/status 를 폴링해 실제 연결 상태를 반영한다.
 *   미연결이면 /api/gsc/auth/start 로 보내는 연결 버튼, 연결이면 siteUrl 과
 *   해제 버튼(POST /api/gsc/disconnect)을 보여준다.
 * - Analytics: 아직 연동이 없으므로 버튼을 비활성화하고 "준비 중"임을 정직하게 표기한다.
 */
export function WidgetGoogleConnect() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [gsc, setGsc] = useState<GscConnectionState>({ kind: "loading" });
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const state = await fetchGscConnectionState();
      if (!cancelled) setGsc(state);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), GSC_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setActionError(null);
    try {
      const response = await fetch("/api/gsc/disconnect/", { method: "POST" });
      if (!response.ok) {
        setActionError(
          ko ? `해제에 실패했습니다 (HTTP ${response.status}).` : `Disconnect failed (HTTP ${response.status}).`
        );
      }
    } catch {
      setActionError(ko ? "해제 요청에 실패했습니다." : "Disconnect request failed.");
    } finally {
      setDisconnecting(false);
      // 해제 성공/실패와 무관하게 서버의 실제 상태를 다시 읽어 화면을 맞춘다.
      setGsc(await fetchGscConnectionState());
    }
  };

  return (
    <WidgetCard big ariaLabel={ko ? "Google 서비스 연결하기" : "Connect Google services"} className="xl:col-span-4">
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] border border-app-border bg-white text-[15px] font-bold text-[#4285F4]">G</span>
          <span aria-hidden="true" className="text-[18px] text-a2-text-muted">+</span>
          <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] border border-app-border bg-white text-[15px] font-bold text-[#34A853]">SC</span>
        </div>
        <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.stub)}>
          {ko ? "Google 서비스 연결하기" : "Connect Google services"}
        </h3>
        <p className={cn("max-w-[420px] text-[14px] leading-[20px]", SM.stub)}>
          {ko
            ? "SEO 대시보드에서 Google 애널리틱스와 Google Search Console의 실시간 데이터를 사용해 분석의 품질을 높여보세요."
            : "Use real-time data from Google Analytics and Google Search Console to improve the quality of your analysis on the SEO dashboard."}
        </p>

        <div className="flex flex-col items-center gap-2">
          {/* Search Console 행: 실제 연결 상태를 폴링해 반영한다 */}
          <div className="flex items-center gap-2">
            <span className={cn("text-[13px] leading-[18px]", SM.stub)}>
              {ko ? "Search Console" : "Search Console"}
            </span>
            {gsc.kind === "loading" && (
              <button type="button" disabled className={cn(SM.darkCta, "h-[32px] cursor-not-allowed opacity-50")}>
                {ko ? "확인 중…" : "Checking…"}
              </button>
            )}
            {gsc.kind === "error" && (
              <span className="text-[12px] leading-[16px] text-app-red">
                {ko ? `연결 상태를 확인할 수 없습니다 (${gsc.reason})` : `Cannot check connection (${gsc.reason})`}
              </span>
            )}
            {gsc.kind === "disconnected" && (
              // OAuth 시작 엔드포인트(302)라 클라이언트 라우팅이 아닌 전체 페이지 이동이 필요하다.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/api/gsc/auth/start/" className={cn(SM.darkCta, "h-[32px]")}>
                {ko ? "연결" : "Connect"}
              </a>
            )}
            {gsc.kind === "connected" && (
              <>
                <span className="max-w-[220px] truncate text-[13px] font-medium leading-[18px] text-a2-text">
                  {gsc.siteUrl ?? gsc.email ?? (ko ? "연결됨" : "Connected")}
                </span>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={disconnecting}
                  className={cn(SM.darkCta, "h-[32px] disabled:cursor-not-allowed disabled:opacity-50")}
                >
                  {disconnecting ? (ko ? "해제 중…" : "Disconnecting…") : ko ? "해제" : "Disconnect"}
                </button>
              </>
            )}
          </div>
          {actionError && (
            <p className="text-[12px] leading-[16px] text-app-red" role="alert">
              {actionError}
            </p>
          )}

          {/* Analytics 행: 연동 전이라 비활성 + 준비 중 표기를 유지한다 */}
          <div className="flex items-center gap-2">
            <span className={cn("text-[13px] leading-[18px]", SM.stub)}>
              {ko ? "Analytics" : "Analytics"}
            </span>
            <button
              type="button"
              disabled
              title={ko ? "Google Analytics 연동은 준비 중입니다." : "Google Analytics integration is coming soon."}
              className={cn(SM.darkCta, "h-[32px] cursor-not-allowed opacity-50")}
            >
              {ko ? "연결" : "Connect"}
            </button>
            <span className="rounded-[4px] bg-[#eef2f7] px-1.5 py-0.5 text-[11px] font-medium text-[#475166]">
              {ko ? "준비 중" : "Coming soon"}
            </span>
          </div>

          <button type="button" className={cn("text-[14px] leading-[20px] hover:underline", SM.stub)}>
            {ko ? "면책조항" : "Disclaimer"}
          </button>
        </div>
      </div>
    </WidgetCard>
  );
}

/** 숨겨진 위젯 스텁 (spec: widget-organic-backlinks.spec.md C-2) */
export function WidgetHiddenWidgets() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <WidgetCard ariaLabel={ko ? "숨겨진 위젯" : "Hidden widgets"} className="xl:col-span-4">
      <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
        <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.body)}>
          {ko ? "숨겨진 위젯" : "Hidden widgets"}
        </h3>
        <p className={cn("text-[16px] font-bold leading-[22px]", SM.stub)}>
          {ko ? "대시보드에 모든 위젯이 표시됩니다" : "All widgets are shown on the dashboard"}
        </p>
      </div>
    </WidgetCard>
  );
}
