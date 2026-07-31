"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";

const COPY = {
  ko: {
    title: "SERP 구성 요소",
    hint: "추적 키워드의 최신 SERP 에서 관측된 구성 요소입니다 (TalorData 수집분).",
    total: "구성 요소가 있는 키워드",
    ranked: "그중 내 도메인이 순위권에 든 키워드",
    empty: "아직 관측된 SERP 구성 요소가 없습니다. 순위를 수집하면 함께 기록됩니다.",
  },
  en: {
    title: "SERP features",
    hint: "Features observed on the latest SERPs of tracked keywords (collected via TalorData).",
    total: "Keywords with this feature",
    ranked: "…where my domain also ranks",
    empty: "No SERP features observed yet. They are recorded when you collect positions.",
  },
} as const;

/** 수집기(client.ts)가 정규화한 피처 이름의 화면 라벨. */
const FEATURE_LABELS: Record<string, { ko: string; en: string }> = {
  ai_overview: { ko: "AI 개요", en: "AI Overview" },
  local_pack: { ko: "로컬 팩", en: "Local pack" },
  knowledge_panel: { ko: "지식 패널", en: "Knowledge panel" },
  answer_box: { ko: "추천 스니펫", en: "Featured snippet" },
  people_also_ask: { ko: "관련 질문", en: "People also ask" },
  people_are_saying: { ko: "사람들의 의견", en: "People are saying" },
  related_searches: { ko: "연관 검색어", en: "Related searches" },
  refine_this_search: { ko: "검색어 세분화", en: "Refine search" },
  shopping: { ko: "쇼핑", en: "Shopping" },
  videos: { ko: "동영상", en: "Videos" },
  images: { ko: "이미지", en: "Images" },
  top_stories: { ko: "주요 뉴스", en: "Top stories" },
};

export interface SerpFeatureKeyword {
  serpFeatures: string[];
  position: number | null;
}

/**
 * 키워드 목록의 최신 SERP 피처를 집계한 막대 차트.
 * 피처별로 등장 키워드 수와, 그중 자사가 순위권(top100)에 든 수를 겹쳐 보여준다.
 */
export function SerpFeaturesPanel({ keywords }: { keywords: SerpFeatureKeyword[] }) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const data = useMemo(() => {
    const byFeature = new Map<string, { total: number; ranked: number }>();
    for (const keyword of keywords) {
      for (const feature of keyword.serpFeatures) {
        const aggregate = byFeature.get(feature) ?? { total: 0, ranked: 0 };
        aggregate.total += 1;
        if (keyword.position !== null) aggregate.ranked += 1;
        byFeature.set(feature, aggregate);
      }
    }
    return [...byFeature.entries()]
      .map(([feature, counts]) => ({
        feature,
        label: FEATURE_LABELS[feature]?.[locale] ?? feature,
        total: counts.total,
        ranked: counts.ranked,
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [keywords, locale]);

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-4">
      <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">{copy.title}</h3>
      <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">{copy.hint}</p>

      {data.length === 0 ? (
        <p className="mt-4 max-w-[560px] text-[13px] leading-[20px] text-app-text-secondary">
          {copy.empty}
        </p>
      ) : (
        <div className="mt-3 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fontSize: 10, fill: "#7a7d86" }}
                angle={data.length > 6 ? -28 : 0}
                textAnchor={data.length > 6 ? "end" : "middle"}
                height={data.length > 6 ? 54 : 26}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#7a7d86" }}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e4e5e9", fontSize: 12 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="total"
                name={copy.total}
                fill="#b6c8f2"
                maxBarSize={30}
                isAnimationActive={false}
              />
              <Bar
                dataKey="ranked"
                name={copy.ranked}
                fill="#2e9e7b"
                maxBarSize={30}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
