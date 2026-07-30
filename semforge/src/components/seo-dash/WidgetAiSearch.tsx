"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, SelectLink, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface AiVisibilityWidgetSummary {
  queryCount: number;
  aioCount: number;
  citedCount: number;
  judgeableAioCount: number;
  unknownCitationCount: number;
  lastCollectedAt: string | null;
}

/**
 * AI 검색 위젯.
 * Google AI 개요(AIO) 실측 수집(ai_visibility_*)만 표시한다.
 * ChatGPT/Gemini 등 타 엔진 지표는 소스가 없어 표시하지 않는다.
 */
export function WidgetAiSearch({
  summary,
  domain,
}: {
  summary?: AiVisibilityWidgetSummary | null;
  domain?: string;
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
          <span className="rounded-full bg-[#eef7ee] px-2 py-0.5 text-[10px] font-medium text-[#1c6b3c]">
            {ko ? "실측" : "Live"}
          </span>
          <SelectLink>Google AIO</SelectLink>
        </div>
      </div>

      {!summary ? (
        <div className="mt-4 rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-6 text-center">
          <p className={cn("text-[14px] font-semibold", SM.title)}>
            {ko ? "추적 중인 쿼리가 없습니다" : "No queries tracked yet"}
          </p>
          <p className={cn("mx-auto mt-1 max-w-[320px] text-[12px] leading-[18px]", SM.caption)}>
            {ko
              ? "AI 가시성 도구에서 쿼리를 추가하고 수집하면 Google AI 개요 출현·인용 실측이 여기에 표시됩니다."
              : "Add queries in AI Visibility and collect to see Google AI Overview presence and citations here."}
          </p>
          <Link
            href={domain ? `/ai-seo/overview/?domain=${encodeURIComponent(domain)}` : "/ai-seo/overview/"}
            className="mt-3 inline-flex h-[30px] items-center rounded-[6px] border border-[#cfd1d6] bg-white px-3 text-[13px] font-medium text-app-text hover:bg-[#f6f7f8]"
          >
            {ko ? "AI 가시성으로 이동" : "Open AI Visibility"}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              {
                label: ko ? "AIO 출현" : "AIO present",
                value: `${summary.aioCount}/${summary.queryCount}`,
                hint: null,
              },
              {
                label: ko ? "인용됨" : "Cited",
                value: String(summary.citedCount),
                hint:
                  summary.judgeableAioCount > 0
                    ? ko
                      ? `판정 가능 ${summary.judgeableAioCount}건 중`
                      : `of ${summary.judgeableAioCount} judgeable`
                    : null,
              },
              {
                label: ko ? "판정 불가" : "Unknown",
                value: String(summary.unknownCitationCount),
                hint: ko ? "제공사 본문 미제공" : "No AIO body from provider",
              },
            ].map((metric) => (
              <div key={metric.label}>
                <p className={cn("text-[14px] leading-[20px]", SM.title)}>{metric.label}</p>
                <p className={cn("mt-0.5 text-[24px] font-bold leading-[28px]", SM.aiValue)}>
                  {metric.value}
                </p>
                {metric.hint && (
                  <p className={cn("text-[11px] leading-[15px]", SM.caption)}>{metric.hint}</p>
                )}
              </div>
            ))}
          </div>

          <p className={cn("mt-4 text-[12px] leading-[18px]", SM.caption)}>
            {ko
              ? "Google AI 개요(AIO) 기준입니다. ChatGPT·Gemini 등 타 플랫폼 지표는 데이터 소스가 없어 제공하지 않습니다."
              : "Based on Google AI Overview. Other platforms (ChatGPT, Gemini…) are not offered — no data source connected."}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className={cn("text-[12px]", SM.caption)} suppressHydrationWarning>
              {summary.lastCollectedAt
                ? `${ko ? "최근 수집" : "Last collected"}: ${new Date(summary.lastCollectedAt).toLocaleDateString(ko ? "ko-KR" : "en-US")}`
                : ko
                  ? "아직 수집 전"
                  : "Not collected yet"}
            </span>
            <Link
              href={domain ? `/ai-seo/overview/?domain=${encodeURIComponent(domain)}` : "/ai-seo/overview/"}
              className={cn("text-[13px] font-medium hover:underline", SM.stub)}
            >
              {ko ? "전체 보고서 보기 →" : "View full report →"}
            </Link>
          </div>
        </>
      )}
    </WidgetCard>
  );
}
