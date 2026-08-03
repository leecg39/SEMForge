"use client";

import Link from "next/link";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface SiteAuditWidgetSummary {
  campaignId: string | null;
  state: "unconfigured" | "idle" | "queued" | "running" | "completed" | "failed";
  siteHealth: number | null;
  lastRunAt: string | null;
  crawledPages: number;
  errors: number | null;
  warnings: number | null;
  notices: number | null;
  runProgress: { crawledPages: number; pageLimit: number } | null;
  errorMessage: string | null;
}

function formatDate(value: string | null, ko: boolean) {
  if (!value) return ko ? "아직 진단하지 않음" : "Not audited yet";
  return new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function statusCopy(state: SiteAuditWidgetSummary["state"], ko: boolean) {
  const copy = {
    unconfigured: ko ? "설정 필요" : "Set up",
    idle: ko ? "실행 전" : "Not run",
    queued: ko ? "대기 중" : "Queued",
    running: ko ? "수집 중" : "Crawling",
    completed: ko ? "실측" : "Live",
    failed: ko ? "실패" : "Failed",
  } as const;
  return copy[state];
}

function statusClass(state: SiteAuditWidgetSummary["state"], measured: boolean) {
  if (state === "failed") return "bg-[#fdecef] text-[#a4002a]";
  if (state === "queued" || state === "running") return "bg-[#e8f2ff] text-[#1f64c8]";
  if (state === "unconfigured") return "bg-[#fff3d6] text-[#7a5100]";
  if (state === "completed" && measured) return "bg-[#eef7ee] text-[#1c6b3c]";
  return "bg-[#eef0f3] text-a2-text-muted";
}

export function WidgetSiteAudit({
  summary,
  canManage,
  onSetup,
}: {
  summary: SiteAuditWidgetSummary;
  canManage: boolean;
  onSetup: () => void;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const score = summary.siteHealth === null ? 0 : Math.max(0, Math.min(100, summary.siteHealth));
  const measured = summary.siteHealth !== null;
  const active = summary.state === "queued" || summary.state === "running";
  const progress = summary.runProgress;
  const progressPercent = progress && progress.pageLimit > 0
    ? Math.min(100, Math.round((progress.crawledPages / progress.pageLimit) * 100))
    : 0;
  const gauge = [
    { key: "score", value: score || 0.001, color: "#625ee8" },
    { key: "remaining", value: Math.max(0.001, 100 - score), color: "#d8dbe2" },
  ];

  return (
    <WidgetCard ariaLabel={ko ? "사이트 진단" : "Site Audit"} className="flex h-full min-h-[224px] flex-col">
      <div className="flex items-start justify-between gap-3 pt-2">
        <div>
          <div className="flex items-center gap-1.5">
            <WidgetTitle>{ko ? "사이트 진단" : "Site Audit"}</WidgetTitle>
            <InfoCircledIcon className="h-3.5 w-3.5 text-a2-text-muted" aria-hidden="true" />
          </div>
          <p className={cn("mt-1 text-[11px]", SM.caption)}>
            {summary.state === "unconfigured"
              ? (ko ? "이 프로젝트에 연결된 진단이 없습니다." : "No audit is connected to this project.")
              : <>{ko ? "마지막 업데이트" : "Last update"}: {formatDate(summary.lastRunAt, ko)}</>}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusClass(summary.state, measured))}>
          {summary.state === "completed" && !measured
            ? (ko ? "측정 없음" : "No measurement")
            : statusCopy(summary.state, ko)}
        </span>
      </div>

      <div className="mt-2 grid flex-1 grid-cols-[minmax(135px,1.2fr)_minmax(110px,0.8fr)] items-center gap-3">
        <div>
          <div className="relative h-[108px]" role="img" aria-label={`${ko ? "사이트 상태" : "Site health"}: ${summary.siteHealth === null ? "-" : `${score}%`}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={gauge} dataKey="value" startAngle={180} endAngle={0} cx="50%" cy="88%" innerRadius={39} outerRadius={54} stroke="none" isAnimationActive={false}>
                  {gauge.map((item) => <Cell key={item.key} fill={item.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-x-0 bottom-0 text-center">
              <strong className="text-[22px] font-semibold text-[#5753c9]">{summary.siteHealth === null ? "—" : `${score}%`}</strong>
              <p className={cn("text-[10px]", SM.caption)}>{ko ? "사이트 상태" : "Site Health"}</p>
            </div>
          </div>
          <p className={cn("mt-1 text-center text-[11px]", SM.caption)}>{ko ? "크롤링된 페이지" : "Crawled pages"} {measured ? summary.crawledPages.toLocaleString() : "—"}</p>
        </div>
        <dl className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between gap-3"><dt className={SM.caption}>{ko ? "오류" : "Errors"}</dt><dd className="font-semibold text-[#d3133a]">{summary.errors ?? "—"}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className={SM.caption}>{ko ? "경고" : "Warnings"}</dt><dd className="font-semibold text-[#d47b00]">{summary.warnings ?? "—"}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className={SM.caption}>{ko ? "알림" : "Notices"}</dt><dd className="font-semibold text-[#235fe2]">{summary.notices ?? "—"}</dd></div>
        </dl>
      </div>
      {active && (
        <div className="mt-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-[10px] text-a2-text-muted">
            <span>{summary.state === "queued" ? (ko ? "크롤 대기 중" : "Waiting to crawl") : (ko ? "페이지 수집 중" : "Crawling pages")}</span>
            <span>{progress ? `${progress.crawledPages}/${progress.pageLimit}` : "—"}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e4e8ee]">
            <div className="h-full rounded-full bg-[#235fe2] transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
      {summary.state === "failed" && summary.errorMessage && (
        <p className="mt-2 truncate text-[10px] text-[#a4002a]" title={summary.errorMessage}>{summary.errorMessage}</p>
      )}
      {summary.state === "unconfigured" ? (
        canManage ? (
          <button type="button" onClick={onSetup} className={cn(SM.darkCta, "mt-2 h-8 self-start")}>
            {ko ? "진단 설정 및 실행" : "Set up and run audit"}
          </button>
        ) : (
          <p className={cn("mt-2 text-[11px]", SM.caption)}>{ko ? "프로젝트 관리자에게 진단 설정을 요청하세요." : "Ask a project manager to set up the audit."}</p>
        )
      ) : summary.campaignId ? (
        <Link href={`/siteaudit/?campaign=${encodeURIComponent(summary.campaignId)}`} className={cn("mt-2 text-[12px] font-medium hover:underline", SM.link)}>
          {active
            ? (ko ? "진행 상황 보기" : "View progress")
            : measured
              ? (ko ? "전체 보고서 보기" : "View full report")
              : summary.state === "failed"
                ? (ko ? "오류 확인 및 재실행" : "Review error and retry")
                : (ko ? "진단 실행" : "Run audit")}
        </Link>
      ) : null}
    </WidgetCard>
  );
}
