"use client";

import Image from "next/image";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import type { SeoGscDashboardState } from "@/components/seo-dash/use-seo-gsc";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

function pageLabel(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

export function WidgetTopSearchPages({ gsc }: { gsc: SeoGscDashboardState }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const live = gsc.kind === "live";

  return (
    <WidgetCard big ariaLabel={ko ? "상위 검색 페이지" : "Top search pages"} className="h-full min-h-[360px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WidgetTitle>{ko ? "상위 검색 페이지" : "Top search pages"}</WidgetTitle>
        <span className={cn("text-[12px]", SM.caption)}>
          Google Search Console · {ko ? "최근 28일" : "Last 28 days"}
        </span>
      </div>

      {live && gsc.pages.length > 0 ? (
        <>
          <p className={cn("mt-2 truncate text-[11px]", SM.caption)} title={gsc.siteUrl}>{gsc.siteUrl}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] table-fixed text-left text-[12px]">
              <thead className={SM.caption}>
                <tr className="border-b border-app-border">
                  <th className="w-[48%] pb-2 font-medium">{ko ? "페이지" : "Page"}</th>
                  <th className="w-[13%] pb-2 text-right font-medium">{ko ? "클릭" : "Clicks"}</th>
                  <th className="w-[15%] pb-2 text-right font-medium">{ko ? "노출" : "Impressions"}</th>
                  <th className="w-[12%] pb-2 text-right font-medium">CTR</th>
                  <th className="w-[12%] pb-2 text-right font-medium">{ko ? "순위" : "Position"}</th>
                </tr>
              </thead>
              <tbody>
                {gsc.pages.map((page) => (
                  <tr key={page.page} className="border-b border-[#eceef0] last:border-0">
                    <td className="py-3 pr-3">
                      <a href={page.page} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 font-medium text-app-blue hover:underline">
                        <span className="truncate" title={page.page}>{pageLabel(page.page)}</span>
                        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </td>
                    <td className="py-3 text-right text-a2-text">{page.clicks.toLocaleString()}</td>
                    <td className="py-3 text-right text-a2-text">{page.impressions.toLocaleString()}</td>
                    <td className="py-3 text-right text-a2-text">{page.ctr.toFixed(2)}%</td>
                    <td className="py-3 text-right text-a2-text">{page.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="flex min-h-[285px] flex-col items-center justify-center text-center" aria-live="polite">
          <Image src="/seo-dashboard/empty-period.png" alt="" width={96} height={96} className="h-24 w-24 object-contain" />
          <p className={cn("mt-2 text-[14px] font-semibold", SM.title)}>
            {gsc.kind === "disconnected"
              ? ko ? "Search Console 연결 필요" : "Connect Search Console"
              : gsc.kind === "mismatch"
                ? ko ? "현재 도메인 속성을 찾지 못했습니다" : "No matching domain property"
                : gsc.kind === "error"
                  ? ko ? "페이지 데이터를 불러오지 못했습니다" : "Could not load page data"
                  : gsc.kind === "checking" || gsc.kind === "loading"
                    ? ko ? "페이지 데이터를 확인 중입니다" : "Checking page data"
                    : ko ? "검색 페이지 결과가 없습니다" : "No search page results"}
          </p>
          <p className={cn("mt-1 max-w-[430px] text-[12px] leading-[18px]", SM.caption)}>
            {gsc.kind === "mismatch"
              ? ko ? `연결된 대표 속성(${gsc.siteUrl})이 현재 프로젝트 도메인을 포함하지 않습니다.` : `The connected property (${gsc.siteUrl}) does not cover this project domain.`
              : gsc.kind === "error"
                ? gsc.reason
                : ko ? "연결된 속성의 최근 28일 실측 결과만 표시합니다." : "Only measured results for the connected property are shown."}
          </p>
        </div>
      )}
    </WidgetCard>
  );
}
