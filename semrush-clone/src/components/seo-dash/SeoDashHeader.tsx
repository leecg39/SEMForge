"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { SM } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface SeoDashProject {
  id: string;
  name: string;
  domain: string;
}

/**
 * SEO 대시보드 헤더 (spec: docs/research/components/seo-dash-header.spec.md).
 * breadcrumb + H1 + 프로젝트 pill + 액션 버튼.
 */
export function SeoDashHeader({
  projectName,
  projects,
  currentDomain,
  onSelectProject,
}: {
  projectName: string;
  projects: SeoDashProject[];
  currentDomain: string;
  onSelectProject?: (domain: string) => void;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  return (
    <section
      aria-label={ko ? "SEO 대시보드 헤더" : "SEO dashboard header"}
      className="max-w-[max(100%-14px,1030px)] px-[18px] pb-4 pl-8 pt-4"
    >
      {/* 행1: breadcrumb + 피드백 */}
      <div className="mb-2 flex items-baseline justify-between gap-1">
        <nav aria-label="breadcrumb">
          <ol className={cn("flex items-center text-[14px] leading-[20px]", SM.body)}>
            <li>{ko ? "프로젝트" : "Projects"}</li>
            <li aria-hidden="true" className="mx-2 text-[#9ba0ab]">›</li>
            <li>SEO</li>
          </ol>
        </nav>
        <button type="button" className={cn("flex items-center gap-1 text-[14px] leading-[19.88px]", SM.link)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
          </svg>
          {ko ? "피드백 보내기" : "Send feedback"}
        </button>
      </div>

      {/* 행2: H1 + 프로젝트 pill + 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[20px] font-semibold leading-[24px] text-[oklch(0.1_0.03_137_/_0.899)]">
            {ko ? `SEO 대시보드: ${projectName}` : `SEO Dashboard: ${projectName}`}
          </h1>
          {projects.length > 0 && (
            <div className="relative">
              <select
                aria-label={ko ? `프로젝트: ${projectName}` : `Project: ${projectName}`}
                value={currentDomain}
                onChange={(event) => onSelectProject?.(event.target.value)}
                className={cn(
                  "h-[25px] cursor-pointer appearance-none rounded-[6px] bg-transparent pl-1 pr-4 text-[14px] leading-[20px] outline-none",
                  SM.link
                )}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.domain}>
                    {project.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className={cn("pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px]", SM.link)}>
                ⌄
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 max-md:hidden">
          <button type="button" className={cn(SM.darkCta, "h-[28px]")}>
            {ko ? "SEO 프로젝트 만들기" : "Create SEO project"}
          </button>
          <button
            type="button"
            className="inline-flex h-[28px] items-center justify-center rounded-[6px] border border-app-border bg-white px-3 text-[14px] font-medium text-a2-text transition-colors hover:bg-app-bg"
          >
            {ko ? "공유" : "Share"}
          </button>
          <button
            type="button"
            aria-label={ko ? "설정 열기" : "Open settings"}
            className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-a2-text-muted transition-colors hover:bg-app-bg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
