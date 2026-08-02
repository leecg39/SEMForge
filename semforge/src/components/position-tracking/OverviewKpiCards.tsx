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
    noTrafficVolume: "검색량 데이터가 없어 계산하지 않았습니다.",
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
    actualResults: "실제 수집 결과",
    actualResultsDescription: "최근 실행에서 공급자가 반환한 키워드별 실측값입니다.",
    collectedAt: "수집 시각",
    processedSummary: (succeeded: number, total: number, failed: number) =>
      `${total}개 중 ${succeeded}개 수집 성공${failed > 0 ? ` · ${failed}개 실패` : ""}`,
    keywordHeader: "키워드",
    rankHeader: "실측 순위",
    urlHeader: "매칭 URL",
    featureHeader: "검색 결과 피처",
    sourceHeader: "수집 소스",
    timeHeader: "관측 시각",
    outsideTop100: "상위 100위 밖",
    noCitation: "인용 없음",
    collectionFailed: "수집 실패",
    noMatchedUrl: "매칭 URL 없음",
    noFeature: "감지 없음",
    rankedCoverage: (ranked: number, total: number) => `순위권 ${ranked}/${total}개`,
    noActualResults: "완료된 실제 수집 결과가 없습니다.",
    mention: "브랜드 언급",
    localPack: (position: number) => `로컬팩 ${position}위`,
    citations: (count: number) => `인용 ${count}개`,
  },
  en: {
    visibility: "Visibility",
    estimatedTraffic: "Estimated traffic",
    avgPosition: "Average position",
    trafficModelBadge: "Model: clone-traffic-v1",
    trafficCoverage: (covered: number, total: number) =>
      `Based on ${covered}/${total} keywords with volume`,
    noTrafficVolume: "Not calculated because keyword volume is unavailable.",
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
    actualResults: "Actual collection results",
    actualResultsDescription: "Per-keyword measurements returned by the provider in the latest run.",
    collectedAt: "Collected",
    processedSummary: (succeeded: number, total: number, failed: number) =>
      `${succeeded} of ${total} collected${failed > 0 ? ` · ${failed} failed` : ""}`,
    keywordHeader: "Keyword",
    rankHeader: "Measured rank",
    urlHeader: "Matched URL",
    featureHeader: "SERP features",
    sourceHeader: "Source",
    timeHeader: "Observed",
    outsideTop100: "Outside top 100",
    noCitation: "Not cited",
    collectionFailed: "Collection failed",
    noMatchedUrl: "No matched URL",
    noFeature: "None detected",
    rankedCoverage: (ranked: number, total: number) => `Ranked ${ranked}/${total}`,
    noActualResults: "No completed collection results yet.",
    mention: "Brand mention",
    localPack: (position: number) => `Local pack #${position}`,
    citations: (count: number) => `${count} citations`,
  },
} as const;

const FEATURE_LABELS: Record<string, string> = {
  ai_overview: "AI Overview",
  local_pack: "Local Pack",
  knowledge_panel: "Knowledge Panel",
  answer_box: "Answer Box",
  people_also_ask: "People Also Ask",
  related_searches: "Related searches",
  shopping: "Shopping",
  videos: "Videos",
  images: "Images",
  top_stories: "Top stories",
  web_search: "Web search",
  google_search_grounding: "Google grounding",
};

function sourceLabel(source: string | null): string {
  if (!source) return "—";
  if (source === "talordata") return "TalorData";
  if (source === "openai") return "OpenAI";
  if (source === "gemini") return "Gemini";
  return source;
}

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
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
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
  const latestCollection = data?.latestCollection ?? null;

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
            {data.estimatedTraffic.coveredKeywords > 0
              ? copy.trafficCoverage(
                  data.estimatedTraffic.coveredKeywords,
                  data.estimatedTraffic.totalKeywords
                )
              : copy.noTrafficVolume}
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
        {data && data.keywordCount > 0 && (
          <p className="mt-2 text-[11px] text-app-text-secondary">
            {copy.rankedCoverage(data.avgPosition.rankedCount, data.keywordCount)}
          </p>
        )}
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

      <section
        className={cn(card, "lg:col-span-2 xl:col-span-4")}
        aria-busy={loading}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-app-text">{copy.actualResults}</h3>
            <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">
              {copy.actualResultsDescription}
            </p>
          </div>
          {latestCollection && (
            <div className="text-right text-[11px] leading-[17px] text-app-text-secondary">
              <p>
                {copy.processedSummary(
                  latestCollection.succeeded,
                  latestCollection.total,
                  latestCollection.failed
                )}
              </p>
              {latestCollection.capturedAt && (
                <p>
                  {copy.collectedAt} {dateTimeFormatter.format(new Date(latestCollection.capturedAt))}
                </p>
              )}
            </div>
          )}
        </div>

        {latestCollection && latestCollection.results.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-y border-app-border bg-[#f8f9fb] text-[11px] font-medium text-app-text-secondary">
                  <th className="px-3 py-2">{copy.keywordHeader}</th>
                  <th className="px-3 py-2">{copy.rankHeader}</th>
                  <th className="px-3 py-2">{copy.urlHeader}</th>
                  <th className="px-3 py-2">{copy.featureHeader}</th>
                  <th className="px-3 py-2">{copy.sourceHeader}</th>
                  <th className="px-3 py-2">{copy.timeHeader}</th>
                </tr>
              </thead>
              <tbody>
                {latestCollection.results.map((row) => {
                  const badges = [
                    ...row.features.map((feature) => FEATURE_LABELS[feature] ?? feature),
                    ...(row.mentioned ? [copy.mention] : []),
                    ...(row.localPackPosition !== null
                      ? [copy.localPack(row.localPackPosition)]
                      : []),
                    ...(row.citationCount > 0 ? [copy.citations(row.citationCount)] : []),
                  ];
                  const rank = row.status === "failed"
                    ? copy.collectionFailed
                    : row.position !== null
                      ? `${row.position}${locale === "ko" ? "위" : ""}`
                      : row.measurementKind === "citation_rank"
                        ? copy.noCitation
                        : copy.outsideTop100;
                  return (
                    <tr key={row.keywordId} className="border-b border-app-border text-[12px] text-app-text">
                      <td className="px-3 py-3 font-medium">{row.keyword}</td>
                      <td className="px-3 py-3">
                        <span className={cn(row.position !== null ? "font-semibold text-[#0a6b57]" : "text-app-text-secondary")}>{rank}</span>
                        {row.error && <p className="mt-1 max-w-[220px] text-[10px] text-app-red">{row.error}</p>}
                      </td>
                      <td className="max-w-[300px] px-3 py-3">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-app-blue hover:underline"
                            title={row.url}
                          >
                            {row.url}
                          </a>
                        ) : (
                          <span className="text-app-text-secondary">{copy.noMatchedUrl}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {badges.length > 0 ? (
                          <div className="flex max-w-[280px] flex-wrap gap-1">
                            {badges.map((badge) => (
                              <span key={badge} className="rounded-full bg-[#f0f1ff] px-2 py-0.5 text-[10px] font-medium text-[#5753c9]">
                                {badge}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-app-text-secondary">{copy.noFeature}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">{sourceLabel(row.source)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-app-text-secondary">
                        {row.capturedAt ? dateTimeFormatter.format(new Date(row.capturedAt)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-[8px] bg-[#f8f9fb] px-3 py-4 text-[12px] text-app-text-secondary">
            {loading ? "…" : copy.noActualResults}
          </p>
        )}
      </section>
    </div>
  );
}
