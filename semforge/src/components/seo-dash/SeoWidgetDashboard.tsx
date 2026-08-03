"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, ReloadIcon } from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import { SeoDashHeader } from "@/components/seo-dash/SeoDashHeader";
import { SeoProjectCreateDialog } from "@/components/siteaudit/SeoProjectCreateDialog";
import { SiteAuditProjectSetupDialog } from "@/components/siteaudit/SiteAuditProjectSetupDialog";
import type { SeoDashboardSnapshot } from "@/components/seo-dash/types";
import { WidgetAiSearch } from "@/components/seo-dash/WidgetAiSearch";
import { WidgetBacklinks } from "@/components/seo-dash/WidgetBacklinks";
import { WidgetOnPageSeo } from "@/components/seo-dash/WidgetOnPageSeo";
import { WidgetOrganicRank } from "@/components/seo-dash/WidgetOrganicRank";
import { WidgetPositionTrackingCompact } from "@/components/seo-dash/WidgetPositionTracking";
import {
  SECONDARY_WIDGETS_EN,
  SECONDARY_WIDGETS_KO,
  WidgetSecondary,
} from "@/components/seo-dash/WidgetSecondary";
import { WidgetSeoMetrics } from "@/components/seo-dash/WidgetSeoMetrics";
import { WidgetSiteAudit } from "@/components/seo-dash/WidgetSiteAudit";
import {
  WidgetGoogleConnect,
  WidgetHiddenWidgets,
} from "@/components/seo-dash/WidgetStubs";
import { WidgetTopSearchPages } from "@/components/seo-dash/WidgetTopSearchPages";
import { WidgetTrafficAnalytics } from "@/components/seo-dash/WidgetTrafficAnalytics";
import { useSeoGscDashboard } from "@/components/seo-dash/use-seo-gsc";
import {
  parseHiddenWidgets,
  preferenceStorageKey,
  type SeoWidgetId,
} from "@/components/seo-dash/widget-preferences";
import { SM } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";
import styles from "@/components/seo-dash/SeoWidgetDashboard.module.css";

type DomainCollectState = "idle" | "collecting" | "refreshing" | "stale" | "error";

function SeoDomainDataLoader({ domain, countryCode }: { domain: string; countryCode: string }) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [state, setState] = useState<DomainCollectState>("collecting");
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const guardKey = `semforge:seo-domain-collect:v1:${countryCode}:${domain}`;
    if (sessionStorage.getItem(guardKey)) {
      queueMicrotask(() => setState("idle"));
      return;
    }
    const controller = new AbortController();
    let staleTimer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        const response = await fetch("/api/analytics/domain-overview/collect/", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain, countryCode, device: "desktop" }),
        });
        const body = (await response.json()) as {
          data?: { collected?: number; ranked?: number; outcomes?: { error?: string }[] };
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message || `HTTP ${response.status}`);
        }
        if ((body.data.ranked ?? 0) > 0) {
          sessionStorage.setItem(guardKey, "ranked");
          setState("refreshing");
          router.refresh();
          staleTimer = setTimeout(() => setState("stale"), 8000);
          return;
        }
        if ((body.data.collected ?? 0) > 0) {
          sessionStorage.setItem(guardKey, "empty");
          setState("idle");
          return;
        }
        throw new Error(body.data.outcomes?.find((outcome) => outcome.error)?.error ?? (ko ? "수집 가능한 키워드가 없습니다." : "No keywords could be collected."));
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : null);
        setState("error");
      }
    })();

    return () => {
      controller.abort();
      if (staleTimer) clearTimeout(staleTimer);
    };
  }, [attempt, countryCode, domain, ko, router]);

  if (state === "idle") return null;
  const label = state === "collecting"
    ? ko ? `${domain}의 실제 검색 데이터를 수집하고 있습니다.` : `Collecting live search data for ${domain}.`
    : state === "refreshing"
      ? ko ? "수집한 데이터로 위젯을 업데이트하고 있습니다." : "Updating widgets with collected data."
      : state === "stale"
        ? ko ? "수집은 완료됐지만 반영이 지연되고 있습니다. 다시 불러와 주세요." : "Collection completed, but the dashboard refresh is delayed."
        : message || (ko ? "사이트 데이터를 가져오지 못했습니다." : "Could not load site data.");

  return (
    <div role={state === "error" ? "alert" : "status"} aria-live="polite" className={cn("mb-6 flex min-h-11 items-center gap-3 rounded-[8px] border px-4 py-2.5 text-[12px]", state === "error" ? "border-[#ffc8d4] bg-[#fff4f6] text-[#a80028]" : "border-[#b9d8f2] bg-[#f2f8fd] text-[#235c85]")}>
      {(state === "collecting" || state === "refreshing") && <ReloadIcon className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
      <span className="min-w-0 flex-1">{label}</span>
      {(state === "error" || state === "stale") && (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            if (state === "stale") {
              setState("refreshing");
              router.refresh();
              return;
            }
            setState("collecting");
            setAttempt((value) => value + 1);
          }}
          className="shrink-0 rounded-[6px] border border-current px-2.5 py-1 font-medium hover:bg-white/70"
        >
          {ko ? "다시 시도" : "Retry"}
        </button>
      )}
    </div>
  );
}

function DashboardWidget({ id, label, className, onHide, children }: { id: SeoWidgetId; label: string; className?: string; onHide: (id: SeoWidgetId) => void; children: React.ReactNode }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <div className={cn(styles.widgetSlot, className)} data-widget={id}>
      {children}
      <button type="button" className={styles.hideButton} onClick={() => onHide(id)} aria-label={ko ? `${label} 위젯 숨기기` : `Hide ${label} widget`}>
        <Cross2Icon aria-hidden="true" />
      </button>
    </div>
  );
}

function WidgetSettingsDialog({ open, onOpenChange, widgets, hidden, onToggle }: { open: boolean; onOpenChange: (open: boolean) => void; widgets: { id: SeoWidgetId; label: string }[]; hidden: SeoWidgetId[]; onToggle: (id: SeoWidgetId, visible: boolean) => void }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[710] w-[min(500px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.25)] focus:outline-none">
          <div className="flex items-start justify-between border-b border-app-border px-5 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-semibold text-a2-text">{ko ? "대시보드 위젯 설정" : "Dashboard widget settings"}</Dialog.Title>
              <Dialog.Description className={cn("mt-1 text-[12px]", SM.caption)}>{ko ? "표시할 위젯을 선택합니다. 이 브라우저에 프로젝트별로 저장됩니다." : "Choose visible widgets. This is saved per project in this browser."}</Dialog.Description>
            </div>
            <Dialog.Close asChild><button type="button" aria-label={ko ? "닫기" : "Close"} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-a2-text-muted hover:bg-app-bg"><Cross2Icon /></button></Dialog.Close>
          </div>
          <div className="grid max-h-[60vh] gap-1 overflow-y-auto px-5 py-4 sm:grid-cols-2">
            {widgets.map((widget) => {
              const visible = !hidden.includes(widget.id);
              return (
                <label key={widget.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[7px] px-3 py-2 hover:bg-app-bg">
                  <input type="checkbox" checked={visible} onChange={(event) => onToggle(widget.id, event.target.checked)} className="h-4 w-4 accent-[#235fe2]" />
                  <span className="text-[13px] font-medium text-a2-text">{widget.label}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end border-t border-app-border px-5 py-4"><Dialog.Close asChild><button type="button" className={cn(SM.darkCta, "h-9")}>{ko ? "완료" : "Done"}</button></Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SeoWidgetDashboard({
  snapshot,
  preferenceScope,
  canManage,
}: {
  snapshot: SeoDashboardSnapshot;
  preferenceScope: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [selectedDomain, setSelectedDomain] = useState(snapshot.currentDomain);
  const [navigationPending, setNavigationPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [siteAuditSetupOpen, setSiteAuditSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hidden, setHidden] = useState<SeoWidgetId[]>([]);
  const suggestionRef = useRef<HTMLButtonElement>(null);
  const storageKey = preferenceStorageKey(preferenceScope);
  const { state: gsc, refresh: refreshGsc } = useSeoGscDashboard(snapshot.currentDomain);

  const widgetDefinitions = useMemo<{ id: SeoWidgetId; label: string }[]>(() => [
    { id: "aiSearch", label: ko ? "AI 검색" : "AI Search" },
    { id: "seoMetrics", label: "SEO" },
    { id: "positionTracking", label: ko ? "포지션 추적" : "Position Tracking" },
    { id: "siteAudit", label: ko ? "사이트 진단" : "Site Audit" },
    { id: "onPageSeo", label: ko ? "온페이지 SEO 분석" : "On Page SEO" },
    { id: "backlinkAudit", label: ko ? "백링크 진단" : "Backlink Audit" },
    { id: "organicTrafficInsights", label: ko ? "자연 트래픽 인사이트" : "Organic Traffic Insights" },
    { id: "trafficAnalytics", label: "Traffic Analytics" },
    { id: "topSearchPages", label: ko ? "상위 검색 페이지" : "Top search pages" },
    { id: "organicRank", label: ko ? "자연 검색 순위" : "Organic positions" },
    { id: "backlinks", label: ko ? "백링크" : "Backlinks" },
    { id: "googleConnect", label: "Google Search Console" },
  ], [ko]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHidden(parseHiddenWidgets(localStorage.getItem(storageKey)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedDomain(snapshot.currentDomain);
      setNavigationPending(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [snapshot.currentDomain]);

  useEffect(() => {
    const state = snapshot.siteAuditSummary?.state;
    if (state !== "queued" && state !== "running") return;
    const timer = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [router, snapshot.siteAuditSummary?.state]);

  const persistHidden = useCallback((next: SeoWidgetId[]) => {
    setHidden(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);
  const hideWidget = useCallback((id: SeoWidgetId) => {
    persistHidden(hidden.includes(id) ? hidden : [...hidden, id]);
  }, [hidden, persistHidden]);
  const restoreWidget = useCallback((id: string) => {
    persistHidden(hidden.filter((item) => item !== id));
  }, [hidden, persistHidden]);
  const toggleWidget = useCallback((id: SeoWidgetId, visible: boolean) => {
    persistHidden(visible ? hidden.filter((item) => item !== id) : hidden.includes(id) ? hidden : [...hidden, id]);
  }, [hidden, persistHidden]);
  const visible = (id: SeoWidgetId) => !hidden.includes(id);

  const selectProject = (domain: string) => {
    if (domain === snapshot.currentDomain) return;
    setSelectedDomain(domain);
    setNavigationPending(true);
    router.push(`/seo/?domain=${encodeURIComponent(domain)}`);
  };

  const share = async () => {
    const url = new URL("/seo/", window.location.origin);
    if (snapshot.currentDomain) url.searchParams.set("domain", snapshot.currentDomain);
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatusMessage(ko ? "대시보드 주소를 복사했습니다." : "Dashboard URL copied.");
    } catch {
      const input = document.createElement("textarea");
      input.value = url.toString();
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setStatusMessage(ko ? "대시보드 주소를 복사했습니다." : "Dashboard URL copied.");
    }
  };

  const openFeedback = () => {
    const toolbarButton = document.querySelector<HTMLElement>("[data-agentation-toolbar] button");
    if (toolbarButton) {
      toolbarButton.click();
      return;
    }
    suggestionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    suggestionRef.current?.focus();
    setStatusMessage(ko ? "개발 환경에서는 화면 오른쪽 아래의 주석 도구로 의견을 남길 수 있습니다." : "In development, use the annotation tool in the lower-right corner to leave feedback.");
  };

  const projectName = snapshot.projects.find((project) => project.domain === selectedDomain)?.name ?? selectedDomain;
  const secondaryWidgets = ko ? SECONDARY_WIDGETS_KO : SECONDARY_WIDGETS_EN;
  const secondaryByKey = new Map(secondaryWidgets.map((widget) => [widget.key, widget]));
  const siteAuditWidget = secondaryByKey.get("siteAudit");
  const backlinkAuditWidget = secondaryByKey.get("backlinkAudit");
  const organicTrafficWidget = secondaryByKey.get("organicTrafficInsights");
  const hiddenWidgets = widgetDefinitions.filter((widget) => hidden.includes(widget.id));

  return (
    <div className={styles.dashboard}>
      <SeoDashHeader projectName={projectName} projects={snapshot.projects} currentDomain={selectedDomain} onSelectProject={selectProject} onCreateProject={() => setCreateOpen(true)} onShare={() => void share()} onOpenSettings={() => setSettingsOpen(true)} onFeedback={openFeedback} loading={navigationPending} statusMessage={statusMessage} />
      <hr className="h-px border-0 bg-app-border" aria-hidden="true" />

      <main aria-busy={navigationPending} className="min-w-0 px-4 pb-20 pt-4 sm:px-6 xl:px-8">
        {statusMessage && <div className="fixed bottom-6 left-1/2 z-[650] -translate-x-1/2 rounded-full bg-[#1a1e1a] px-4 py-2 text-[12px] font-medium text-white shadow-lg" role="status" aria-live="polite">{statusMessage}</div>}
        {!snapshot.currentDomain ? (
          <section className="flex min-h-[500px] flex-col items-center justify-center rounded-[10px] bg-white px-6 text-center shadow-[var(--a2-card-shadow)]">
            <Image src="/seo-dashboard/empty-traffic.png" alt="" width={160} height={160} className="h-40 w-40 object-contain" />
            <h2 className="mt-4 text-[22px] font-semibold text-a2-text">{ko ? "첫 SEO 프로젝트를 만들어 주세요" : "Create your first SEO project"}</h2>
            <p className={cn("mt-2 max-w-[520px] text-[13px] leading-5", SM.caption)}>{ko ? "도메인을 등록하면 사이트 진단, 검색 순위, AI 가시성, 백링크와 Search Console 데이터를 한 화면에서 확인할 수 있습니다." : "Register a domain to view site audits, rankings, AI visibility, backlinks, and Search Console data in one place."}</p>
            <button type="button" onClick={() => setCreateOpen(true)} className={cn(SM.darkCta, "mt-5 h-10 px-5")}>{ko ? "SEO 프로젝트 만들기" : "Create SEO project"}</button>
          </section>
        ) : (
          <>
            {!snapshot.report && <SeoDomainDataLoader domain={snapshot.currentDomain} countryCode={snapshot.countryCode} />}

            <div className={styles.topGrid}>
              {visible("aiSearch") && <DashboardWidget id="aiSearch" label={widgetDefinitions[0].label} className={styles.aiSearch} onHide={hideWidget}><WidgetAiSearch summary={snapshot.aiVisibilitySummary} domain={snapshot.currentDomain} folderId={snapshot.currentFolderId} /></DashboardWidget>}
              {visible("seoMetrics") && <DashboardWidget id="seoMetrics" label="SEO" className={styles.seoMetrics} onHide={hideWidget}><WidgetSeoMetrics report={snapshot.report} dateLabel={snapshot.dateLabel} countryCode={snapshot.countryCode} monthly={snapshot.monthlyRefDomains} /></DashboardWidget>}
              {visible("positionTracking") && <DashboardWidget id="positionTracking" label={ko ? "포지션 추적" : "Position Tracking"} className={styles.positionTracking} onHide={hideWidget}><WidgetPositionTrackingCompact summary={snapshot.positionTrackingSummary} domain={snapshot.positionTrackingDomain} folderId={snapshot.currentFolderId} activeRun={snapshot.positionTrackingActiveRun} /></DashboardWidget>}
              {visible("siteAudit") && siteAuditWidget && <DashboardWidget id="siteAudit" label={ko ? "사이트 진단" : "Site Audit"} className={styles.siteAudit} onHide={hideWidget}>{snapshot.siteAuditSummary ? <WidgetSiteAudit summary={snapshot.siteAuditSummary} canManage={canManage} onSetup={() => setSiteAuditSetupOpen(true)} /> : <WidgetSecondary title={siteAuditWidget.title} description={siteAuditWidget.description} href={siteAuditWidget.href} />}</DashboardWidget>}
              {visible("onPageSeo") && <DashboardWidget id="onPageSeo" label={ko ? "온페이지 SEO 분석" : "On Page SEO"} className={styles.onPageSeo} onHide={hideWidget}><WidgetOnPageSeo summary={snapshot.onpageSummary} /></DashboardWidget>}
              {visible("backlinkAudit") && backlinkAuditWidget && <DashboardWidget id="backlinkAudit" label={ko ? "백링크 진단" : "Backlink Audit"} className={styles.backlinkAudit} onHide={hideWidget}><WidgetSecondary title={backlinkAuditWidget.title} description={backlinkAuditWidget.description} href={backlinkAuditWidget.href} ctaLabel={ko ? "준비 중" : "Coming soon"} /></DashboardWidget>}
              {visible("organicTrafficInsights") && organicTrafficWidget && <DashboardWidget id="organicTrafficInsights" label={ko ? "자연 트래픽 인사이트" : "Organic Traffic Insights"} className={styles.organicTrafficInsights} onHide={hideWidget}><WidgetSecondary title={organicTrafficWidget.title} description={organicTrafficWidget.description} href={organicTrafficWidget.href} ctaLabel={ko ? "준비 중" : "Coming soon"} /></DashboardWidget>}
            </div>

            <div className={cn(styles.analysisGrid, "mt-6")}>
              <div className={styles.analysisLeft}>
                {visible("trafficAnalytics") && <DashboardWidget id="trafficAnalytics" label="Traffic Analytics" onHide={hideWidget}><WidgetTrafficAnalytics report={snapshot.report} gsc={gsc} /></DashboardWidget>}
                {visible("topSearchPages") && <DashboardWidget id="topSearchPages" label={ko ? "상위 검색 페이지" : "Top search pages"} onHide={hideWidget}><WidgetTopSearchPages gsc={gsc} /></DashboardWidget>}
                {visible("googleConnect") && <DashboardWidget id="googleConnect" label="Google Search Console" onHide={hideWidget}><WidgetGoogleConnect gsc={gsc} domain={snapshot.currentDomain} onRefresh={refreshGsc} /></DashboardWidget>}
              </div>
              <div className={styles.analysisRight}>
                {visible("organicRank") && <DashboardWidget id="organicRank" label={ko ? "자연 검색 순위" : "Organic positions"} onHide={hideWidget}><WidgetOrganicRank report={snapshot.report} countryCode={snapshot.countryCode} /></DashboardWidget>}
                {visible("backlinks") && <DashboardWidget id="backlinks" label={ko ? "백링크" : "Backlinks"} onHide={hideWidget}><WidgetBacklinks report={snapshot.report} monthly={snapshot.monthlyRefDomains} /></DashboardWidget>}
              </div>
            </div>

            <div className="mt-6"><WidgetHiddenWidgets hidden={hiddenWidgets} onRestore={restoreWidget} onRestoreAll={() => persistHidden([])} /></div>
            <button id="seo-widget-suggestion" ref={suggestionRef} type="button" onClick={openFeedback} className={cn("mt-4 rounded-[6px] px-1 py-1 text-[12px] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue", SM.link)}>{ko ? "신규 위젯 제안하기" : "Suggest a new widget"}</button>
          </>
        )}
      </main>

      <SeoProjectCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(project) => { setSelectedDomain(project.domain); setNavigationPending(true); router.push(`/seo/?domain=${encodeURIComponent(project.domain)}`); router.refresh(); }} />
      {siteAuditSetupOpen && snapshot.project && (
        <SiteAuditProjectSetupDialog
          open
          onOpenChange={setSiteAuditSetupOpen}
          project={snapshot.project}
          config={null}
          emailConfigured={snapshot.siteAuditEmailConfigured}
          onSaved={(_campaignId, started) => {
            setStatusMessage(
              started
                ? (ko ? "사이트 진단을 대기열에 추가했습니다." : "The site audit was added to the queue.")
                : (ko ? "사이트 진단 설정을 저장했습니다." : "Site audit settings saved."),
            );
            router.refresh();
          }}
        />
      )}
      <WidgetSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} widgets={widgetDefinitions} hidden={hidden} onToggle={toggleWidget} />
    </div>
  );
}
