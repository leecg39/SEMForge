"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, SelectLink, WidgetCard } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface AiVisibilityWidgetSummary {
  promptCount: number;
  visibility: number | null;
  mentions: number;
  citations: number;
  citedPages: number;
  measurable: number;
  unknown: number;
  lastCollectedAt: string | null;
  providers: {
    key: string;
    label: string;
    enabled: boolean;
    reason: string | null;
    visibility: number | null;
    mentions: number;
    citations: number;
  }[];
}

/**
 * AI 검색 위젯.
 * 프로젝트 AI 가시성 개요와 같은 최신 셀·unknown 제외 공식을 사용한다.
 */
export function WidgetAiSearch({
  summary,
  domain,
  folderId,
}: {
  summary?: AiVisibilityWidgetSummary | null;
  domain?: string;
  folderId?: string | null;
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
          <SelectLink>{ko ? "전체 플랫폼" : "All platforms"}</SelectLink>
        </div>
      </div>

      {!summary ? (
        <div className="mt-4 rounded-[8px] border border-dashed border-app-border bg-app-bg px-4 py-6 text-center">
          <p className={cn("text-[14px] font-semibold", SM.title)}>
            {ko ? "AI 가시성 프로젝트가 없습니다" : "No AI Visibility project yet"}
          </p>
          <p className={cn("mx-auto mt-1 max-w-[320px] text-[12px] leading-[18px]", SM.caption)}>
            {ko
              ? "프로젝트에서 프롬프트를 추가하고 수집하면 Google AIO·ChatGPT·Gemini의 실제 언급과 인용이 표시됩니다."
              : "Add prompts and collect to see measured mentions and citations across available AI platforms."}
          </p>
          <Link
            href={folderId ? `/ai-seo/overview/?fid=${encodeURIComponent(folderId)}` : domain ? `/ai-seo/overview/?domain=${encodeURIComponent(domain)}` : "/ai-seo/overview/"}
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
                label: ko ? "AI 가시성" : "AI visibility",
                value: summary.visibility === null ? "—" : `${summary.visibility}%`,
                hint: ko ? `측정 가능 ${summary.measurable}셀` : `${summary.measurable} measurable cells`,
              },
              {
                label: ko ? "언급" : "Mentions",
                value: String(summary.mentions),
                hint: ko ? `프롬프트 ${summary.promptCount}개` : `${summary.promptCount} prompts`,
              },
              {
                label: ko ? "인용 / 페이지" : "Citations / pages",
                value: `${summary.citations} / ${summary.citedPages}`,
                hint: summary.unknown > 0 ? (ko ? `측정 불가 ${summary.unknown}셀` : `${summary.unknown} unknown`) : null,
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

          <table className="mt-4 w-full table-fixed text-left text-[13px]">
            <thead>
              <tr className={SM.caption}>
                <th className="w-[44%] pb-1.5 font-normal">{ko ? "플랫폼" : "Platform"}</th>
                <th className="w-[28%] pb-1.5 text-right font-normal">{ko ? "가시성" : "Visibility"}</th>
                <th className="w-[28%] pb-1.5 text-right font-normal">{ko ? "인용" : "Cited"}</th>
              </tr>
            </thead>
            <tbody>
              {summary.providers.map((provider) => (
                <tr key={provider.key} className="border-t border-[#eceef0]">
                  <td className={cn("py-2 font-medium", SM.title)}>{provider.label}</td>
                  {provider.enabled ? <>
                    <td className={cn("py-2 text-right", SM.body)}>{provider.visibility === null ? "—" : `${provider.visibility}%`}</td>
                    <td className={cn("py-2 text-right", SM.body)}>{provider.citations}</td>
                  </> : <td colSpan={2} className="py-2 text-right"><span title={provider.reason ?? undefined} className="rounded-full bg-[#fff2dd] px-1.5 py-px text-[10px] font-medium text-[#8a651d]">{ko ? "키 필요" : "Key required"}</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-between">
            <span className={cn("text-[12px]", SM.caption)} suppressHydrationWarning>
              {summary.lastCollectedAt
                ? `${ko ? "최근 수집" : "Last collected"}: ${new Date(summary.lastCollectedAt).toLocaleDateString(ko ? "ko-KR" : "en-US")}`
                : ko
                  ? "아직 수집 전"
                  : "Not collected yet"}
            </span>
            <Link
              href={folderId ? `/ai-seo/overview/?fid=${encodeURIComponent(folderId)}` : domain ? `/ai-seo/overview/?domain=${encodeURIComponent(domain)}` : "/ai-seo/overview/"}
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
