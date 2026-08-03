"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import type { RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import { SM, SelectLink, Sparkline, DeltaBadge, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

/** 시계열 마지막 두 점의 % 변화. 이전 값이 없거나 0이면 null. */
function seriesDelta(points: number[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  const curr = points[points.length - 1];
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  KR: "South Korea",
};

function NoSourceBadge({ ko }: { ko: boolean }) {
  return (
    <span className="rounded-full bg-[#ececee] px-1.5 py-px text-[10px] font-medium text-[#5f6368]">
      {ko ? "소스 없음" : "No source"}
    </span>
  );
}

/**
 * SEO 지표 위젯 (spec: docs/research/components/widget-seo-metrics.spec.md).
 * 이미지 배열: Authority Score 행 + [자연 트래픽 | 유료 키워드 | 백링크 | 추천 도메인].
 * 자연 트래픽은 TalorData SERP 파생, 백링크·추천 도메인은 사이트 진단 크롤 링크
 * 그래프 실측이다. 유료 키워드는 소스가 없어 "소스 없음"으로 정직하게 표기한다.
 */
export function WidgetSeoMetrics({
  report,
  dateLabel,
  countryCode,
  monthly,
}: {
  report: DomainAnalyticsReport | null;
  dateLabel: string | null;
  countryCode: string;
  monthly: RefDomainMonth[];
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const trend = report?.trend ?? [];

  const trafficPoints = trend.map((point) => point.organicTrafficEstimate);
  const backlinkPoints = monthly.map((month) => month.backlinks);
  const refDomainPoints = monthly.map((month) => month.referringDomains);
  const hasLinkData = backlinkPoints.some((value) => value > 0);

  const metrics: Array<{
    key: string;
    label: string;
    value: string;
    delta: number | null;
    sparkline: number[] | null;
    sparkColor?: string;
    noSource?: boolean;
  }> = [
    {
      key: "organicTraffic",
      label: ko ? "자연 트래픽" : "Organic traffic",
      value: report ? compact(report.metrics.organicTrafficEstimate.value) : "—",
      delta: seriesDelta(trafficPoints),
      sparkline: trafficPoints.length > 1 ? trafficPoints : null,
    },
    {
      key: "paidKeywords",
      label: ko ? "유료 키워드" : "Paid keywords",
      value: "—",
      delta: null,
      sparkline: null,
      noSource: true,
    },
    {
      key: "backlinks",
      label: ko ? "백링크" : "Backlinks",
      value: report && hasLinkData ? compact(report.metrics.backlinks) : "—",
      delta: hasLinkData ? seriesDelta(backlinkPoints) : null,
      sparkline: hasLinkData ? backlinkPoints : null,
      sparkColor: "#8649e1",
    },
    {
      key: "refDomains",
      label: ko ? "추천 도메인" : "Referring domains",
      value: report && hasLinkData ? compact(report.metrics.referringDomains) : "—",
      delta: hasLinkData ? seriesDelta(refDomainPoints) : null,
      sparkline: hasLinkData ? refDomainPoints : null,
      sparkColor: "#8649e1",
    },
  ];

  return (
    <WidgetCard ariaLabel="SEO" className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h3 className={cn("text-[16px] font-bold leading-[20px]", SM.title)}>SEO</h3>
        <div className="flex items-center gap-3">
          <SelectLink>{ko ? "루트 도메인" : "Root domain"}</SelectLink>
          <SelectLink>{COUNTRY_LABELS[countryCode] ?? countryCode}</SelectLink>
          <SelectLink>{ko ? "데스크톱" : "Desktop"}</SelectLink>
          <span className={cn("text-[14px] leading-[20px]", SM.caption)}>
            {dateLabel ?? (ko ? "분석 전" : "Not analyzed")}
          </span>
        </div>
      </div>

      {/* Authority Score 행 */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-[14px] leading-[20px]", SM.body)}>Authority Score</span>
          <span className={cn("text-[20px] font-bold leading-[24px]", SM.title)}>
            {report ? report.metrics.authorityScore.value : "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-[14px] leading-[20px]", SM.body)}>
            {ko ? "SEMForge 순위" : "SEMForge Rank"}
          </span>
          <span className={cn("text-[20px] font-bold leading-[24px] text-app-text-muted")}>—</span>
          <NoSourceBadge ko={ko} />
        </div>
      </div>

      <hr className="-ml-5 mb-5 mt-3 border-0 bg-app-border" style={{ height: 1 }} />

      {/* 지표 그리드: 자연 트래픽 | 유료 키워드 | 백링크 | 추천 도메인 */}
      <div
        className="grid gap-x-3 gap-y-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
      >
        {metrics.map((metric) => (
          <div key={metric.key} className="flex flex-col">
            <span className={cn("mb-2 flex items-center gap-1 text-[14px] leading-[14px]", SM.body)}>
              {metric.label}
              {metric.noSource && <NoSourceBadge ko={ko} />}
            </span>
            <div className="mb-1 flex h-6 items-center gap-2">
              <span
                className={cn(
                  "text-[20px] font-bold leading-[24px]",
                  metric.value === "—" ? "text-app-text-muted" : SM.title
                )}
              >
                {metric.value}
              </span>
              {metric.delta !== null && <DeltaBadge value={metric.delta} />}
            </div>
            {metric.sparkline && <Sparkline points={metric.sparkline} color={metric.sparkColor} />}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
