"use client";

import {
  ChatBubbleIcon,
  ChevronDownIcon,
  GearIcon,
  PlusIcon,
  ReloadIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface SeoDashProject {
  id: string;
  name: string;
  domain: string;
}

export function SeoDashHeader({
  projectName,
  projects,
  currentDomain,
  onSelectProject,
  onCreateProject,
  onShare,
  onOpenSettings,
  onFeedback,
  loading = false,
  statusMessage,
}: {
  projectName: string;
  projects: SeoDashProject[];
  currentDomain: string;
  onSelectProject?: (domain: string) => void;
  onCreateProject: () => void;
  onShare: () => void;
  onOpenSettings: () => void;
  onFeedback: () => void;
  loading?: boolean;
  statusMessage?: string | null;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  return (
    <section
      aria-label={ko ? "SEO 대시보드 헤더" : "SEO dashboard header"}
      className="px-4 pb-4 pt-4 sm:px-6 xl:px-8"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <nav aria-label={ko ? "현재 위치" : "Breadcrumb"}>
          <ol className={cn("flex items-center text-[13px] leading-5", SM.body)}>
            <li>{ko ? "프로젝트" : "Projects"}</li>
            <li aria-hidden="true" className="mx-2 text-[#9ba0ab]">/</li>
            <li aria-current="page">SEO</li>
          </ol>
        </nav>
        <button
          type="button"
          onClick={onFeedback}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-[6px] px-2 text-[13px] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue",
            SM.link,
          )}
        >
          <ChatBubbleIcon aria-hidden="true" />
          {ko ? "피드백 보내기" : "Send feedback"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <h1 className="max-w-full truncate text-[20px] font-semibold leading-7 text-a2-text">
            {ko ? `SEO 대시보드${projectName ? `: ${projectName}` : ""}` : `SEO Dashboard${projectName ? `: ${projectName}` : ""}`}
          </h1>
          {projects.length > 0 && (
            <div className="relative">
              <select
                aria-label={ko ? `프로젝트: ${projectName}` : `Project: ${projectName}`}
                value={currentDomain}
                onChange={(event) => onSelectProject?.(event.target.value)}
                disabled={loading}
                className={cn(
                  "h-8 max-w-[220px] cursor-pointer appearance-none rounded-[6px] bg-transparent py-1 pl-2 pr-7 text-[13px] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-app-blue disabled:cursor-wait disabled:opacity-70",
                  SM.link,
                )}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.domain}>
                    {project.name}
                  </option>
                ))}
              </select>
              {loading ? (
                <ReloadIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-app-blue" />
              ) : (
                <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-blue" />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCreateProject}
            className={cn(SM.darkCta, "h-8 gap-1.5 px-3 text-[13px]")}
          >
            <PlusIcon aria-hidden="true" />
            <span className="max-sm:hidden">{ko ? "SEO 프로젝트 만들기" : "Create SEO project"}</span>
            <span className="sm:hidden">{ko ? "프로젝트" : "Project"}</span>
          </button>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-app-border bg-white px-3 text-[13px] font-medium text-a2-text hover:bg-app-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue"
          >
            <Share1Icon aria-hidden="true" />
            {ko ? "공유" : "Share"}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={ko ? "위젯 설정 열기" : "Open widget settings"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-app-border bg-white text-a2-text-muted hover:bg-app-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-blue"
          >
            <GearIcon aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </section>
  );
}
