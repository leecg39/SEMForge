"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { SM, SelectLink, Sparkline, DeltaBadge, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function monthDelta(trend: { organicTrafficEstimate: number | null }[]): number | null {
  if (trend.length < 2) return null;
  const prev = trend[trend.length - 2].organicTrafficEstimate;
  const curr = trend[trend.length - 1].organicTrafficEstimate;
  if (!prev || curr === null) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * SEO 지표 위젯 (spec: docs/research/components/widget-seo-metrics.spec.md).
 * Authority Score·자연 트래픽은 라이브 리포트에서만 표시하고,
 * SEMForge 순위/유료 지표는 소스가 없어 "소스 없음"으로 표기한다.
 */
export function WidgetSeoMetrics({
  report,
  dateLabel,
}: {
  report: DomainAnalyticsReport | null;
  dateLabel: string;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const trend = report?.trend ?? [];
  const trafficDelta = monthDelta(trend);

  return (
    <WidgetCard ariaLabel="SEO" className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.title)}>SEO</h3>
        <div className="flex items-center gap-3">
          <SelectLink>{ko ? "루트 도메인" : "Root domain"}</SelectLink>
          <SelectLink>United States</SelectLink>
          <SelectLink>{ko ? "데스크톱" : "Desktop"}</SelectLink>
          <span className={cn("text-[14px] leading-[20px]", SM.caption)}>{dateLabel}</span>
        </div>
      </div>

      {/* Authority Score 행 */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-[14px] leading-[20px]", SM.body)}>Authority Score</span>
          <span className={cn("text-[20px] font-bold leading-[24px]", SM.title)}>
            {report?.metrics.authorityScore ? report.metrics.authorityScore.value : "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-[14px] leading-[20px]", SM.body)}>
            {ko ? "SEMForge 순위" : "SEMForge Rank"}
          </span>
          <span className={cn("text-[20px] font-bold leading-[24px] text-app-text-muted")}>—</span>
          <span className="rounded-full bg-[#ececee] px-1.5 py-px text-[10px] font-medium text-[#5f6368]">
            {ko ? "소스 없음" : "No source"}
          </span>
        </div>
      </div>

      <hr className="-ml-5 mb-5 mt-3 border-0 bg-app-border" style={{ height: 1 }} />

      {/* 지표 그리드 (실측 154px 열) */}
      <div className="grid gap-x-3 gap-y-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div className="flex flex-col">
          <span className={cn("mb-2 flex items-center gap-1 text-[14px] leading-[14px]", SM.body)}>
            {ko ? "유료 키워드" : "Paid keywords"}
            <span className="rounded-full bg-[#ececee] px-1.5 py-px text-[10px] font-medium text-[#5f6368]">
              {ko ? "소스 없음" : "No source"}
            </span>
          </span>
          <div className="mb-2 flex h-6 items-center gap-2">
            <span className={cn("text-[20px] font-bold leading-[24px] text-app-text-muted")}>—</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className={cn("mb-2 flex items-center gap-1 text-[14px] leading-[14px]", SM.body)}>
            {ko ? "유료 트래픽" : "Paid traffic"}
            <span className="rounded-full bg-[#ececee] px-1.5 py-px text-[10px] font-medium text-[#5f6368]">
              {ko ? "소스 없음" : "No source"}
            </span>
          </span>
          <div className="mb-2 flex h-6 items-center gap-2">
            <span className={cn("text-[20px] font-bold leading-[24px] text-app-text-muted")}>—</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className={cn("mb-2 text-[14px] leading-[14px]", SM.body)}>
            {ko ? "자연 트래픽" : "Organic traffic"}
          </span>
          <div className="mb-1 flex h-6 items-center gap-2">
            <span className={cn("text-[20px] font-bold leading-[24px]", SM.title)}>
              {report?.metrics.organicTrafficEstimate
                ? compact(report.metrics.organicTrafficEstimate.value)
                : "—"}
            </span>
            {trafficDelta !== null && <DeltaBadge value={trafficDelta} />}
          </div>
          {report?.metrics.organicTrafficEstimate && trend.length > 1 && (
            <Sparkline points={trend.flatMap((point) =>
              point.organicTrafficEstimate === null ? [] : [point.organicTrafficEstimate]
            )} />
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
