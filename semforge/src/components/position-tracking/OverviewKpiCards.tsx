"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { CampaignOverview } from "@/server/position-tracking/overview";

const COPY = {
  ko: {
    visibility: "가시성",
    estimatedTraffic: "예상 트래픽",
    avgPosition: "평균 포지션",
    trafficModelBadge: "계산식 clone-traffic-v1",
    trafficCoverage: (covered: number, total: number) =>
      `검색량이 있는 ${covered}/${total}개 키워드 기준`,
    keywords: "키워드",
    top: (threshold: number) => `상위 ${threshold}개`,
    newLabel: "신규",
    lostLabel: "누락",
    risingVsFalling: "상승 vs. 하락",
    rising: "상승",
    falling: "하락",
    newRanked: "신규 진입",
    dropped: "순위권 이탈",
    noData: "수집 이력이 없습니다.",
    loadError: "현황 지표를 불러오지 못했습니다.",
  },
  en: {
    visibility: "Visibility",
    estimatedTraffic: "Estimated traffic",
    avgPosition: "Average position",
    trafficModelBadge: "Model: clone-traffic-v1",
    trafficCoverage: (covered: number, total: number) =>
      `Based on ${covered}/${total} keywords with volume`,
    keywords: "Keywords",
    top: (threshold: number) => `Top ${threshold}`,
    newLabel: "New",
    lostLabel: "Lost",
    risingVsFalling: "Rising vs. falling",
    rising: "Rising",
    falling: "Falling",
    newRanked: "New entries",
    dropped: "Dropped out",
    noData: "No collection history yet.",
    loadError: "Overview metrics could not be loaded.",
  },
} as const;

function DeltaBadge({
  value,
  suffix = "",
  /** true 면 값이 작아질수록 개선 (평균 포지션) */
  lowerIsBetter = false,
  digits = 2,
}: {
  value: number | null;
  suffix?: string;
  lowerIsBetter?: boolean;
  digits?: number;
}) {
  if (value === null || value === 0) {
    return <span className="text-[12px] text-app-text-secondary">—</span>;
  }
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "text-[12px] font-semibold",
        improved ? "text-[#0a6b57]" : "text-[#a4002a]"
      )}
    >
      {value > 0 ? "▲" : "▼"} {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

function Sparkline({ series }: { series: { label: string; value: number }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mt-2 h-[52px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e4e5e9", fontSize: 11 }}
            labelFormatter={(label) => String(label)}
            formatter={(value) => [`${value}%`, ""]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#6c6cf5"
            strokeWidth={2}
            fill="#e7e7fd"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 현황 상단 KPI 3카드(가시성·예상 트래픽·평균 포지션)와 키워드 버킷 카드.
 * 예상 트래픽은 clone-traffic-v1 계산식이므로 provenance 배지를 항상 노출한다.
 */
export function OverviewKpiCards({
  campaignId,
  refreshKey,
}: {
  campaignId: string;
  refreshKey: number;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{
    key: string;
    data: CampaignOverview | null;
    error: string | null;
  } | null>(null);
  const requestKey = `${campaignId}:${refreshKey}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<CampaignOverview>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/overview/`
        );
        if (!cancelled) setResult({ key: requestKey, data: response.data, error: null });
      } catch (caught) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data: null,
            error: caught instanceof ClientApiError ? caught.message : COPY.ko.loadError,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, requestKey]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "2-digit",
        day: "2-digit",
      }),
    [locale]
  );

  const data = !loading && result ? result.data : null;
  const error = !loading && result ? result.error : null;

  const visibilitySeries = useMemo(
    () =>
      (data?.visibility.series ?? []).map((point) => ({
        label: dateFormatter.format(new Date(point.capturedAt)),
        value: point.visibility,
      })),
    [data, dateFormatter]
  );

  if (error) {
    return (
      <p role="alert" className="rounded-[8px] border border-app-border bg-white p-4 text-[13px] text-app-red">
        {error}
      </p>
    );
  }

  const card = "rounded-[10px] border border-app-border bg-white p-4";
  const movement = data
    ? [
        { label: copy.rising, value: data.rising, color: "#0a6b57" },
        { label: copy.falling, value: data.falling, color: "#a4002a" },
        { label: copy.newRanked, value: data.newRanked, color: "#1a56db" },
        { label: copy.dropped, value: data.dropped, color: "#6b7280" },
      ]
    : [];
  const movementTotal = movement.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <section className={card} aria-busy={loading}>
        <h3 className="text-[13px] font-medium text-app-text-secondary">{copy.visibility}</h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-[32px] text-app-text">
            {data?.visibility.current !== null && data ? `${data.visibility.current}%` : "—"}
          </span>
          <DeltaBadge value={data?.visibility.diff ?? null} suffix="%p" digits={0} />
        </div>
        <Sparkline series={visibilitySeries} />
      </section>

      <section className={card} aria-busy={loading}>
        <h3 className="text-[13px] font-medium text-app-text-secondary">
          {copy.estimatedTraffic}
        </h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-[32px] text-app-text">
            {data?.estimatedTraffic.current ?? "—"}
          </span>
          <DeltaBadge value={data?.estimatedTraffic.diff ?? null} />
        </div>
        <span className="mt-2 inline-block rounded-full bg-[#fff4e0] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
          {copy.trafficModelBadge}
        </span>
        {data && data.estimatedTraffic.totalKeywords > 0 && (
          <p className="mt-1.5 text-[11px] leading-[16px] text-app-text-secondary">
            {copy.trafficCoverage(
              data.estimatedTraffic.coveredKeywords,
              data.estimatedTraffic.totalKeywords
            )}
          </p>
        )}
      </section>

      <section className={card} aria-busy={loading}>
        <h3 className="text-[13px] font-medium text-app-text-secondary">{copy.avgPosition}</h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-[32px] text-app-text">
            {data?.avgPosition.current ?? "—"}
          </span>
          <DeltaBadge value={data?.avgPosition.diff ?? null} lowerIsBetter />
        </div>
        {data && data.keywordCount === 0 && (
          <p className="mt-2 text-[12px] text-app-text-secondary">{copy.noData}</p>
        )}
      </section>

      <section className={cn(card, "lg:col-span-2 xl:col-span-1")} aria-busy={loading}>
        <h3 className="text-[13px] font-medium text-app-text-secondary">{copy.keywords}</h3>
        <ul className="mt-2 space-y-1.5">
          {(data?.topBuckets ?? []).map((bucket) => (
            <li key={bucket.key} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-app-text">{copy.top(bucket.threshold)}</span>
              <span className="flex items-center gap-2">
                <strong className="text-app-text">{bucket.count}</strong>
                <span className="text-[11px] text-[#0a6b57]">
                  {copy.newLabel} {bucket.entered}
                </span>
                <span className="text-[11px] text-[#a4002a]">
                  {copy.lostLabel} {bucket.left}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {data && movementTotal >= 0 && (
          <div className="mt-3 border-t border-app-border pt-2.5">
            <p className="text-[12px] font-medium text-app-text-secondary">
              {copy.risingVsFalling}
            </p>
            {movementTotal > 0 && (
              <div className="mt-1.5 flex h-[8px] overflow-hidden rounded-full bg-[#f0f2f6]">
                {movement
                  .filter((item) => item.value > 0)
                  .map((item) => (
                    <span
                      key={item.label}
                      style={{
                        width: `${(item.value / movementTotal) * 100}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  ))}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {movement.map((item) => (
                <span key={item.label} className="text-[11px] text-app-text-secondary">
                  <span
                    className="mr-1 inline-block h-[8px] w-[8px] rounded-full align-middle"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label} {item.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
