"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import type { SeoGscDashboardState } from "@/components/seo-dash/use-seo-gsc";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[270px] flex-col items-center justify-center px-4 py-7 text-center">
      <Image
        src="/seo-dashboard/empty-traffic.png"
        alt=""
        width={96}
        height={96}
        className="h-24 w-24 object-contain"
      />
      <p className={cn("mt-2 text-[14px] font-semibold", SM.title)}>{title}</p>
      <p className={cn("mt-1 max-w-[460px] text-[12px] leading-[18px]", SM.caption)}>{body}</p>
      {children}
    </div>
  );
}

export function WidgetTrafficAnalytics({
  report,
  gsc,
}: {
  report: DomainAnalyticsReport | null;
  gsc: SeoGscDashboardState;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [tab, setTab] = useState<"semforge" | "google">("semforge");

  return (
    <WidgetCard big ariaLabel="Traffic Analytics" className="h-full min-h-[430px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <WidgetTitle>Traffic Analytics</WidgetTitle>
          <div className="flex rounded-[6px] border border-app-border bg-app-bg p-0.5" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "semforge"}
              onClick={() => setTab("semforge")}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-[12px] transition-colors",
                tab === "semforge" ? "bg-white font-medium shadow-sm" : SM.caption,
              )}
            >
              {ko ? "SEMForge 데이터" : "SEMForge data"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "google"}
              onClick={() => setTab("google")}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-[12px] transition-colors",
                tab === "google" ? "bg-white font-medium shadow-sm" : SM.caption,
              )}
            >
              {ko ? "Google 데이터" : "Google data"}
            </button>
          </div>
        </div>
        <span className={cn("text-[12px]", SM.caption)}>
          {tab === "google" ? (ko ? "최근 28일" : "Last 28 days") : "TalorData · SERP"}
        </span>
      </div>

      <div role="tabpanel">
        {tab === "google" ? <GoogleTraffic state={gsc} ko={ko} /> : <SemforgeTraffic report={report} ko={ko} />}
      </div>
    </WidgetCard>
  );
}

function SemforgeTraffic({ report, ko }: { report: DomainAnalyticsReport | null; ko: boolean }) {
  if (!report) {
    return (
      <EmptyState
        title={ko ? "검색 유입 데이터가 없습니다" : "No search traffic data"}
        body={
          ko
            ? "TalorData에서 이 도메인이 순위권에 확인되면 실제 SERP 기반 추정치가 표시됩니다."
            : "Live SERP-based estimates appear after TalorData finds this domain in ranking results."
        }
      />
    );
  }

  const chartData = report.trend.map((point) => ({
    period: point.period.slice(5),
    traffic: point.organicTrafficEstimate,
    keywords: point.keywords,
  }));
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className={cn("text-[13px]", SM.caption)}>{ko ? "자연 검색 유입 추정" : "Estimated organic traffic"}</p>
          <strong className="mt-1 block text-[22px] font-semibold text-a2-text">
            {compact(report.metrics.organicTrafficEstimate.value)}
          </strong>
          <span className="text-[11px] text-[#765f1f]">{ko ? "SERP 기반 모델" : "SERP-based model"}</span>
        </div>
        <div>
          <p className={cn("text-[13px]", SM.caption)}>{ko ? "자연 키워드" : "Organic keywords"}</p>
          <strong className="mt-1 block text-[22px] font-semibold text-a2-text">
            {compact(report.metrics.organicKeywords)}
          </strong>
          <span className="text-[11px] text-[#1c6b3c]">TalorData live</span>
        </div>
        <div>
          <p className={cn("text-[13px]", SM.caption)}>Authority Score</p>
          <strong className="mt-1 block text-[22px] font-semibold text-a2-text">
            {report.metrics.authorityScore.value}
          </strong>
          <span className="text-[11px] text-[#765f1f]">{ko ? "링크 기반 모델" : "Link-based model"}</span>
        </div>
      </div>
      {chartData.length > 1 ? (
        <div className="mt-5 h-[255px]" role="img" aria-label={ko ? "최근 자연 검색 유입과 키워드 추세" : "Recent organic traffic and keyword trend"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#edf0f2" vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: "#dfe2e5" }} tick={{ fontSize: 11, fill: "#70747c" }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "#70747c" }} tickFormatter={compact} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #dfe2e5", fontSize: 12 }} />
              <Line type="monotone" dataKey="traffic" stroke="#625ee8" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          title={ko ? "추세를 만들 데이터가 부족합니다" : "Not enough data for a trend"}
          body={ko ? "두 번 이상 수집되면 기간별 변화가 표시됩니다." : "A trend appears after at least two collections."}
        />
      )}
    </>
  );
}

function GoogleTraffic({ state, ko }: { state: SeoGscDashboardState; ko: boolean }) {
  if (state.kind === "checking" || state.kind === "loading") {
    return <EmptyState title={ko ? "Search Console 확인 중" : "Checking Search Console"} body={ko ? "연결된 속성과 최근 28일 데이터를 불러오고 있습니다." : "Loading the matched property and the last 28 days."} />;
  }
  if (state.kind === "disconnected") {
    return (
      <EmptyState title={ko ? "Search Console 연결 필요" : "Connect Search Console"} body={ko ? "검색 클릭·노출·CTR·평균 게재순위를 보려면 Google 계정을 연결하세요." : "Connect Google to see clicks, impressions, CTR, and average position."}>
        {/* OAuth endpoint requires a full navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/gsc/auth/start/" className={cn(SM.darkCta, "mt-4 h-8")}>{ko ? "연결" : "Connect"}</a>
      </EmptyState>
    );
  }
  if (state.kind === "mismatch") {
    return <EmptyState title={ko ? "도메인과 GSC 속성이 다릅니다" : "GSC property mismatch"} body={ko ? `연결 계정의 속성(${state.siteUrl})이 현재 프로젝트 도메인을 포함하지 않습니다. Search Console에서 사이트를 확인하거나 올바른 계정으로 다시 연결하세요.` : `The connected property (${state.siteUrl}) does not cover this project domain.`} />;
  }
  if (state.kind === "error") {
    return <EmptyState title={ko ? "Search Console 조회 실패" : "Search Console query failed"} body={state.reason} />;
  }
  if (state.kind === "empty") {
    return <EmptyState title={ko ? "해당 기간에 검색 결과가 없습니다" : "No search results in this period"} body={ko ? `${state.siteUrl}의 최근 28일 Search Console 데이터가 없습니다.` : `No Search Console data for ${state.siteUrl} in the last 28 days.`} />;
  }

  const chartData = state.daily.map((row) => ({ ...row, date: row.date.slice(5) }));
  const kpis = [
    [ko ? "클릭" : "Clicks", compact(state.totals.clicks)],
    [ko ? "노출" : "Impressions", compact(state.totals.impressions)],
    ["CTR", `${state.totals.ctr.toFixed(2)}%`],
    [ko ? "평균 순위" : "Avg. position", state.totals.position.toFixed(1)],
  ];
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label}>
            <p className={cn("text-[13px]", SM.caption)}>{label}</p>
            <strong className="mt-1 block text-[21px] font-semibold text-a2-text">{value}</strong>
          </div>
        ))}
      </div>
      <p className={cn("mt-4 truncate text-[11px]", SM.caption)} title={state.siteUrl}>
        {state.siteUrl} · {state.range.start} ~ {state.range.end}
      </p>
      <div className="mt-1 h-[245px]" role="img" aria-label={ko ? "최근 28일 Google 검색 클릭 추세" : "Google search click trend for the last 28 days"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#edf0f2" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#dfe2e5" }} minTickGap={24} tick={{ fontSize: 11, fill: "#70747c" }} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "#70747c" }} tickFormatter={compact} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #dfe2e5", fontSize: 12 }} />
            <Line type="monotone" dataKey="clicks" name={ko ? "클릭" : "Clicks"} stroke="#235fe2" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-right">
        <Link href="/analytics/traffic/" className={cn("text-[13px] font-medium hover:underline", SM.link)}>
          {ko ? "전체 보고서 보기" : "View full report"}
        </Link>
      </div>
    </>
  );
}
