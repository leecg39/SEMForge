"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import { SM, SelectLink, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

/**
 * 자연검색 순위 위젯 (spec: docs/research/components/widget-organic-backlinks.spec.md A).
 * 면적 차트는 실측 trend, 포지션 변동은 최신 분포 기반으로 단순화한다.
 */
export function WidgetOrganicRank({ report }: { report: DomainAnalyticsReport | null }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const trend = report?.trend ?? [];
  const distribution = report?.positionDistribution ?? [];

  const areaData = trend.map((point) => ({
    label: new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
      new Date(`${point.period}-01T00:00:00Z`)
    ),
    traffic: point.organicTrafficEstimate,
  }));

  const top = distribution.find((bucket) => bucket.bucket === "1-3")?.keywords ?? 0;
  const rest = distribution
    .filter((bucket) => bucket.bucket !== "1-3")
    .reduce((sum, bucket) => sum + bucket.keywords, 0);
  const changeData = [
    { label: ko ? "1-3위" : "Top 3", value: top, fill: "#0ba360" },
    { label: ko ? "4위 이하" : "4+", value: rest, fill: "#e0447c" },
  ];

  return (
    <WidgetCard ariaLabel={ko ? "자연검색 순위" : "Organic positions"} className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <WidgetTitle>{ko ? "자연검색 순위" : "Organic Positions"}</WidgetTitle>
        <div className="flex items-center gap-3">
          <span className={cn("flex items-center gap-1 text-[14px] leading-[20px]", SM.stub)}>
            {ko ? "지난 달" : "Last month"} <span aria-hidden="true" className="text-[10px]">⌄</span>
          </span>
          <SelectLink>{ko ? "루트 도메인" : "Root domain"}</SelectLink>
          <SelectLink>United States</SelectLink>
          <SelectLink>{ko ? "데스크톱" : "Desktop"}</SelectLink>
        </div>
      </div>

      <p className={cn("mt-3 text-[14px] leading-[20px]", SM.body)}>{ko ? "자연 트래픽" : "Organic traffic"}</p>
      <div className="mt-1 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={areaData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="organicArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#008ff8" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#008ff8" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6e79" }} width={44} tickFormatter={(v: number) => compact(v)} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
              formatter={(value) => [compact(Number(value)), ko ? "자연 트래픽" : "Organic traffic"]}
            />
            <Area type="monotone" dataKey="traffic" stroke="#008ff8" strokeWidth={2} fill="url(#organicArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className={cn("mt-4 text-[14px] leading-[20px]", SM.body)}>
        {ko ? "키워드 포지션 변동" : "Keyword position changes"}
      </p>
      <div className="mt-1 h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={changeData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6e79" }} width={44} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", fontSize: 12 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
              {changeData.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex gap-4">
        <li className="flex items-center gap-1.5 text-[14px] leading-[20px]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#0ba360]" />
          <span className={SM.body}>{ko ? "상승" : "Up"}</span>
        </li>
        <li className="flex items-center gap-1.5 text-[14px] leading-[20px]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e0447c]" />
          <span className={SM.body}>{ko ? "하락" : "Down"}</span>
        </li>
      </ul>

      <div className="mt-3 text-right">
        <Link href="/analytics/organic/overview/" className={cn("text-[14px] font-medium leading-[20px] hover:underline", SM.stub)}>
          {ko ? "전체 보고서 보기 →" : "View full report →"}
        </Link>
      </div>
    </WidgetCard>
  );
}
