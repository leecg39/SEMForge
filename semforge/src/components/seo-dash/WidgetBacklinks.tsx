"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
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
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

export interface RefDomainMonth {
  label: string;
  referringDomains: number;
  /** 해당 월 말 기준 누적 백링크(엣지) 수 */
  backlinks: number;
}

const AUTHORITY_BUCKETS = ["0-20", "21-40", "41-60", "61-80", "81-100"] as const;

function bucketOf(bucket: string): string {
  const [start] = bucket.split("-").map(Number);
  if (start <= 20) return "0-20";
  if (start <= 40) return "21-40";
  if (start <= 60) return "41-60";
  if (start <= 80) return "61-80";
  return "81-100";
}

/**
 * 백링크 위젯 (spec: docs/research/components/widget-organic-backlinks.spec.md B).
 * 추천 도메인 면적 차트(월별 누적) + Authority Score별 분포는 실측.
 */
export function WidgetBacklinks({
  report,
  monthly,
}: {
  report: DomainAnalyticsReport | null;
  monthly: RefDomainMonth[];
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  const buckets = AUTHORITY_BUCKETS.map((label) => {
    const total = (report?.refDomainsByAuthority ?? [])
      .filter((row) => bucketOf(row.bucket) === label)
      .reduce((sum, row) => sum + row.referringDomains, 0);
    return { label, referringDomains: total };
  });
  const totalRefs = buckets.reduce((sum, bucket) => sum + bucket.referringDomains, 0);
  const hasLinkData = totalRefs > 0 || monthly.some((month) => month.referringDomains > 0);

  // 관측 기준 시점: 링크 그래프 freshness (없으면 표시 생략).
  const linksThrough = report?.freshness.linksThrough ?? null;
  const bucketDateLabel = linksThrough
    ? new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { year: "numeric", month: "long" }).format(
        new Date(linksThrough)
      )
    : null;

  return (
    <WidgetCard ariaLabel={ko ? "백링크" : "Backlinks"} className="xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <WidgetTitle>{ko ? "백링크" : "Backlinks"}</WidgetTitle>
        <span className={cn("flex items-center gap-1 text-[14px] leading-[20px]", SM.stub)}>
          {ko ? "범위: 루트 도메인" : "Scope: root domain"} <span aria-hidden="true" className="text-[10px]">⌄</span>
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <p className={cn("text-[14px] leading-[20px]", SM.body)}>{ko ? "추천 도메인" : "Referring domains"}</p>
        <p className={cn("text-[14px] leading-[20px]", SM.caption)}>{ko ? "최근 12개월" : "Last 12 months"}</p>
      </div>
      <div className="mt-1 h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="refArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8649e1" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#8649e1" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6e79" }} width={44} tickFormatter={(v: number) => compact(v)} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
              formatter={(value) => [compact(Number(value)), ko ? "추천 도메인" : "Referring domains"]}
            />
            <Area type="monotone" dataKey="referringDomains" stroke="#8649e1" strokeWidth={2} fill="url(#refArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <p className={cn("text-[14px] leading-[20px]", SM.body)}>
          {ko ? "Authority Score별 추천 도메인" : "Referring domains by Authority Score"}
        </p>
        {bucketDateLabel && (
          <p className={cn("text-[14px] leading-[20px]", SM.caption)} suppressHydrationWarning>
            {bucketDateLabel}
          </p>
        )}
      </div>
      <div className="mt-1 h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e0e1e9" }} tick={{ fontSize: 12, fill: "#6c6e79" }} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6e79" }} width={44} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", fontSize: 12 }} />
            <Bar dataKey="referringDomains" radius={[4, 4, 0, 0]} fill="#008ff8" maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 grid grid-cols-5 gap-1">
        {buckets.map((bucket) => (
          <li key={bucket.label} className="text-center">
            <span className={cn("block text-[14px] font-medium leading-[20px]", SM.body)}>
              {totalRefs ? `${((bucket.referringDomains / totalRefs) * 100).toFixed(2)}%` : "0%"}
            </span>
            <span className={cn("block text-[12px] leading-[16px]", SM.caption)}>
              {bucket.referringDomains.toLocaleString()}
            </span>
            <span className={cn("block text-[12px] leading-[16px]", SM.caption)}>{bucket.label}</span>
          </li>
        ))}
      </ul>

      {!hasLinkData && (
        <p className={cn("mt-3 rounded-[6px] bg-app-bg px-3 py-2 text-[12px] leading-[18px]", SM.caption)}>
          {ko
            ? "사이트 진단 크롤에서 관측된 백링크가 아직 없습니다. 사이트 진단을 실행하면 링크 그래프가 실측 엣지로 채워집니다."
            : "No backlinks observed from site audit crawls yet. Run a site audit to populate the link graph with real edges."}
        </p>
      )}

      <div className="mt-3 text-right">
        <Link href="/analytics/backlinks/overview/" className={cn("text-[14px] font-medium leading-[20px] hover:underline", SM.stub)}>
          {ko ? "전체 보고서 보기 →" : "View full report →"}
        </Link>
      </div>
    </WidgetCard>
  );
}
