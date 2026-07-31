"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, SourcePill } from "@/components/analytics/keyword-overview/primitives";
import type { TrendState } from "@/components/analytics/keyword-overview/types";
import { useLocale } from "@/i18n/LocaleProvider";

const COPY = {
  en: {
    title: "Interest over time",
    hint: "Google Trends relative interest (0–100) for the last 12 months — not absolute search volume.",
    source: "Google Trends",
    cacheNote: "7-day cache",
    liveNote: "Live collected",
    loading: "Collecting trend data…",
    emptyTitle: "No trend data for this keyword",
    emptyBody:
      "Google Trends has no interest series for this keyword and region. That is an honest empty result, not an error.",
    errorTitle: "Trend collection failed",
    retry: "Retry",
    idleBody: "Trend data loads together with the SERP report.",
  },
  ko: {
    title: "관심도 추이",
    hint: "지난 12개월 Google Trends 상대 관심도(0~100)입니다 — 절대 검색량이 아닙니다.",
    source: "Google Trends",
    cacheNote: "7일 캐시",
    liveNote: "실시간 수집",
    loading: "추세 데이터 수집 중…",
    emptyTitle: "이 키워드의 추세 데이터가 없습니다",
    emptyBody:
      "Google Trends 에 이 키워드·지역 조합의 관심도 시계열이 없습니다. 오류가 아니라 정직한 빈 결과입니다.",
    errorTitle: "추세 수집에 실패했습니다",
    retry: "다시 시도",
    idleBody: "SERP 리포트와 함께 추세 데이터를 불러옵니다.",
  },
} as const;

export function TrendCard({
  state,
  onRetry,
}: {
  state: TrendState;
  onRetry: () => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "short",
      }),
    [locale],
  );

  const chartData = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.points.map((point) => ({
      ...point,
      tick: monthFormatter.format(new Date(point.periodStart)),
    }));
  }, [state, monthFormatter]);

  return (
    <Card
      title={copy.title}
      hint={copy.hint}
      action={
        <span className="flex items-center gap-1.5">
          <SourcePill label={copy.source} />
          {state.status === "ready" && (
            <span className="text-[10px] text-a2-text-faint">
              {state.fromCache ? copy.cacheNote : copy.liveNote}
            </span>
          )}
        </span>
      }
      className="mt-4"
    >
      {state.status === "idle" && (
        <p className="py-8 text-center text-[12px] text-a2-text-muted">{copy.idleBody}</p>
      )}

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="py-4">
          <div className="h-[180px] animate-pulse rounded-[8px] bg-[#eef0f2]" />
          <p className="mt-2 text-center text-[11px] text-a2-text-muted">{copy.loading}</p>
        </div>
      )}

      {state.status === "empty" && (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <p className="text-[13px] font-semibold text-a2-text">{copy.emptyTitle}</p>
          <p className="mt-1 max-w-[420px] text-[12px] leading-[18px] text-a2-text-muted">
            {copy.emptyBody}
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <p className="text-[13px] font-semibold text-[#a80028]">{copy.errorTitle}</p>
          <p className="mt-1 max-w-[440px] text-[12px] leading-[18px] text-a2-text-muted">
            {state.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-[7px] border border-app-border bg-white px-4 py-1.5 text-[12px] font-medium text-a2-text transition hover:bg-app-bg"
          >
            {copy.retry}
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="kwTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e8bd9" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2e8bd9" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef0f2" vertical={false} />
              <XAxis
                dataKey="tick"
                tick={{ fontSize: 10, fill: "#7a8494" }}
                tickLine={false}
                axisLine={{ stroke: "#e3e6ea" }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#7a8494" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "#c8d2de", strokeDasharray: "4 4" }}
                formatter={(value) => [String(value), locale === "ko" ? "관심도" : "Interest"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e3e6ea",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2e8bd9"
                strokeWidth={2}
                fill="url(#kwTrendFill)"
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
