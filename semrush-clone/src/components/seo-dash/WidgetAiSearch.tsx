"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { SM, SelectLink, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface AiEngineBar {
  name: string;
  prev: string;
  current: string;
  /** 현재값 막대 비율 (0~1) */
  ratio: number;
}

const DEMO_ENGINES: AiEngineBar[] = [
  { name: "ChatGPT", prev: "3.7K", current: "8K", ratio: 1 },
  { name: "AI 개요", prev: "4.5K", current: "2.6K", ratio: 0.33 },
  { name: "AI 모드", prev: "2.8K", current: "1.8K", ratio: 0.23 },
  { name: "Gemini", prev: "5.9K", current: "648", ratio: 0.08 },
];

/**
 * AI 검색 위젯 (spec: docs/research/components/widget-ai-search.spec.md).
 * 원천 데이터가 없어 mock 값 + 데모 배지로 표시한다.
 */
export function WidgetAiSearch({
  visibility = 68,
  mentions = "16.9K",
  citedPages = "9.7K",
  engines = DEMO_ENGINES,
}: {
  visibility?: number;
  mentions?: string;
  citedPages?: string;
  engines?: AiEngineBar[];
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  return (
    <WidgetCard ariaLabel={ko ? "AI 검색" : "AI Search"} className="xl:col-span-2">
      <div className="flex items-center justify-between pt-2">
        <h3 className={cn("text-[14px] font-medium leading-[20px]", SM.aiTitle)}>
          {ko ? "AI 검색" : "AI Search"}
        </h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#fff1eb] px-2 py-0.5 text-[10px] font-medium text-[#b63c0b]">
            {ko ? "데모" : "Demo"}
          </span>
          <SelectLink>United States</SelectLink>
        </div>
      </div>

      {/* 3대 지표 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: ko ? "AI 가시성" : "AI Visibility", value: String(visibility) },
          { label: ko ? "언급" : "Mentions", value: mentions },
          { label: ko ? "인용된 페이지" : "Cited pages", value: citedPages },
        ].map((metric) => (
          <div key={metric.label}>
            <p className={cn("text-[14px] leading-[20px]", SM.title)}>{metric.label}</p>
            <p className={cn("mt-0.5 text-[24px] font-bold leading-[28px]", SM.aiValue)}>{metric.value}</p>
          </div>
        ))}
      </div>

      {/* 엔진별 막대 */}
      <ul className="mt-4 space-y-2">
        {engines.map((engine) => (
          <li key={engine.name} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
            <span className={cn("truncate text-[14px] leading-[20px]", SM.body)}>{engine.name}</span>
            <div className="flex h-[10px] items-end gap-[3px]">
              <div
                className="h-full rounded-[2px] bg-[#d9c8f5]"
                style={{ width: `${Math.max(6, engine.ratio * 100 * 0.45)}%` }}
                title={engine.prev}
              />
              <div
                className="h-full rounded-[2px] bg-[#8B46E5]"
                style={{ width: `${Math.max(6, engine.ratio * 100)}%` }}
                title={engine.current}
              />
            </div>
            <span className={cn("shrink-0 text-[14px] leading-[20px] text-[#8B46E5]")}>
              {engine.prev} → {engine.current}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
