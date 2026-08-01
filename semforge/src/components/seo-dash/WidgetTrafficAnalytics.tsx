"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

/** GSC searchanalytics date 행 집계 상태 */
type GscTabState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; reason: string }
  | {
      kind: "live";
      siteUrl: string | null;
      totals: { clicks: number; impressions: number; ctr: number; position: number };
      daily: { label: string; clicks: number; impressions: number }[];
      range: { start: string; end: string };
    };

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchGscSearchTraffic(ko: boolean): Promise<GscTabState> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 182);
  const range = { start: isoDate(start), end: isoDate(end) };

  // 연결된 대표 속성 확인 (라벨 정직성: 어느 속성의 데이터인지 함께 표기한다).
  let siteUrl: string | null = null;
  try {
    const statusResponse = await fetch("/api/gsc/status/", { cache: "no-store" });
    if (statusResponse.ok) {
      const statusBody = (await statusResponse.json()) as {
        status?: string;
        data?: { connected?: boolean; siteUrl?: string };
        reason?: string;
      };
      if (statusBody.status !== "live" || !statusBody.data?.connected) {
        return {
          kind: "unavailable",
          reason:
            statusBody.reason ??
            (ko ? "Google Search Console 이 연결되지 않았습니다." : "Google Search Console is not connected."),
        };
      }
      siteUrl = statusBody.data.siteUrl ?? null;
    }
  } catch {
    return { kind: "error", reason: ko ? "연결 상태를 확인하지 못했습니다." : "Could not check connection." };
  }

  let response: Response;
  try {
    const params = new URLSearchParams({
      startDate: range.start,
      endDate: range.end,
      dimensions: "date",
      rowLimit: "400",
    });
    response = await fetch(`/api/gsc/query/?${params.toString()}`, { cache: "no-store" });
  } catch {
    return { kind: "error", reason: ko ? "Search Console 조회에 실패했습니다." : "Search Console query failed." };
  }
  const body = (await response.json()) as {
    status?: string;
    data?: { rows?: GscRow[] };
    reason?: string;
  };
  if (body.status === "unavailable") {
    return { kind: "unavailable", reason: body.reason ?? "" };
  }
  if (body.status !== "live" || !body.data) {
    return {
      kind: "error",
      reason: body.reason ?? (ko ? "Search Console 조회에 실패했습니다." : "Search Console query failed."),
    };
  }

  const rows = [...(body.data.rows ?? [])].sort((a, b) =>
    (a.keys[0] ?? "").localeCompare(b.keys[0] ?? "")
  );
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }
  return {
    kind: "live",
    siteUrl,
    totals: {
      clicks,
      impressions,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      position: impressions > 0 ? weightedPosition / impressions : 0,
    },
    daily: rows.map((row) => ({
      label: row.keys[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
    })),
    range,
  };
}

function NoSourceBadge({ ko }: { ko: boolean }) {
  return (
    <span className="rounded-full bg-[#ececee] px-1.5 py-px text-[10px] font-medium text-[#5f6368]">
      {ko ? "소스 없음" : "No source"}
    </span>
  );
}

/**
 * Traffic Analytics 위젯 (spec: docs/research/components/widget-traffic-analytics.spec.md).
 * SEMForge 탭: 패널 트래픽(클릭스트림) 라이브 소스가 없어 "소스 없음"을 정직하게 표기한다.
 * Google 탭: Search Console 연결 시 /api/gsc/query 실측(클릭·노출·CTR·평균 순위)을 표시한다.
 * 가짜 수치/하드코딩 델타는 사용하지 않는다.
 */
export function WidgetTrafficAnalytics({ report }: { report: DomainAnalyticsReport | null }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [tab, setTab] = useState<"semforge" | "google">("semforge");
  const [gsc, setGsc] = useState<GscTabState>({ kind: "idle" });

  // Google 탭 최초 진입(클릭) 시 1회 조회. 연결/조회 실패는 상태로 정직하게 표시한다.
  const openGoogleTab = () => {
    setTab("google");
    if (gsc.kind !== "idle") return;
    setGsc({ kind: "loading" });
    void fetchGscSearchTraffic(ko).then(setGsc);
  };

  const hasPanelSource = (report?.channels.length ?? 0) > 0 || (report?.metrics.visitsEstimate.value ?? 0) > 0;

  const panelStats: { label: string; value: string; noSource: boolean }[] = [
    {
      label: ko ? "방문수" : "Visits",
      value: hasPanelSource && report ? compact(report.metrics.visitsEstimate.value) : "—",
      noSource: !hasPanelSource,
    },
    {
      label: ko ? "유니크 방문자 수" : "Unique visitors",
      value: hasPanelSource && report ? compact(report.metrics.uniqueVisitorsEstimate.value) : "—",
      noSource: !hasPanelSource,
    },
    {
      label: ko ? "방문당 페이지수" : "Pages / visit",
      value: hasPanelSource && report ? report.metrics.pagesPerVisit.toFixed(2) : "—",
      noSource: !hasPanelSource,
    },
    {
      label: ko ? "평균 체류 시간" : "Avg. visit duration",
      value: "—",
      noSource: true,
    },
    {
      label: ko ? "이탈률" : "Bounce rate",
      value: hasPanelSource && report ? `${report.metrics.bounceRate.toFixed(2)}%` : "—",
      noSource: !hasPanelSource,
    },
  ];

  return (
    <WidgetCard big ariaLabel="Traffic Analytics" className="md:col-span-2 xl:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <WidgetTitle>Traffic Analytics</WidgetTitle>
          <div className="flex rounded-[6px] bg-app-bg p-[2px]">
            {(
              [
                ["semforge", ko ? "SEMForge 데이터" : "SEMForge data"],
                ["google", ko ? "Google 데이터" : "Google data"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => (key === "google" ? openGoogleTab() : setTab(key))}
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
            {ko ? "최근 6개월" : "Last 6 months"}
          </span>
        </div>
      </div>

      {tab === "google" ? (
        <GoogleTab state={gsc} ko={ko} />
      ) : (
        <>
          {/* 지표 행: 패널 소스가 없으면 0 대신 소스 없음을 표기한다 */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {panelStats.map((stat) => (
              <div key={stat.label}>
                <p className={cn("flex items-center gap-1 text-[14px] leading-[20px]", SM.body)}>
                  {stat.label}
                  {stat.noSource && <NoSourceBadge ko={ko} />}
                </p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-[20px] font-bold leading-[24px]",
                      stat.value === "—" ? "text-app-text-muted" : SM.title
                    )}
                  >
                    {stat.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex min-h-[200px] flex-col items-center justify-center rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-8 text-center">
            <p className={cn("text-[14px] font-semibold", SM.title)}>
              {ko ? "패널 트래픽 소스가 없습니다" : "No panel traffic source"}
            </p>
            <p className={cn("mt-1 max-w-[420px] text-[12px] leading-[18px]", SM.caption)}>
              {ko
                ? "전체 방문 추정(패널 클릭스트림)은 무료 데이터 소스가 없어 제공하지 않습니다. 자사 사이트의 실측 검색 유입은 Google 데이터 탭(Search Console)에서 확인할 수 있습니다."
                : "Total traffic estimates (panel clickstream) are unavailable — no free data source. Real search traffic for your own site is available in the Google data tab (Search Console)."}
            </p>
            <button
              type="button"
              onClick={openGoogleTab}
              className={cn("mt-3 text-[13px] font-medium hover:underline", SM.link)}
            >
              {ko ? "Google 데이터 보기 →" : "View Google data →"}
            </button>
          </div>
        </>
      )}
    </WidgetCard>
  );
}

function GoogleTab({ state, ko }: { state: GscTabState; ko: boolean }) {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className="mt-6 flex min-h-[240px] items-center justify-center">
        <p className={cn("text-[13px]", SM.caption)}>
          {ko ? "Search Console 데이터를 불러오는 중…" : "Loading Search Console data…"}
        </p>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="mt-6 flex min-h-[240px] flex-col items-center justify-center rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-10 text-center">
        <p className={cn("text-[14px] font-semibold", SM.title)}>
          {ko ? "Google 서비스가 연결되지 않았습니다" : "Google services are not connected"}
        </p>
        <p className={cn("mt-1 max-w-[400px] text-[12px] leading-[18px]", SM.caption)}>{state.reason}</p>
        {/* OAuth 시작 엔드포인트(302)라 전체 페이지 이동이 필요하다. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/gsc/auth/start/" className={cn(SM.darkCta, "mt-4 h-[32px]")}>
          {ko ? "Search Console 연결" : "Connect Search Console"}
        </a>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mt-6 flex min-h-[240px] flex-col items-center justify-center text-center" role="alert">
        <p className={cn("text-[14px] font-semibold", SM.title)}>
          {ko ? "Search Console 조회에 실패했습니다" : "Search Console query failed"}
        </p>
        <p className={cn("mt-1 max-w-[400px] text-[12px] leading-[18px]", SM.caption)}>{state.reason}</p>
      </div>
    );
  }

  const kpis = [
    { label: ko ? "클릭수" : "Clicks", value: compact(state.totals.clicks) },
    { label: ko ? "노출수" : "Impressions", value: compact(state.totals.impressions) },
    { label: "CTR", value: `${state.totals.ctr.toFixed(2)}%` },
    { label: ko ? "평균 게재순위" : "Avg. position", value: state.totals.position.toFixed(1) },
  ];

  const chartData = state.daily.map((row) => ({
    ...row,
    label: row.label.slice(5), // MM-DD
  }));

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label}>
            <p className={cn("text-[14px] leading-[20px]", SM.body)}>{kpi.label}</p>
            <span className={cn("mt-0.5 block text-[20px] font-bold leading-[24px]", SM.title)}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>

      <p className={cn("mt-5 text-[14px] leading-[20px]", SM.caption)} suppressHydrationWarning>
        {state.siteUrl
          ? ko
            ? `속성: ${state.siteUrl} · ${state.range.start} ~ ${state.range.end}`
            : `Property: ${state.siteUrl} · ${state.range.start} – ${state.range.end}`
          : `${state.range.start} ~ ${state.range.end}`}
      </p>
      <div className="mt-1 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "#e0e1e9" }}
              tick={{ fontSize: 11, fill: "#6c6e79" }}
              tickMargin={8}
              minTickGap={28}
            />
            <YAxis
              yAxisId="clicks"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#6c6e79" }}
              width={40}
              tickFormatter={(value: number) => compact(value)}
            />
            <YAxis
              yAxisId="impressions"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#8649e1" }}
              width={44}
              tickFormatter={(value: number) => compact(value)}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
              formatter={(value, name) => [
                compact(Number(value)),
                name === "clicks" ? (ko ? "클릭수" : "Clicks") : ko ? "노출수" : "Impressions",
              ]}
            />
            <Bar yAxisId="clicks" dataKey="clicks" fill="#008ff8" radius={[2, 2, 0, 0]} maxBarSize={8} />
            <Line
              yAxisId="impressions"
              type="monotone"
              dataKey="impressions"
              stroke="#8649e1"
              strokeWidth={1.6}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex gap-4">
        <li className="flex items-center gap-1.5 text-[13px] leading-[18px]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#008ff8]" />
          <span className={SM.body}>{ko ? "클릭수" : "Clicks"}</span>
        </li>
        <li className="flex items-center gap-1.5 text-[13px] leading-[18px]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#8649e1]" />
          <span className={SM.body}>{ko ? "노출수" : "Impressions"}</span>
        </li>
      </ul>
      <div className="mt-2 text-right">
        <Link
          href="/analytics/traffic/"
          className={cn("text-[14px] font-medium leading-[20px] hover:underline", SM.stub)}
        >
          {ko ? "전체 보고서 보기 →" : "View full report →"}
        </Link>
      </div>
    </>
  );
}
