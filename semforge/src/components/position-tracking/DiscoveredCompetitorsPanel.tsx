"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";

interface DiscoveredCompetitor {
  domain: string;
  appearances: number;
  avgPosition: number;
  bestPosition: number;
  sampleUrl: string | null;
  tracked: boolean;
}

interface DiscoveredCompetitors {
  campaignId: string;
  engine: "google" | "bing";
  totalKeywords: number;
  keywordsWithSerp: number;
  hasData: boolean;
  competitors: DiscoveredCompetitor[];
}

const MAX_COMPETITORS = 5;

const COPY = {
  ko: {
    title: "경쟁자 발견",
    summary: (keywordsWithSerp: number) =>
      `수집된 SERP ${keywordsWithSerp}개 키워드에서 자사 외 도메인을 집계했습니다.`,
    noData:
      "아직 수집된 SERP 데이터가 없습니다. 개요 탭에서 '지금 순위 수집'을 실행하면 발견된 도메인이 여기에 나타납니다.",
    noneFound: "수집된 SERP에서 자사 외 도메인이 발견되지 않았습니다.",
    loadError: "경쟁자 발견 목록을 불러오지 못했습니다.",
    domain: "도메인",
    appearances: "발견 키워드",
    avgPosition: "평균 순위",
    bestPosition: "최고 순위",
    action: "작업",
    tracked: "추적 중",
    add: "경쟁사로 추가",
    adding: "추가 중…",
    addError: "경쟁사를 추가하지 못했습니다.",
    limitReached: `경쟁사는 최대 ${MAX_COMPETITORS}개까지 추적할 수 있습니다.`,
    source: "실제 수집된 SERP 관측값 기준 (추정치 아님)",
  },
  en: {
    title: "Competitor discovery",
    summary: (keywordsWithSerp: number) =>
      `Aggregated non-owned domains across collected SERPs of ${keywordsWithSerp} keywords.`,
    noData:
      "No SERP data collected yet. Run “Collect positions now” on the Overview tab to discover domains here.",
    noneFound: "No non-owned domains were found in the collected SERPs.",
    loadError: "Discovered competitors could not be loaded.",
    domain: "Domain",
    appearances: "Keywords found",
    avgPosition: "Avg. position",
    bestPosition: "Best position",
    action: "Action",
    tracked: "Tracked",
    add: "Track as competitor",
    adding: "Adding…",
    addError: "Competitor could not be added.",
    limitReached: `You can track up to ${MAX_COMPETITORS} competitors.`,
    source: "Based on actually collected SERP observations (not estimates)",
  },
} as const;

export function DiscoveredCompetitorsPanel({
  campaignId,
  refreshKey,
  canCollect,
  trackedCount,
  onAdded,
}: {
  campaignId: string;
  refreshKey: number;
  canCollect: boolean;
  /** 현재 추적 중인 경쟁사 수 (최대 5개 제한 판단용) */
  trackedCount: number;
  /** 경쟁사 추가 후 대시보드 목록을 다시 읽게 하는 콜백 */
  onAdded: () => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{
    key: string;
    data: DiscoveredCompetitors | null;
    error: string | null;
  } | null>(null);
  const requestKey = `${campaignId}:${refreshKey}`;
  const loading = result?.key !== requestKey;
  const [addingDomain, setAddingDomain] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<DiscoveredCompetitors>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/discovered-competitors/`
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

  const addCompetitor = async (domain: string) => {
    if (addingDomain) return;
    setAddingDomain(domain);
    setAddError(null);
    try {
      await api.post(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/competitors/`,
        { domain }
      );
      onAdded();
    } catch (caught) {
      setAddError(caught instanceof ClientApiError ? caught.message : COPY.ko.addError);
    } finally {
      setAddingDomain(null);
    }
  };

  const data = !loading && result ? result.data : null;
  const error = !loading && result ? result.error : null;
  const limitReached = trackedCount >= MAX_COMPETITORS;

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
        {data?.hasData && (
          <span className="text-[12px] text-app-text-secondary">
            {copy.summary(data.keywordsWithSerp)}
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
          {addError && (
            <p className="mt-2 text-[12px] text-app-red" role="alert">
              {addError}
            </p>
          )}
          {data.competitors.length === 0 ? (
            <p className="mt-4 text-[13px] text-app-text-secondary">{copy.noneFound}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-app-border text-[12px] text-app-text-secondary">
                    <th className="py-2 pr-4 font-medium">{copy.domain}</th>
                    <th className="py-2 pr-4 text-right font-medium">{copy.appearances}</th>
                    <th className="py-2 pr-4 text-right font-medium">{copy.avgPosition}</th>
                    <th className="py-2 pr-4 text-right font-medium">{copy.bestPosition}</th>
                    <th className="py-2 text-right font-medium">{copy.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.competitors.map((competitor) => (
                    <tr
                      key={competitor.domain}
                      className="border-b border-app-border text-[13px] last:border-b-0"
                    >
                      <td className="py-2 pr-4 font-medium text-app-text">
                        {competitor.domain}
                        {competitor.sampleUrl && (
                          <span className="ml-2 font-normal text-app-text-secondary">
                            {competitor.sampleUrl}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right text-app-text">
                        {competitor.appearances}
                      </td>
                      <td className="py-2 pr-4 text-right text-app-text">
                        {competitor.avgPosition}
                      </td>
                      <td className="py-2 pr-4 text-right text-app-text">
                        {competitor.bestPosition}
                      </td>
                      <td className="py-2 text-right">
                        {competitor.tracked ? (
                          <span className="rounded-[4px] bg-[#e6f5f0] px-1.5 py-0.5 text-[12px] font-medium text-[#0a6b57]">
                            {copy.tracked}
                          </span>
                        ) : canCollect && !limitReached ? (
                          <button
                            type="button"
                            disabled={addingDomain !== null}
                            onClick={() => void addCompetitor(competitor.domain)}
                            className="text-[12px] font-medium text-app-blue transition-colors hover:text-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {addingDomain === competitor.domain ? copy.adding : copy.add}
                          </button>
                        ) : (
                          <span
                            className="text-[12px] text-app-text-secondary"
                            title={limitReached ? copy.limitReached : undefined}
                          >
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[12px] leading-[18px] text-app-text-secondary">{copy.source}</p>
        </>
      )}
    </section>
  );
}
