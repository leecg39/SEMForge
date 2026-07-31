"use client";

import { useCallback } from "react";
import { Card, LivePill } from "@/components/analytics/keyword-overview/primitives";
import { useLocale } from "@/i18n/LocaleProvider";

const FEATURE_LABELS: Record<string, { en: string; ko: string }> = {
  featured_snippet: { en: "Featured snippet", ko: "추천 스니펫" },
  people_also_ask: { en: "People also ask", ko: "관련 질문" },
  ai_overview: { en: "AI Overview", ko: "AI 개요" },
  knowledge_panel: { en: "Knowledge panel", ko: "지식 패널" },
  answer_box: { en: "Answer box", ko: "답변 박스" },
  local_pack: { en: "Local pack", ko: "로컬 팩" },
  related_searches: { en: "Related searches", ko: "관련 검색어" },
  refine_this_search: { en: "Refine this search", ko: "검색 상세화" },
  people_are_saying: { en: "People are saying", ko: "실시간 반응" },
  shopping: { en: "Shopping", ko: "쇼핑" },
  videos: { en: "Videos", ko: "동영상" },
  images: { en: "Images", ko: "이미지" },
  top_stories: { en: "Top stories", ko: "주요 뉴스" },
};

const COPY = {
  en: {
    title: "SERP features on this keyword",
    noFeatures: "No SERP features were detected.",
    liveTag: "Live",
  },
  ko: {
    title: "이 키워드의 SERP 피처",
    noFeatures: "감지된 SERP 피처가 없습니다.",
    liveTag: "실시간",
  },
} as const;

export function SerpFeaturesCard({ features }: { features: string[] }) {
  const { locale } = useLocale();
  const copy = COPY[locale];

  const featureLabel = useCallback(
    (feature: string) => FEATURE_LABELS[feature]?.[locale] ?? feature.replaceAll("_", " "),
    [locale],
  );

  return (
    <Card title={copy.title} action={<LivePill label={copy.liveTag} />} className="mt-4">
      {features.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {features.map((feature) => (
            <span
              key={feature}
              className="rounded-full border border-[#cfe4f7] bg-[#f2f9ff] px-3 py-1 text-[12px] font-medium text-[#0872bf]"
            >
              {featureLabel(feature)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-a2-text-muted">{copy.noFeatures}</p>
      )}
    </Card>
  );
}
