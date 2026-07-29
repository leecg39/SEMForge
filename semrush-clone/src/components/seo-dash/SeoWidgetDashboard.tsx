"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { SeoDashHeader, type SeoDashProject } from "@/components/seo-dash/SeoDashHeader";
import { WidgetAiSearch } from "@/components/seo-dash/WidgetAiSearch";
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
import { cn } from "@/lib/utils";

type DomainCollectState = "collecting" | "refreshing" | "empty" | "error";

function SeoDomainDataLoader({
  domain,
  countryCode,
}: {
  domain: string;
  countryCode: string;
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
          body: JSON.stringify({ domain, countryCode, device: "desktop" }),
        });
        const body = (await response.json()) as {
          data?: { collected?: number };
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message || `HTTP ${response.status}`);
        }
        if ((body.data.collected ?? 0) > 0) {
          setState("refreshing");
          router.refresh();
          return;
        }
        setState("empty");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setMessage(caught instanceof Error ? caught.message : null);
        setState("error");
      }
    })();
    return () => controller.abort();
  }, [countryCode, domain, router]);

  const label =
    state === "collecting"
      ? ko
        ? `${domain}의 실제 검색 데이터를 수집하고 있습니다…`
        : `Collecting live search data for ${domain}…`
      : state === "refreshing"
        ? ko
          ? "수집한 데이터로 위젯을 업데이트하고 있습니다…"
          : "Updating widgets with the collected data…"
        : state === "empty"
          ? ko
            ? "수집은 완료됐지만 이 사이트의 검색 순위를 아직 찾지 못했습니다."
            : "Collection finished, but no rankings were found for this site yet."
          : message || (ko ? "사이트 데이터를 가져오지 못했습니다." : "Could not load site data.");

  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "xl:col-span-4 flex min-h-11 items-center gap-3 rounded-[8px] border px-4 py-2.5 text-[13px]",
        state === "error"
          ? "border-[#ffc8d4] bg-[#fff4f6] text-[#a80028]"
          : state === "empty"
            ? "border-[#f1d49a] bg-[#fff9ec] text-[#77530c]"
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
 * ko.semrush.com/seo/30605634/ 위젯 대시보드 조립.
 * 4열 그리드(322.25px ×4, gap 24px) + 위젯 크기 규칙(medium 2열, small 1열, big 전폭).
 * 근거: docs/research/ko.semrush.com/seo-dashboard/PAGE_TOPOLOGY.md
 */
export function SeoWidgetDashboard({
  report,
  projects,
  currentDomain,
  countryCode,
  monthlyRefDomains,
  dateLabel,
  siteAuditSummary,
  positionTrackingSummary,
}: {
  report: DomainAnalyticsReport | null;
  projects: SeoDashProject[];
  currentDomain: string;
  countryCode: string;
  monthlyRefDomains: RefDomainMonth[];
  dateLabel: string;
  siteAuditSummary: SiteAuditWidgetSummary | null;
  positionTrackingSummary: PositionTrackingWidgetSummary | null;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [selectedDomain, setSelectedDomain] = useState(currentDomain);
  const [navigationPending, setNavigationPending] = useState(false);
  const projectName =
    projects.find((project) => project.domain === selectedDomain)?.name ?? selectedDomain;

  const selectProject = (domain: string) => {
    if (domain === currentDomain) return;
    setSelectedDomain(domain);
    setNavigationPending(true);
    router.push(`/seo/?domain=${encodeURIComponent(domain)}`);
  };

  const secondaryWidgets = ko ? SECONDARY_WIDGETS_KO : SECONDARY_WIDGETS_EN;

  return (
    <div className="min-w-0">
      <SeoDashHeader
        projectName={projectName}
        projects={projects}
        currentDomain={selectedDomain}
        onSelectProject={selectProject}
        loading={navigationPending}
      />

      <hr className="border-0 bg-app-border" style={{ height: 1 }} aria-hidden="true" />

      <div
        aria-busy={navigationPending}
        className="grid grid-cols-1 gap-6 px-[18px] pb-[76px] pl-8 pt-4 md:grid-cols-2 xl:grid-cols-4"
        style={{ maxWidth: "max(100% - 14px, 1030px)" }}
      >
        {!report && <SeoDomainDataLoader domain={currentDomain} countryCode={countryCode} />}
        <WidgetAiSearch />
        <WidgetSeoMetrics report={report} dateLabel={dateLabel} />
        {secondaryWidgets.slice(0, 4).map((widget) => {
          if (widget.key === "positionTracking") {
            return (
              <WidgetPositionTracking
                key={widget.key}
                summary={positionTrackingSummary}
                domain={currentDomain}
              />
            );
          }
          if (widget.key === "siteAudit" && siteAuditSummary) {
            return <WidgetSiteAudit key={widget.key} summary={siteAuditSummary} />;
          }
          return (
            <WidgetSecondary
              key={widget.key}
              title={widget.title}
              description={widget.description}
              href={widget.href}
            />
          );
        })}
        {secondaryWidgets[4] && (
          <WidgetSecondary
            title={secondaryWidgets[4].title}
            description={secondaryWidgets[4].description}
            href={secondaryWidgets[4].href}
          />
        )}
        <WidgetTrafficAnalytics report={report} />
        <WidgetOrganicRank report={report} />
        <WidgetBacklinks report={report} monthly={monthlyRefDomains} />
        <WidgetGoogleConnect />
        <WidgetHiddenWidgets />
        <div className="xl:col-span-4">
          <button
            type="button"
            className="text-[12px] text-a2-text-muted underline underline-offset-2 hover:text-a2-text"
          >
            {ko ? "위젯 제안" : "Suggest a widget"}
          </button>
        </div>
      </div>
    </div>
  );
}
