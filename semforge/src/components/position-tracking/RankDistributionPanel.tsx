"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";

interface RankBucket {
  key: "top3" | "top10" | "top20" | "top50" | "top100" | "unranked";
  min: number | null;
  max: number | null;
  count: number;
  keywords: string[];
}

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

export function RankDistributionPanel({
  campaignId,
  refreshKey,
}: {
  campaignId: string;
  /** 수동 수집 완료 후 증가시켜 재조회를 유도한다. */
  refreshKey: number;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{
    key: string;
    data: RankDistribution | null;
    error: string | null;
  } | null>(null);
  const requestKey = `${campaignId}:${refreshKey}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<RankDistribution>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/rank-distribution/`
        );
        if (!cancelled) setResult({ key: requestKey, data: response.data, error: null });
      } catch (caught) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data: null,
            error:
              caught instanceof ClientApiError ? caught.message : COPY.ko.loadError,
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
          <ul className="mt-4 space-y-2">
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
