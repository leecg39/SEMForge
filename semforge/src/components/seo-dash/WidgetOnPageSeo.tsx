"use client";

import Link from "next/link";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

/** 서버 집계(getOnpageDomainSummary)와 동일한 구조의 위젯 요약. */
export interface OnPageSeoWidgetSummary {
  analyses: number;
  analyzedPages: number;
  totalIdeas: number;
  categories: { category: string; count: number }[];
  topPages: { url: string; ideas: number; keywords: number }[];
  lastAnalyzedAt: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  title: "#8649e1",
  meta: "#e0447c",
  structure: "#f79009",
  content: "#12b5a5",
  ux: "#008ff8",
  status: "#b0b3bd",
};

const CATEGORY_LABELS_KO: Record<string, string> = {
  title: "제목 아이디어",
  meta: "메타 설명 아이디어",
  structure: "구조(H1) 아이디어",
  content: "콘텐츠 아이디어",
  ux: "사용자 경험 아이디어",
  status: "진단 알림",
};

const CATEGORY_LABELS_EN: Record<string, string> = {
  title: "Title ideas",
  meta: "Meta description ideas",
  structure: "Structure (H1) ideas",
  content: "Content ideas",
  ux: "User experience ideas",
  status: "Diagnostics",
};

function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

/**
 * 온페이지 SEO 분석 도구 위젯.
 * onpage_analyses 실측 집계(도넛 + 상위 페이지)를 표시하고,
 * 분석 이력이 없으면 설정 CTA 를 유지한다. 추정치는 표시하지 않는다.
 */
export function WidgetOnPageSeo({
  summary,
  className,
}: {
  summary: OnPageSeoWidgetSummary | null;
  className?: string;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const labels = ko ? CATEGORY_LABELS_KO : CATEGORY_LABELS_EN;

  return (
    <WidgetCard
      ariaLabel={ko ? "온페이지 SEO 분석 도구" : "On Page SEO Checker"}
      className={cn("flex min-h-[224px] flex-col", className)}
    >
      <div className="flex items-center gap-1.5 pt-2">
        <WidgetTitle>{ko ? "온페이지 SEO 분석 도구" : "On Page SEO Checker"}</WidgetTitle>
        <span
          title={ko ? "SERP 상위 페이지 벤치마크 기반 개선 아이디어" : "Improvement ideas benchmarked against top SERP pages"}
          className="inline-flex text-[#9a9da6]"
        >
          <InfoCircledIcon className="h-[13px] w-[13px]" aria-hidden="true" />
        </span>
      </div>

      {!summary ? (
        <>
          <p className={cn("mt-2 text-[14px] leading-[20px]", SM.body)}>
            {ko
              ? "전략, 콘텐츠, 백링크 등에 대한 아이디어를 수집하세요."
              : "Gather ideas on strategy, content, backlinks and more."}
          </p>
          <p className={cn("mt-2 text-[12px] leading-[18px]", SM.caption)}>
            {ko
              ? "온페이지 SEO 분석 도구에서 페이지·키워드를 분석하면 실측 아이디어 집계가 여기에 표시됩니다."
              : "Run page + keyword analyses in the On Page SEO Checker to see real idea totals here."}
          </p>
          <div className="mt-auto pt-4">
            <Link href="/on-page-seo-checker/" className={cn(SM.darkCta, "h-[32px]")}>
              {ko ? "설정" : "Set up"}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={cn("mt-1 text-[13px] leading-[18px]", SM.caption)} suppressHydrationWarning>
            {ko ? "최적화 아이디어" : "Ideas to optimize"}
            {summary.lastAnalyzedAt
              ? ` · ${new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date(summary.lastAnalyzedAt))}`
              : ""}
          </p>

          {/* 도넛 + 총계 */}
          <div className="relative mx-auto mt-3 h-[150px] w-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    summary.totalIdeas > 0
                      ? summary.categories.map((entry) => ({
                          name: labels[entry.category] ?? entry.category,
                          value: entry.count,
                          color: CATEGORY_COLORS[entry.category] ?? "#b0b3bd",
                        }))
                      : [{ name: "none", value: 1, color: "#e3e5ea" }]
                  }
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={summary.totalIdeas > 0 ? 2 : 0}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {(summary.totalIdeas > 0
                    ? summary.categories.map((entry) => CATEGORY_COLORS[entry.category] ?? "#b0b3bd")
                    : ["#e3e5ea"]
                  ).map((color, index) => (
                    <Cell key={index} fill={color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <strong className={cn("text-[26px] font-bold leading-[30px]", SM.title)}>
                {summary.totalIdeas}
              </strong>
              <span className={cn("text-[11px] leading-[15px]", SM.caption)}>
                {ko ? "아이디어" : "ideas"}
              </span>
            </div>
          </div>

          {/* 카테고리 범례 */}
          <ul className="mt-3 space-y-1.5">
            {summary.categories.map((entry) => (
              <li key={entry.category} className="flex items-center justify-between gap-2 text-[13px] leading-[18px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: CATEGORY_COLORS[entry.category] ?? "#b0b3bd" }}
                  />
                  <span className={cn("truncate", SM.body)}>{labels[entry.category] ?? entry.category}</span>
                </span>
                <span className={cn("font-medium", SM.title)}>{entry.count}</span>
              </li>
            ))}
          </ul>

          {/* 상위 최적화 대상 페이지 */}
          {summary.topPages.length > 0 && (
            <div className="mt-4">
              <p className={cn("text-[13px] font-medium leading-[18px]", SM.body)}>
                {ko ? "최적화 우선 페이지" : "Top pages to optimize"}
              </p>
              <ul className="mt-2 space-y-2">
                {summary.topPages.map((page) => (
                  <li key={page.url} className="flex items-center justify-between gap-2">
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn("min-w-0 truncate text-[13px] leading-[18px] hover:underline", SM.link)}
                      title={page.url}
                    >
                      {displayUrl(page.url)}
                    </a>
                    <span className="shrink-0 rounded-full bg-[#eef2f7] px-2 py-0.5 text-[11px] font-medium text-[#475166]">
                      {ko ? `${page.ideas} 아이디어` : `${page.ideas} ideas`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-auto pt-4 text-right">
            <Link
              href="/on-page-seo-checker/"
              className={cn("text-[14px] font-medium leading-[20px] hover:underline", SM.stub)}
            >
              {ko ? "전체 보고서 보기 →" : "View full report →"}
            </Link>
          </div>
        </>
      )}
    </WidgetCard>
  );
}
