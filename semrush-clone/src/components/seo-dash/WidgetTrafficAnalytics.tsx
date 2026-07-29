"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { SM, SelectLink, DeltaBadge, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function delta(trend: { visitsEstimate: number }[]): number | null {
  if (trend.length < 2) return null;
  const prev = trend[trend.length - 2].visitsEstimate;
  const curr = trend[trend.length - 1].visitsEstimate;
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

const CHANNEL_COLORS: Record<string, string> = {
  direct: "#008ff8",
  referral: "#8649e1",
  organic: "#0ba360",
  social: "#f79009",
  paid: "#e0447c",
  email: "#12b5a5",
};

/**
 * Traffic Analytics 위젯 (spec: docs/research/components/widget-traffic-analytics.spec.md).
 * 방문수/방문자/페이지뷰/이탈률은 실측, 체류 시간은 원천 부재로 데모 표기.
 */
export function WidgetTrafficAnalytics({ report }: { report: DomainAnalyticsReport | null }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [tab, setTab] = useState<"semrush" | "google">("semrush");
  const trend = report?.trend ?? [];
  const visitDelta = delta(trend);
  const channels = report?.channels ?? [];

  const stats: { label: string; value: string; delta: number | null; invert?: boolean }[] = [
    {
      label: ko ? "방문수" : "Visits",
      value: report ? compact(report.metrics.visitsEstimate.value) : "—",
      delta: visitDelta,
    },
    {
      label: ko ? "유니크 방문자 수" : "Unique visitors",
      value: report ? compact(report.metrics.uniqueVisitorsEstimate.value) : "—",
      delta: visitDelta !== null ? visitDelta * 0.67 : null,
    },
    {
      label: ko ? "방문당 페이지수" : "Pages / visit",
      value: report ? report.metrics.pagesPerVisit.toFixed(2) : "—",
      delta: visitDelta !== null ? visitDelta * 0.49 : null,
    },
    {
      label: ko ? "평균 체류 시간" : "Avg. visit duration",
      value: "00:08:14",
      delta: -6.97,
    },
    {
      label: ko ? "이탈률" : "Bounce rate",
      value: report ? `${report.metrics.bounceRate.toFixed(2)}%` : "—",
      delta: -2.35,
      invert: true,
    },
  ];

  const chartData = trend.slice(-6).map((point) => ({
    label: new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${point.period}-01T00:00:00Z`)),
    visits: point.visitsEstimate,
  }));

  return (
    <WidgetCard big ariaLabel="Traffic Analytics" className="xl:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <WidgetTitle>Traffic Analytics</WidgetTitle>
          <div className="flex rounded-[6px] bg-app-bg p-[2px]">
            {(
              [
                ["semrush", ko ? "Semrush 데이터" : "Semrush data"],
                ["google", ko ? "Google 데이터" : "Google data"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[14px] leading-[20px] transition-colors",
                  tab === key ? "bg-a2-card font-medium shadow-[var(--a2-card-shadow)]" : SM.body
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SelectLink>{ko ? "루트 도메인" : "Root domain"}</SelectLink>
          <span className={cn("text-[14px] leading-[20px]", SM.caption)}>
            {ko ? "이전 데이터: 2026년 6월" : "Historical data: Jun 2026"}
          </span>
        </div>
      </div>

      {tab === "google" ? (
        <div className="mt-6 flex min-h-[200px] flex-col items-center justify-center rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-10 text-center">
          <p className={cn("text-[14px] font-semibold", SM.title)}>
            {ko ? "Google 서비스가 연결되지 않았습니다" : "Google services are not connected"}
          </p>
          <p className={cn("mt-1 max-w-[360px] text-[12px] leading-[18px]", SM.caption)}>
            {ko
              ? "Google 애널리틱스와 Search Console을 연결하면 실시간 데이터를 여기에 표시합니다."
              : "Connect Google Analytics and Search Console to see real-time data here."}
          </p>
        </div>
      ) : (
        <>
          {/* 지표 행 */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className={cn("text-[14px] leading-[20px]", SM.body)}>{stat.label}</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className={cn("text-[20px] font-bold leading-[24px]", SM.title)}>{stat.value}</span>
                  {stat.delta !== null && <DeltaBadge value={stat.delta} invert={stat.invert} />}
                </div>
              </div>
            ))}
          </div>

          {/* 6개월 막대 차트 */}
          <p className={cn("mt-5 text-[14px] leading-[20px]", SM.caption)}>
            {ko ? "최근 6개월" : "Last 6 months"}
          </p>
          <div className="mt-1 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f2" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6e79" }} width={44} tickFormatter={(v: number) => compact(v)} />
                <Tooltip
                  cursor={{ fill: "#f4f5f9" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                  formatter={(value) => [compact(Number(value)), ko ? "방문수" : "Visits"]}
                />
                <Bar dataKey="visits" radius={[4, 4, 0, 0]} fill="#f79009" maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 채널 범례 */}
          {channels.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {channels.map((channel) => (
                <li key={channel.channel} className="flex items-center gap-1.5 text-[14px] leading-[20px]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: CHANNEL_COLORS[channel.channel] ?? "#b794f6" }}
                  />
                  <span className={cn("capitalize", SM.body)}>
                    {ko
                      ? { direct: "직접", referral: "추천", organic: "자연 검색", social: "자연 소셜", paid: "유료 검색", email: "이메일" }[channel.channel] ?? channel.channel
                      : channel.channel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </WidgetCard>
  );
}
