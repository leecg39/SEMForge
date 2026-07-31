"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { PageBreakdownRow, PagesBreakdown } from "@/server/position-tracking/highlights";

type PageTab = "top" | "improved" | "declined";

const COPY = {
  ko: {
    title: "페이지",
    tabs: { top: "상위", improved: "상승", declined: "하락" } as Record<PageTab, string>,
    url: "URL",
    keywords: "키워드",
    avgPosition: "평균 포지션",
    estTraffic: "예상 트래픽",
    empty: "아직 순위에 오른 페이지가 없습니다. 순위를 수집하면 자사 도메인의 랜딩 페이지가 집계됩니다.",
    tabEmpty: "해당 조건의 페이지가 없습니다.",
    showAll: (count: number) => `랜딩 페이지 ${count}개 모두 보기`,
    collapse: "접기",
    modelBadge: "예상 트래픽: 계산식 clone-traffic-v1",
    loadError: "페이지 집계를 불러오지 못했습니다.",
  },
  en: {
    title: "Pages",
    tabs: { top: "Top", improved: "Improved", declined: "Declined" } as Record<PageTab, string>,
    url: "URL",
    keywords: "Keywords",
    avgPosition: "Avg. position",
    estTraffic: "Est. traffic",
    empty: "No ranking pages yet. Collect positions to aggregate your landing pages.",
    tabEmpty: "No pages match this tab.",
    showAll: (count: number) => `Show all ${count} landing pages`,
    collapse: "Collapse",
    modelBadge: "Est. traffic: model clone-traffic-v1",
    loadError: "The pages breakdown could not be loaded.",
  },
} as const;

const PREVIEW_COUNT = 5;

function Delta({ value, lowerIsBetter = false }: { value: number | null; lowerIsBetter?: boolean }) {
  if (value === null || value === 0) return null;
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "ml-1 text-[11px] font-semibold",
        improved ? "text-[#0a6b57]" : "text-[#a4002a]"
      )}
    >
      {value > 0 ? "▲" : "▼"}
      {Math.abs(value).toFixed(2)}
    </span>
  );
}

/** 최신 스냅샷의 자사 랜딩 페이지 집계. 상위/상승/하락 탭은 클라이언트 정렬이다. */
export function PagesPanel({
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
    data: PagesBreakdown | null;
    error: string | null;
  } | null>(null);
  const [tab, setTab] = useState<PageTab>("top");
  const [expanded, setExpanded] = useState(false);
  const requestKey = `${campaignId}:${refreshKey}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<PagesBreakdown>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/pages/`
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

  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;

  const rows = useMemo<PageBreakdownRow[]>(() => {
    const pages = data?.pages ?? [];
    if (tab === "top") return pages;
    if (tab === "improved") {
      return pages
        .filter((page) => page.avgPositionDiff !== null && page.avgPositionDiff < 0)
        .sort((a, b) => a.avgPositionDiff! - b.avgPositionDiff!);
    }
    return pages
      .filter((page) => page.avgPositionDiff !== null && page.avgPositionDiff > 0)
      .sort((a, b) => b.avgPositionDiff! - a.avgPositionDiff!);
  }, [data, tab]);

  const visible = expanded ? rows : rows.slice(0, PREVIEW_COUNT);

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
        <span className="rounded-full bg-[#fff4e0] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
          {copy.modelBadge}
        </span>
      </div>

      <div className="mt-3 flex gap-1" role="tablist" aria-label={copy.title}>
        {(Object.keys(copy.tabs) as PageTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setExpanded(false);
            }}
            className={cn(
              "h-[30px] rounded-[6px] px-3 text-[12px] font-medium transition-colors",
              tab === key
                ? "bg-[#eef2f7] text-app-text"
                : "text-app-text-secondary hover:bg-[#f6f7f9]"
            )}
          >
            {copy.tabs[key]}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-app-red">
          {error}
        </p>
      )}

      {!error && data && !data.hasData && (
        <p className="mt-4 max-w-[560px] text-[13px] leading-[20px] text-app-text-secondary">
          {copy.empty}
        </p>
      )}

      {!error && data?.hasData && rows.length === 0 && (
        <p className="mt-4 text-[13px] text-app-text-secondary">{copy.tabEmpty}</p>
      )}

      {!error && rows.length > 0 && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-app-border text-[12px] text-app-text-secondary">
                  <th className="py-2 pr-3 font-medium">{copy.url}</th>
                  <th className="px-3 py-2 text-right font-medium">{copy.keywords}</th>
                  <th className="px-3 py-2 text-right font-medium">{copy.avgPosition}</th>
                  <th className="py-2 pl-3 text-right font-medium">{copy.estTraffic}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((page) => (
                  <tr key={page.url} className="border-b border-app-border last:border-b-0">
                    <td className="max-w-[420px] truncate py-2 pr-3">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-app-blue hover:underline"
                        title={page.url}
                      >
                        {page.url}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right text-app-text">{page.keywords}</td>
                    <td className="px-3 py-2 text-right text-app-text">
                      {page.avgPosition.toFixed(2)}
                      <Delta value={page.avgPositionDiff} lowerIsBetter />
                    </td>
                    <td className="py-2 pl-3 text-right text-app-text">
                      {page.estTraffic.toFixed(2)}
                      <Delta value={page.estTrafficDiff} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="mt-3 h-[30px] rounded-[6px] bg-[#171b18] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#303633]"
            >
              {expanded ? copy.collapse : copy.showAll(rows.length)}
            </button>
          )}
        </>
      )}
    </section>
  );
}
