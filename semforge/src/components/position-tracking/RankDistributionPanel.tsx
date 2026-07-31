"use client";

import { useEffect, useMemo, useState } from "react";
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
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { RankDistributionHistory } from "@/server/position-tracking/overview";

interface RankBucket {
  key: "top3" | "top10" | "top20" | "top50" | "top100" | "unranked";
  min: number | null;
  max: number | null;
  count: number;
  keywords: string[];
}

type BucketKey = RankBucket["key"];

interface RankDistribution {
  campaignId: string;
  engine: "google" | "bing";
  totalKeywords: number;
  collectedKeywords: number;
  uncollectedKeywords: number;
  capturedAt: string | null;
  hasData: boolean;
  buckets: RankBucket[];
}

const COPY = {
  ko: {
    title: "순위 분포",
    summary: (collected: number, total: number) =>
      `최신 SERP 스냅샷 기준 ${collected}개 키워드 집계 (전체 추적 키워드 ${total}개)`,
    capturedAt: "마지막 수집",
    uncollected: (count: number) => `아직 한 번도 수집되지 않은 키워드 ${count}개는 집계에서 제외했습니다.`,
    noData:
      "아직 수집 이력이 없습니다. 개요 탭에서 '지금 순위 수집'을 실행하면 순위 분포가 집계됩니다.",
    loadError: "순위 분포를 불러오지 못했습니다.",
    keywords: "키워드",
    dailyTitle: "일별 분포 (최근 14일)",
    latestTitle: "최신 스냅샷 분포",
    bucketLabels: {
      top3: "1–3위",
      top10: "4–10위",
      top20: "11–20위",
      top50: "21–50위",
      top100: "51–100위",
      unranked: "순위권 외",
    } as Record<RankBucket["key"], string>,
    source: "출처: serp_snapshots (TalorData 수집분)",
  },
  en: {
    title: "Rank distribution",
    summary: (collected: number, total: number) =>
      `${collected} keywords from the latest SERP snapshots (of ${total} tracked)`,
    capturedAt: "Last collected",
    uncollected: (count: number) =>
      `${count} keywords never collected yet are excluded from the chart.`,
    noData:
      "No collection history yet. Run “Collect positions now” on the Overview tab to build the distribution.",
    loadError: "Rank distribution could not be loaded.",
    keywords: "Keywords",
    dailyTitle: "Daily distribution (last 14 days)",
    latestTitle: "Latest snapshot distribution",
    bucketLabels: {
      top3: "1–3",
      top10: "4–10",
      top20: "11–20",
      top50: "21–50",
      top100: "51–100",
      unranked: "Not ranked",
    } as Record<RankBucket["key"], string>,
    source: "Source: serp_snapshots (collected via TalorData)",
  },
} as const;

const BUCKET_COLORS: Record<RankBucket["key"], string> = {
  top3: "#0a6b57",
  top10: "#2e9e7b",
  top20: "#7cc4ad",
  top50: "#b7dcd0",
  top100: "#d9ebe5",
  unranked: "#c3cad4",
};

const HISTORY_BUCKETS: BucketKey[] = ["top3", "top10", "top20", "top50", "top100", "unranked"];

export function RankDistributionPanel({
  campaignId,
  refreshKey,
  viewDomain,
}: {
  campaignId: string;
  /** 수동 수집 완료 후 증가시켜 재조회를 유도한다. */
  refreshKey: number;
  /** 관점 도메인 (null 이면 자사). 같은 스냅샷을 해당 도메인 기준으로 집계한다. */
  viewDomain?: string | null;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{
    key: string;
    data: RankDistribution | null;
    error: string | null;
  } | null>(null);
  const [history, setHistory] = useState<RankDistributionHistory | null>(null);
  // 순위권 외는 기본으로 숨겨 원본처럼 상위 버킷 위주로 보여준다.
  const [enabledBuckets, setEnabledBuckets] = useState<Set<BucketKey>>(
    () => new Set<BucketKey>(["top3", "top10", "top20", "top50", "top100"])
  );
  const domainQuery = viewDomain ? `&domain=${encodeURIComponent(viewDomain)}` : "";
  const requestKey = `${campaignId}:${refreshKey}:${viewDomain ?? ""}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [distribution, dailyHistory] = await Promise.all([
          api.get<RankDistribution>(
            `/api/position-tracking/${encodeURIComponent(campaignId)}/rank-distribution/?_=1${domainQuery}`
          ),
          api
            .get<RankDistributionHistory>(
              `/api/position-tracking/${encodeURIComponent(campaignId)}/rank-history/?days=14${domainQuery}`
            )
            .catch(() => null),
        ]);
        if (!cancelled) {
          setResult({ key: requestKey, data: distribution.data, error: null });
          setHistory(dailyHistory?.data ?? null);
        }
      } catch (caught) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data: null,
            error:
              caught instanceof ClientApiError ? caught.message : COPY.ko.loadError,
          });
          setHistory(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, requestKey, domainQuery]);

  const toggleBucket = (bucket: BucketKey) => {
    setEnabledBuckets((current) => {
      const next = new Set(current);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  const historyChartData = useMemo(
    () =>
      (history?.history ?? []).map((day) => ({
        date: day.date.slice(5).replace("-", "/"),
        ...day.counts,
      })),
    [history]
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );

  const data = !loading && result ? result.data : null;
  const error = !loading && result ? result.error : null;

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
        {data?.hasData && (
          <span className="text-[12px] text-app-text-secondary">
            {copy.summary(data.collectedKeywords, data.totalKeywords)}
            {data.capturedAt &&
              ` · ${copy.capturedAt} ${dateFormatter.format(new Date(data.capturedAt))}`}
          </span>
        )}
      </div>

      {loading && <p className="mt-4 text-[13px] text-app-text-secondary">…</p>}

      {error && (
        <p className="mt-4 text-[13px] text-app-red" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && !data.hasData && (
        <p className="mt-4 max-w-[560px] text-[13px] leading-[20px] text-app-text-secondary">
          {copy.noData}
        </p>
      )}

      {data?.hasData && (
        <>
          {historyChartData.length > 1 && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[13px] font-medium text-app-text">{copy.dailyTitle}</h4>
                <div className="flex flex-wrap gap-2">
                  {HISTORY_BUCKETS.map((bucket) => (
                    <label
                      key={bucket}
                      className="flex cursor-pointer items-center gap-1 text-[12px] text-app-text-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={enabledBuckets.has(bucket)}
                        onChange={() => toggleBucket(bucket)}
                        className="h-3.5 w-3.5"
                        style={{ accentColor: BUCKET_COLORS[bucket] }}
                      />
                      {copy.bucketLabels[bucket]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-2 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyChartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#7a7d86" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#7a7d86" }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e4e5e9", fontSize: 12 }}
                      formatter={(value, name) => [
                        value,
                        copy.bucketLabels[name as BucketKey] ?? String(name),
                      ]}
                    />
                    {HISTORY_BUCKETS.filter((bucket) => enabledBuckets.has(bucket)).map(
                      (bucket) => (
                        <Bar
                          key={bucket}
                          dataKey={bucket}
                          stackId="rank"
                          fill={BUCKET_COLORS[bucket]}
                          maxBarSize={42}
                          isAnimationActive={false}
                        />
                      )
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <h4 className="mt-5 text-[13px] font-medium text-app-text">{copy.latestTitle}</h4>
          <ul className="mt-2 space-y-2">
            {data.buckets.map((bucket) => {
              const share =
                data.collectedKeywords > 0 ? bucket.count / data.collectedKeywords : 0;
              return (
                <li key={bucket.key}>
                  <div className="flex items-center gap-3">
                    <span className="w-[72px] shrink-0 text-[13px] font-medium text-app-text">
                      {copy.bucketLabels[bucket.key]}
                    </span>
                    <div className="h-[18px] min-w-0 flex-1 rounded-[4px] bg-[#f0f2f6]">
                      {bucket.count > 0 && (
                        <div
                          className="h-full rounded-[4px]"
                          style={{
                            width: `${Math.max(4, Math.round(share * 100))}%`,
                            backgroundColor: BUCKET_COLORS[bucket.key],
                          }}
                        />
                      )}
                    </div>
                    <span className="w-[72px] shrink-0 text-right text-[13px] font-semibold text-app-text">
                      {bucket.count}
                      <span className="ml-1 font-normal text-app-text-secondary">
                        ({Math.round(share * 100)}%)
                      </span>
                    </span>
                  </div>
                  {bucket.keywords.length > 0 && (
                    <details className="ml-[84px] mt-1">
                      <summary
                        className={cn(
                          "inline-flex cursor-pointer text-[12px] text-app-text-secondary",
                          "hover:text-app-blue"
                        )}
                      >
                        {copy.keywords} {bucket.keywords.length}
                      </summary>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {bucket.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-[4px] bg-[#eef2f7] px-1.5 py-0.5 text-[11px] text-[#475166]"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[12px] leading-[18px] text-app-text-secondary">
            {data.uncollectedKeywords > 0 && `${copy.uncollected(data.uncollectedKeywords)} `}
            {copy.source}
          </p>
        </>
      )}
    </section>
  );
}
