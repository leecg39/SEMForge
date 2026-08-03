"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";
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

const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  KR: "South Korea",
};

/** 포지션 버킷별 색 (상위일수록 진한 초록 → 하위 주황). */
const BUCKET_COLORS: Record<string, string> = {
  "1-3": "#0ba360",
  "4-10": "#45d6ad",
  "11-20": "#008ff8",
  "21-50": "#f79009",
  "51-100": "#e0447c",
};

/**
 * 자연검색 순위 위젯 (spec: docs/research/components/widget-organic-backlinks.spec.md A).
 * 상단: 월별 상위 10위 내 키워드 수 추이(실측 trend.keywords).
 * 하단: 최신 SERP 포지션 분포(실측 positionDistribution). 추정 막대는 쓰지 않는다.
 */
export function WidgetOrganicRank({
  report,
  countryCode,
}: {
  report: DomainAnalyticsReport | null;
  countryCode: string;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const trend = report?.trend ?? [];
  const distribution = report?.positionDistribution ?? [];

  const areaData = trend.map((point) => ({
    label: new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
      new Date(`${point.period}-01T00:00:00Z`)
    ),
    keywords: point.keywords,
  }));

  const bucketData = distribution.map((bucket) => ({
    label: ko ? `${bucket.bucket}위` : bucket.bucket,
    keywords: bucket.keywords,
    fill: BUCKET_COLORS[bucket.bucket] ?? "#008ff8",
  }));

  return (
    <WidgetCard ariaLabel={ko ? "자연검색 순위" : "Organic positions"} className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <WidgetTitle>{ko ? "자연검색 순위" : "Organic Positions"}</WidgetTitle>
        <div className="flex items-center gap-3">
          <SelectLink>{ko ? "루트 도메인" : "Root domain"}</SelectLink>
          <SelectLink>{COUNTRY_LABELS[countryCode] ?? countryCode}</SelectLink>
          <SelectLink>{ko ? "데스크톱" : "Desktop"}</SelectLink>
        </div>
      </div>

      <p className={cn("mt-3 text-[14px] leading-[20px]", SM.body)}>
        {ko ? "상위 10위 내 키워드 수" : "Keywords in top 10"}
      </p>
      <div className="mt-1 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={areaData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="organicKeywordsArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#008ff8" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#008ff8" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#6c6e79" }}
              width={44}
              allowDecimals={false}
              tickFormatter={(value: number) => compact(value)}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
              formatter={(value) => [compact(Number(value)), ko ? "키워드" : "Keywords"]}
            />
            <Area type="monotone" dataKey="keywords" stroke="#008ff8" strokeWidth={2} fill="url(#organicKeywordsArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className={cn("mt-4 text-[14px] leading-[20px]", SM.body)}>
        {ko ? "키워드 포지션 분포" : "Keyword position distribution"}
      </p>
      <div className="mt-1 h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bucketData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#6c6e79" }}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", fontSize: 12 }}
              formatter={(value) => [Number(value), ko ? "키워드" : "Keywords"]}
            />
            <Bar dataKey="keywords" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {bucketData.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {bucketData.map((entry) => (
          <li key={entry.label} className="flex items-center gap-1.5 text-[13px] leading-[18px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.fill }} />
            <span className={SM.body}>{entry.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 text-right">
        <Link href="/analytics/organic/overview/" className={cn("inline-flex items-center gap-1 text-[14px] font-medium leading-[20px] hover:underline", SM.stub)}>
          {ko ? "전체 보고서 보기" : "View full report"} <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </WidgetCard>
  );
}
