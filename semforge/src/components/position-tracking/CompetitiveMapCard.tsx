"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";

interface DiscoveredCompetitor {
  domain: string;
  appearances: number;
  avgPosition: number;
  bestPosition: number;
  tracked: boolean;
}

interface DiscoveredCompetitors {
  keywordsWithSerp: number;
  hasData: boolean;
  competitors: DiscoveredCompetitor[];
}

const COPY = {
  ko: {
    title: "시장 지형 vs. 내 도메인",
    hint: "수집된 SERP 에서 관측된 도메인별 등장 키워드 수(x)와 평균 순위(y)입니다. 원 크기는 등장 빈도입니다.",
    empty: "수집 이력이 쌓이면 SERP 에서 관측된 경쟁 도메인 지형이 표시됩니다.",
    ctaTitle: "SERP에서 발견된 경쟁자를 추적해 보세요",
    ctaBody: "경쟁자 발견 탭에서 자주 마주치는 도메인을 확인하고 추적 목록에 추가할 수 있습니다.",
    cta: "경쟁자 발견 열기",
    mine: "내 도메인",
    appearances: "등장 키워드",
    avgPosition: "평균 순위",
  },
  en: {
    title: "Market landscape vs. my domain",
    hint: "Domains observed on collected SERPs — appearances (x) vs. average position (y). Bubble size = frequency.",
    empty: "Collect positions to reveal the competitive landscape observed on your SERPs.",
    ctaTitle: "Track the competitors found on your SERPs",
    ctaBody: "Open competitor discovery to review recurring domains and add them to tracking.",
    cta: "Open competitor discovery",
    mine: "My domain",
    appearances: "Keywords",
    avgPosition: "Avg. position",
  },
} as const;

interface BubblePoint {
  domain: string;
  appearances: number;
  avgPosition: number;
  isOwn: boolean;
}

/**
 * 시장 트래픽 vs. 도메인 추세(원본의 버블 차트) — 관측된 SERP 등장 빈도와
 * 평균 순위만 사용한 실측 산점도. 추정 트래픽 축은 쓰지 않는다.
 */
export function CompetitiveMapCard({
  campaignId,
  refreshKey,
  ownDomain,
  ownAvgPosition,
  ownRankedCount,
  onOpenDiscovery,
}: {
  campaignId: string;
  refreshKey: number;
  ownDomain: string;
  /** 자사 평균 순위 (추적 키워드의 실측 순위 평균). 순위가 없으면 null */
  ownAvgPosition: number | null;
  ownRankedCount: number;
  onOpenDiscovery: () => void;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [result, setResult] = useState<{ key: string; data: DiscoveredCompetitors | null } | null>(
    null
  );
  const requestKey = `${campaignId}:${refreshKey}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<DiscoveredCompetitors>(
          `/api/position-tracking/${encodeURIComponent(campaignId)}/discovered-competitors/`
        );
        if (!cancelled) setResult({ key: requestKey, data: response.data });
      } catch {
        if (!cancelled) setResult({ key: requestKey, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, requestKey]);

  const data = result?.key === requestKey ? result.data : null;

  const points = useMemo<BubblePoint[]>(() => {
    const competitors = (data?.competitors ?? []).slice(0, 12).map((row) => ({
      domain: row.domain,
      appearances: row.appearances,
      avgPosition: row.avgPosition,
      isOwn: false,
    }));
    if (ownAvgPosition !== null && ownRankedCount > 0) {
      competitors.push({
        domain: ownDomain,
        appearances: ownRankedCount,
        avgPosition: ownAvgPosition,
        isOwn: true,
      });
    }
    return competitors;
  }, [data, ownDomain, ownAvgPosition, ownRankedCount]);

  const competitorPoints = points.filter((point) => !point.isOwn);
  const ownPoints = points.filter((point) => point.isOwn);

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
      <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">{copy.hint}</p>

      {points.length === 0 ? (
        <p className="mt-4 max-w-[560px] text-[13px] leading-[20px] text-app-text-secondary">
          {copy.empty}
        </p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -14 }}>
                <CartesianGrid stroke="#eef0f3" />
                <XAxis
                  type="number"
                  dataKey="appearances"
                  name={copy.appearances}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#7a7d86" }}
                />
                <YAxis
                  type="number"
                  dataKey="avgPosition"
                  name={copy.avgPosition}
                  reversed
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#7a7d86" }}
                />
                <ZAxis type="number" dataKey="appearances" range={[160, 900]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e4e5e9", fontSize: 12 }}
                  formatter={(value, name) => [value, String(name)]}
                  labelFormatter={() => ""}
                  content={({ payload }) => {
                    const point = payload?.[0]?.payload as BubblePoint | undefined;
                    if (!point) return null;
                    return (
                      <div className="rounded-[8px] border border-app-border bg-white px-3 py-2 text-[12px] shadow-sm">
                        <p className="font-semibold text-app-text">{point.domain}</p>
                        <p className="mt-0.5 text-app-text-secondary">
                          {copy.appearances}: {point.appearances} · {copy.avgPosition}:{" "}
                          {point.avgPosition}
                        </p>
                      </div>
                    );
                  }}
                />
                <Scatter data={competitorPoints} fill="#8f7ae0" fillOpacity={0.7} isAnimationActive={false} />
                <Scatter data={ownPoints} fill="#31c48d" fillOpacity={0.9} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="mt-1 text-right text-[11px] text-app-text-secondary">
              <span className="mr-2">
                <span className="mr-1 inline-block h-[8px] w-[8px] rounded-full bg-[#31c48d] align-middle" />
                {copy.mine} ({ownDomain})
              </span>
            </p>
          </div>
          <div className="flex flex-col justify-center rounded-[8px] bg-[#f9fafb] p-4">
            <p className="text-[14px] font-semibold text-app-text">{copy.ctaTitle}</p>
            <p className="mt-1.5 text-[12px] leading-[19px] text-app-text-secondary">
              {copy.ctaBody}
            </p>
            <button
              type="button"
              onClick={onOpenDiscovery}
              className="mt-3 h-[32px] w-fit rounded-[6px] bg-[#171b18] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#303633]"
            >
              {copy.cta}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
