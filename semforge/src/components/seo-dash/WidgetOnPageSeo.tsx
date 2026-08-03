"use client";

import Link from "next/link";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface OnPageSeoWidgetSummary {
  analyses: number;
  analyzedPages: number;
  totalIdeas: number;
  categories: { category: string; count: number }[];
  topPages: { url: string; ideas: number; keywords: number }[];
  lastAnalyzedAt: string | null;
}

const LABELS: Record<string, { ko: string; en: string }> = {
  title: { ko: "제목", en: "Titles" },
  meta: { ko: "메타 설명", en: "Meta" },
  structure: { ko: "구조", en: "Structure" },
  content: { ko: "콘텐츠", en: "Content" },
  ux: { ko: "사용자 경험", en: "UX" },
  status: { ko: "진단", en: "Diagnostics" },
};

export function WidgetOnPageSeo({ summary, className }: { summary: OnPageSeoWidgetSummary | null; className?: string }) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  return (
    <WidgetCard ariaLabel={ko ? "온페이지 SEO 분석 도구" : "On Page SEO Checker"} className={cn("flex h-full min-h-[224px] flex-col", className)}>
      <div className="flex items-center gap-1.5 pt-2">
        <WidgetTitle>{ko ? "온페이지 SEO 분석 도구" : "On Page SEO Checker"}</WidgetTitle>
        <InfoCircledIcon className="h-3.5 w-3.5 text-a2-text-muted" aria-hidden="true" />
      </div>

      {!summary ? (
        <>
          <p className={cn("mt-3 text-[13px] leading-5", SM.body)}>{ko ? "전략, 콘텐츠, 기술 요소에 대한 실제 분석 아이디어를 수집하세요." : "Collect measured ideas for strategy, content, and technical elements."}</p>
          <p className={cn("mt-2 text-[11px] leading-[17px]", SM.caption)}>{ko ? "페이지와 키워드를 분석하면 저장된 결과가 여기에 표시됩니다." : "Saved results appear here after analyzing a page and keyword."}</p>
          <Link href="/on-page-seo-checker/" className={cn(SM.darkCta, "mt-auto h-8 self-start text-[12px]")}>{ko ? "설정" : "Set up"}</Link>
        </>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div><p className={cn("text-[11px]", SM.caption)}>{ko ? "아이디어" : "Ideas"}</p><strong className="text-[22px] font-semibold text-[#5753c9]">{summary.totalIdeas}</strong></div>
            <div><p className={cn("text-[11px]", SM.caption)}>{ko ? "분석 페이지" : "Pages"}</p><strong className="text-[22px] font-semibold text-a2-text">{summary.analyzedPages}</strong></div>
            <div><p className={cn("text-[11px]", SM.caption)}>{ko ? "분석 횟수" : "Analyses"}</p><strong className="text-[22px] font-semibold text-a2-text">{summary.analyses}</strong></div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {summary.categories.slice(0, 3).map((category) => (
              <li key={category.category} className="flex items-center justify-between gap-2 text-[12px]">
                <span className={cn("truncate", SM.caption)}>{LABELS[category.category]?.[ko ? "ko" : "en"] ?? category.category}</span>
                <strong className="text-a2-text">{category.count}</strong>
              </li>
            ))}
          </ul>
          <Link href="/on-page-seo-checker/" className={cn("mt-auto pt-3 text-[12px] font-medium hover:underline", SM.link)}>{ko ? "전체 보고서 보기" : "View full report"}</Link>
        </>
      )}
    </WidgetCard>
  );
}
