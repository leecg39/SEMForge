"use client";

import { useRouter } from "next/navigation";
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
import { WidgetGoogleConnect, WidgetHiddenWidgets } from "@/components/seo-dash/WidgetStubs";

/**
 * ko.semrush.com/seo/30605634/ 위젯 대시보드 조립.
 * 4열 그리드(322.25px ×4, gap 24px) + 위젯 크기 규칙(medium 2열, small 1열, big 전폭).
 * 근거: docs/research/ko.semrush.com/seo-dashboard/PAGE_TOPOLOGY.md
 */
export function SeoWidgetDashboard({
  report,
  projects,
  currentDomain,
  monthlyRefDomains,
  dateLabel,
}: {
  report: DomainAnalyticsReport | null;
  projects: SeoDashProject[];
  currentDomain: string;
  monthlyRefDomains: RefDomainMonth[];
  dateLabel: string;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const projectName =
    projects.find((project) => project.domain === currentDomain)?.name ?? currentDomain;

  const selectProject = (domain: string) => {
    router.push(`/seo/?domain=${encodeURIComponent(domain)}`);
  };

  const secondaryWidgets = ko ? SECONDARY_WIDGETS_KO : SECONDARY_WIDGETS_EN;

  return (
    <div className="min-w-0">
      <SeoDashHeader
        projectName={projectName}
        projects={projects}
        currentDomain={currentDomain}
        onSelectProject={selectProject}
      />

      <hr className="border-0 bg-app-border" style={{ height: 1 }} aria-hidden="true" />

      <div
        className="grid grid-cols-1 gap-6 px-[18px] pb-[76px] pl-8 pt-4 md:grid-cols-2 xl:grid-cols-4"
        style={{ maxWidth: "max(100% - 14px, 1030px)" }}
      >
        <WidgetAiSearch />
        <WidgetSeoMetrics report={report} dateLabel={dateLabel} />
        {secondaryWidgets.slice(0, 4).map((widget) => (
          <WidgetSecondary key={widget.key} title={widget.title} description={widget.description} href={widget.href} />
        ))}
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
