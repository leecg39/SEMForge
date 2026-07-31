"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { SeoDashHeader, type SeoDashProject } from "@/components/seo-dash/SeoDashHeader";
import { WidgetAiSearch, type AiVisibilityWidgetSummary } from "@/components/seo-dash/WidgetAiSearch";
import { WidgetSeoMetrics } from "@/components/seo-dash/WidgetSeoMetrics";
import {
  WidgetSecondary,
  SECONDARY_WIDGETS_EN,
  SECONDARY_WIDGETS_KO,
} from "@/components/seo-dash/WidgetSecondary";
import { WidgetTrafficAnalytics } from "@/components/seo-dash/WidgetTrafficAnalytics";
import { WidgetOrganicRank } from "@/components/seo-dash/WidgetOrganicRank";
import { WidgetBacklinks, type RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import {
  WidgetSiteAudit,
  type SiteAuditWidgetSummary,
} from "@/components/seo-dash/WidgetSiteAudit";
import {
  WidgetPositionTracking,
  type PositionTrackingWidgetSummary,
} from "@/components/seo-dash/WidgetPositionTracking";
import { WidgetGoogleConnect, WidgetHiddenWidgets } from "@/components/seo-dash/WidgetStubs";
import { WidgetHideScope } from "@/components/seo-dash/tokens";
import {
  SeoCreateProjectDialog,
  SeoProjectSettingsDialog,
} from "@/components/seo-dash/SeoDashboardDialogs";
import {
  DEFAULT_SEO_PROJECT_SETTINGS,
  type SeoProjectSettingsValue,
  type SeoWidgetKey,
} from "@/lib/seo-project-settings";
import { cn } from "@/lib/utils";

type DomainCollectState = "collecting" | "refreshing" | "error";

function toSettingsValue(
  value: SeoProjectSettingsValue | null | undefined,
): SeoProjectSettingsValue {
  const source = value ?? DEFAULT_SEO_PROJECT_SETTINGS;
  return {
    countryCode: source.countryCode,
    device: source.device,
    searchEngine: source.searchEngine,
    resultScope: source.resultScope,
    hiddenWidgets: [...source.hiddenWidgets],
  };
}

function SeoDomainDataLoader({
  domain,
  countryCode,
  device,
}: {
  domain: string;
  countryCode: string;
  device: "desktop" | "mobile";
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [state, setState] = useState<DomainCollectState>("collecting");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/analytics/domain-overview/collect/", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain, countryCode, device }),
        });
        const body = (await response.json()) as {
          data?: { report?: DomainAnalyticsReport };
          error?: { message?: string };
        };
        if (!response.ok || !body.data?.report) {
          throw new Error(body.error?.message || `HTTP ${response.status}`);
        }
        setState("refreshing");
        router.refresh();
      } catch (caught) {
        if (controller.signal.aborted) return;
        setMessage(caught instanceof Error ? caught.message : null);
        setState("error");
      }
    })();
    return () => controller.abort();
  }, [countryCode, device, domain, router]);

  const label =
    state === "collecting"
      ? ko
        ? `${domain}의 실제 검색 데이터를 수집하고 있습니다…`
        : `Collecting live search data for ${domain}…`
      : state === "refreshing"
        ? ko
          ? "수집한 데이터로 위젯을 업데이트하고 있습니다…"
          : "Updating widgets with the collected data…"
        : message || (ko ? "사이트 데이터를 가져오지 못했습니다." : "Could not load site data.");

  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "xl:col-span-4 flex min-h-11 items-center gap-3 rounded-[8px] border px-4 py-2.5 text-[13px]",
        state === "error"
          ? "border-[#ffc8d4] bg-[#fff4f6] text-[#a80028]"
          : "border-[#b9d8f2] bg-[#f2f8fd] text-[#235c85]",
      )}
    >
      {(state === "collecting" || state === "refreshing") && (
        <ReloadIcon className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      )}
      {label}
    </div>
  );
}

/**
 * ko.semforge.com/seo/30605634/ 위젯 대시보드 조립.
 * 4열 그리드(322.25px ×4, gap 24px) + 위젯 크기 규칙(medium 2열, small 1열, big 전폭).
 * 근거: docs/research/ko.semforge.com/seo-dashboard/PAGE_TOPOLOGY.md
 */
export function SeoWidgetDashboard({
  report,
  projects,
  currentProjectId,
  currentDomain,
  countryCode,
  device,
  monthlyRefDomains,
  dateLabel,
  siteAuditSummary,
  positionTrackingSummary,
  aiVisibilitySummary,
  settings: initialSettings,
}: {
  report: DomainAnalyticsReport | null;
  projects: SeoDashProject[];
  currentProjectId: string;
  currentDomain: string;
  countryCode: string;
  device: "desktop" | "mobile";
  monthlyRefDomains: RefDomainMonth[];
  dateLabel: string;
  siteAuditSummary: SiteAuditWidgetSummary | null;
  positionTrackingSummary: PositionTrackingWidgetSummary | null;
  aiVisibilitySummary?: AiVisibilityWidgetSummary | null;
  settings: SeoProjectSettingsValue | null;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [selectedDomain, setSelectedDomain] = useState(currentDomain);
  const [navigationPending, setNavigationPending] = useState(false);
  const [settings, setSettings] = useState<SeoProjectSettingsValue>(() =>
    toSettingsValue(initialSettings),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const projectName =
    projects.find((project) => project.domain === selectedDomain)?.name ?? selectedDomain;

  const selectProject = (projectId: string) => {
    if (projectId === currentProjectId) return;
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setSelectedDomain(project.domain);
    setNavigationPending(true);
    router.push(`/seo/?project=${encodeURIComponent(projectId)}`);
  };

  const saveSettings = async (next: SeoProjectSettingsValue) => {
    if (!currentProjectId) return;
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const response = await fetch(
        `/api/seo/projects/${encodeURIComponent(currentProjectId)}/settings/`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(next),
        },
      );
      const body = (await response.json()) as {
        data?: SeoProjectSettingsValue;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      }
      setSettings(toSettingsValue(body.data));
      setSettingsOpen(false);
      setNavigationPending(true);
      router.refresh();
    } catch (caught) {
      setSettingsError(
        caught instanceof Error
          ? caught.message
          : ko
            ? "설정을 저장하지 못했습니다."
            : "Could not save settings.",
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const restoreWidget = (key: string) => {
    void saveSettings({
      ...settings,
      hiddenWidgets: settings.hiddenWidgets.filter((item) => item !== key),
    });
  };

  const hideWidget = (key: SeoWidgetKey) => {
    void saveSettings({
      ...settings,
      hiddenWidgets: [...new Set([...settings.hiddenWidgets, key])],
    });
  };

  const share = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("project", currentProjectId);
      url.searchParams.delete("domain");
      await navigator.clipboard.writeText(url.toString());
      setShareStatus(ko ? "복사됨" : "Copied");
    } catch {
      setShareStatus(ko ? "복사 실패" : "Copy failed");
    }
    window.setTimeout(() => setShareStatus(null), 1800);
  };

  const hidden = new Set<SeoWidgetKey>(settings.hiddenWidgets);
  const visible = (key: SeoWidgetKey) => !hidden.has(key);

  const secondaryWidgets = ko ? SECONDARY_WIDGETS_KO : SECONDARY_WIDGETS_EN;

  return (
    <div className="min-w-0">
      <SeoDashHeader
        projectName={projectName}
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={selectProject}
        onCreateProject={() => setCreateOpen(true)}
        onShare={() => void share()}
        onOpenSettings={() => setSettingsOpen(true)}
        shareStatus={shareStatus}
        loading={navigationPending}
      />

      <hr className="border-0 bg-app-border" style={{ height: 1 }} aria-hidden="true" />

      <div
        aria-busy={navigationPending}
        className="grid grid-cols-1 gap-6 px-[18px] pb-[76px] pl-8 pt-4 md:grid-cols-2 xl:grid-cols-4"
        style={{ maxWidth: "max(100% - 14px, 1030px)" }}
      >
        {!report && currentDomain && (
          <SeoDomainDataLoader domain={currentDomain} countryCode={countryCode} device={device} />
        )}
        {visible("aiSearch") && (
          <WidgetHideScope label="AI Search" onHide={() => hideWidget("aiSearch")}>
            <WidgetAiSearch summary={aiVisibilitySummary} domain={currentDomain} />
          </WidgetHideScope>
        )}
        {visible("seoMetrics") && (
          <WidgetHideScope label="SEO domain metrics" onHide={() => hideWidget("seoMetrics")}>
            <WidgetSeoMetrics report={report} dateLabel={dateLabel} />
          </WidgetHideScope>
        )}
        {secondaryWidgets.slice(0, 4).map((widget) => {
          if (!visible(widget.key as SeoWidgetKey)) return null;
          if (widget.key === "positionTracking") {
            return (
              <WidgetPositionTracking
                key={widget.key}
                summary={positionTrackingSummary}
                domain={currentDomain}
                onHide={() => hideWidget("positionTracking")}
              />
            );
          }
          if (widget.key === "siteAudit" && siteAuditSummary) {
            return (
              <WidgetHideScope
                key={widget.key}
                label={widget.title}
                onHide={() => hideWidget("siteAudit")}
              >
                <WidgetSiteAudit summary={siteAuditSummary} />
              </WidgetHideScope>
            );
          }
          return (
            <WidgetHideScope
              key={widget.key}
              label={widget.title}
              onHide={() => hideWidget(widget.key as SeoWidgetKey)}
            >
              <WidgetSecondary
                title={widget.title}
                description={widget.description}
                href={widget.href}
              />
            </WidgetHideScope>
          );
        })}
        {secondaryWidgets[4] && visible("organicTrafficInsights") && (
          <WidgetHideScope
            label={secondaryWidgets[4].title}
            onHide={() => hideWidget("organicTrafficInsights")}
          >
            <WidgetSecondary
              title={secondaryWidgets[4].title}
              description={secondaryWidgets[4].description}
              href={secondaryWidgets[4].href}
            />
          </WidgetHideScope>
        )}
        {visible("trafficAnalytics") && (
          <WidgetHideScope label="Traffic Analytics" onHide={() => hideWidget("trafficAnalytics")}>
            <WidgetTrafficAnalytics report={report} />
          </WidgetHideScope>
        )}
        {visible("organicPositions") && (
          <WidgetHideScope label="Organic Positions" onHide={() => hideWidget("organicPositions")}>
            <WidgetOrganicRank report={report} />
          </WidgetHideScope>
        )}
        {visible("backlinks") && (
          <WidgetHideScope label="Backlinks" onHide={() => hideWidget("backlinks")}>
            <WidgetBacklinks report={report} monthly={monthlyRefDomains} />
          </WidgetHideScope>
        )}
        {visible("googleServices") && (
          <WidgetHideScope label="Google services" onHide={() => hideWidget("googleServices")}>
            <WidgetGoogleConnect />
          </WidgetHideScope>
        )}
        <WidgetHiddenWidgets
          hidden={settings.hiddenWidgets.map((key) => ({
            key,
            label:
              (ko ? SECONDARY_WIDGETS_KO : SECONDARY_WIDGETS_EN).find(
                (item) => item.key === key,
              )?.title ?? key,
          }))}
          onRestore={restoreWidget}
        />
        <div className="xl:col-span-4">
          <button
            type="button"
            className="text-[12px] text-a2-text-muted underline underline-offset-2 hover:text-a2-text"
          >
            {ko ? "위젯 제안" : "Suggest a widget"}
          </button>
        </div>
      </div>
      <SeoProjectSettingsDialog
        key={`${settings.countryCode}:${settings.device}:${settings.searchEngine}:${settings.resultScope}:${settings.hiddenWidgets.join(",")}`}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        ko={ko}
        saving={savingSettings}
        error={settingsError}
        onSave={saveSettings}
      />
      <SeoCreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ko={ko}
        onCreated={(project) => {
          setNavigationPending(true);
          router.push(`/seo/?project=${encodeURIComponent(project.id)}`);
        }}
      />
    </div>
  );
}
