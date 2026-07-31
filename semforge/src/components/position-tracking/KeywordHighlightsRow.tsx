"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { HighlightKeyword, KeywordHighlights } from "@/server/position-tracking/highlights";

const COPY = {
  ko: {
    top: "상위 키워드",
    gainers: "효율적인 키워드",
    losers: "비효율적인 키워드",
    keyword: "키워드",
    position: "포지션",
    share: "가시성 기여",
    gained: "가시성 획득",
    lost: "가시성 손실",
    empty: "표시할 데이터가 없습니다.",
    modelBadge: "계산식 clone-traffic-v1",
    loadError: "키워드 하이라이트를 불러오지 못했습니다.",
  },
  en: {
    top: "Top keywords",
    gainers: "Efficient keywords",
    losers: "Inefficient keywords",
    keyword: "Keyword",
    position: "Position",
    share: "Visibility share",
    gained: "Visibility gained",
    lost: "Visibility lost",
    empty: "No data to display.",
    modelBadge: "Model: clone-traffic-v1",
    loadError: "Keyword highlights could not be loaded.",
  },
} as const;

function PositionMove({ row }: { row: HighlightKeyword }) {
  if (row.position === null) {
    return <span className="text-app-text-secondary">—</span>;
  }
  const delta =
    row.previousPosition !== null && row.position !== null
      ? row.previousPosition - row.position
      : null;
  return (
    <span className="whitespace-nowrap">
      <strong className="text-app-text">{row.position}</strong>
      {delta !== null && delta !== 0 && (
        <span
          className={cn(
            "ml-1 text-[11px] font-semibold",
            delta > 0 ? "text-[#0a6b57]" : "text-[#a4002a]"
          )}
        >
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

function HighlightCard({
  title,
  rows,
  metric,
  metricHeader,
  emptyLabel,
  keywordHeader,
  positionHeader,
}: {
  title: string;
  rows: HighlightKeyword[];
  metric: (row: HighlightKeyword) => string;
  metricHeader: string;
  emptyLabel: string;
  keywordHeader: string;
  positionHeader: string;
}) {
  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-6 pb-4 text-center text-[13px] text-app-text-secondary">{emptyLabel}</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-app-border text-[12px] text-app-text-secondary">
              <th className="py-1.5 pr-2 font-medium">{keywordHeader}</th>
              <th className="px-2 py-1.5 text-right font-medium">{positionHeader}</th>
              <th className="py-1.5 pl-2 text-right font-medium">{metricHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row) => (
              <tr key={row.keyword} className="border-b border-app-border last:border-b-0">
                <td className="max-w-[180px] truncate py-2 pr-2 font-medium text-app-blue" title={row.keyword}>
                  {row.keyword}
                </td>
                <td className="px-2 py-2 text-right">
                  <PositionMove row={row} />
                </td>
                <td className="py-2 pl-2 text-right text-app-text">{metric(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** 상위/효율/비효율 키워드 3열. 가시성 값은 CTR 곡선 계산식이므로 배지를 함께 표시한다. */
export function KeywordHighlightsRow({
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
    data: KeywordHighlights | null;
    error: string | null;
  } | null>(null);
  const requestKey = `${campaignId}:${refreshKey}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<KeywordHighlights>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/highlights/`
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

  if (error) {
    return (
      <p role="alert" className="rounded-[8px] border border-app-border bg-white p-4 text-[13px] text-app-red">
        {error}
      </p>
    );
  }

  const signed = (value: number | null) =>
    value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%p`;

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        <HighlightCard
          title={copy.top}
          rows={data?.top ?? []}
          metric={(row) =>
            row.visibilityShare !== null ? `${row.visibilityShare.toFixed(2)}%` : "—"
          }
          metricHeader={copy.share}
          emptyLabel={copy.empty}
          keywordHeader={copy.keyword}
          positionHeader={copy.position}
        />
        <HighlightCard
          title={copy.gainers}
          rows={data?.gainers ?? []}
          metric={(row) => signed(row.visibilityDelta)}
          metricHeader={copy.gained}
          emptyLabel={copy.empty}
          keywordHeader={copy.keyword}
          positionHeader={copy.position}
        />
        <HighlightCard
          title={copy.losers}
          rows={data?.losers ?? []}
          metric={(row) => signed(row.visibilityDelta)}
          metricHeader={copy.lost}
          emptyLabel={copy.empty}
          keywordHeader={copy.keyword}
          positionHeader={copy.position}
        />
      </div>
      <p className="mt-2 text-right">
        <span className="inline-block rounded-full bg-[#fff4e0] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
          {copy.modelBadge}
        </span>
      </p>
    </div>
  );
}
