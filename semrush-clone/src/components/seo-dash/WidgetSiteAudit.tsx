"use client";

import Link from "next/link";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface SiteAuditWidgetSummary {
  campaignId: string;
  siteHealth: number | null;
  lastRunAt: string | null;
  crawledPages: number;
  errors: number;
  warnings: number;
  notices: number;
}

const GAUGE_COLORS = ["#625ee8", "#d5d7df"];

function InfoHint({ label }: { label: string }) {
  return (
    <span title={label} aria-label={label} className="inline-flex text-[#9a9da6]">
      <InfoCircledIcon className="h-[13px] w-[13px]" aria-hidden="true" />
    </span>
  );
}

function formatUpdatedAt(value: string | null, locale: "ko" | "en") {
  if (!value) return locale === "ko" ? "아직 진단하지 않음" : "Not audited yet";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function HealthGauge({ value, ko }: { value: number | null; ko: boolean }) {
  const score = value === null ? 0 : Math.max(0, Math.min(100, value));
  const data = [
    { name: ko ? "사이트 상태" : "Site Health", value: score },
    { name: ko ? "남은 점수" : "Remaining", value: Math.max(0, 100 - score) },
  ];

  return (
    <div
      className="relative h-[110px] w-full max-w-[190px]"
      role="img"
      aria-label={`${ko ? "사이트 상태" : "Site Health"}: ${value === null ? "-" : `${score}%`}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="92%"
            innerRadius={46}
            outerRadius={66}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={GAUGE_COLORS[index]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-[2px] text-center">
        <strong className="block text-[24px] font-bold leading-[25px] text-[#5753c9]">
          {value === null ? "–" : `${score}%`}
        </strong>
        <span className={cn("block text-[11px] leading-[15px]", SM.caption)}>
          {ko ? "최근 진단 결과" : "Latest audit"}
        </span>
      </div>
    </div>
  );
}

function AuditDistribution({ summary, ko }: { summary: SiteAuditWidgetSummary; ko: boolean }) {
  const issueTotal = summary.errors + summary.warnings + summary.notices;
  const clear = Math.max(0, summary.crawledPages - issueTotal);
  const total = Math.max(1, clear + issueTotal);
  const segments = [
    { key: "clear", label: ko ? "발견된 문제 없음" : "No detected issues", value: clear, color: "#45d6ad" },
    { key: "warning", label: ko ? "경고" : "Warnings", value: summary.warnings, color: "#f7b500" },
    { key: "notice", label: ko ? "알림" : "Notices", value: summary.notices, color: "#aeb9f6" },
    { key: "error", label: ko ? "오류" : "Errors", value: summary.errors, color: "#e01b4b" },
  ].filter((segment) => segment.value > 0);

  if (segments.length === 0) {
    return <div className="h-[28px] rounded-[2px] bg-[#e3e5ea]" aria-label={ko ? "크롤 데이터 없음" : "No crawl data"} />;
  }

  return (
    <div
      className="flex h-[28px] overflow-hidden rounded-[2px] bg-[#e3e5ea]"
      aria-label={ko ? "진단 상태 분포" : "Audit status distribution"}
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          title={`${segment.label}: ${segment.value}`}
          className="h-full min-w-[3px]"
          style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
}

/** 설정된 도메인의 최신 사이트 진단 결과를 요약하는 대시보드 위젯. */
export function WidgetSiteAudit({ summary }: { summary: SiteAuditWidgetSummary }) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  return (
    <WidgetCard ariaLabel={ko ? "사이트 진단" : "Site Audit"} className="flex min-h-[380px] flex-col">
      <div className="flex items-center gap-1.5 pt-2">
        <WidgetTitle>{ko ? "사이트 진단" : "Site Audit"}</WidgetTitle>
        <InfoHint label={ko ? "최근 사이트 진단 결과 요약" : "Latest site audit summary"} />
      </div>
      <p className={cn("mt-2 text-[13px] leading-[18px]", SM.caption)} suppressHydrationWarning>
        {ko ? "마지막 업데이트" : "Last update"}: {formatUpdatedAt(summary.lastRunAt, locale)}
      </p>

      <div className="-mx-5 mt-3 border-t border-app-border" />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_88px] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] leading-[20px] text-app-text">
            <span>Site Health</span>
            <InfoHint label={ko ? "사이트의 기술적 상태 점수" : "Technical health score"} />
          </div>
          <HealthGauge value={summary.siteHealth} ko={ko} />
        </div>

        <dl className="space-y-5 pt-0.5">
          <div>
            <dt className="flex items-center gap-1.5 text-[14px] leading-[20px] text-app-text">
              {ko ? "오류" : "Errors"}
              <InfoHint label={ko ? "우선 해결이 필요한 문제" : "Issues requiring attention"} />
            </dt>
            <dd className="mt-0.5 text-[22px] font-semibold leading-[26px] text-[#d3133a]">
              {summary.errors.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[14px] leading-[20px] text-app-text">
              {ko ? "경고" : "Warnings"}
              <InfoHint label={ko ? "검토가 필요한 개선 항목" : "Items to review"} />
            </dt>
            <dd className="mt-0.5 text-[22px] font-semibold leading-[26px] text-[#e65b00]">
              {summary.warnings.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-[14px] leading-[20px] text-app-text">
          <span>{ko ? "크롤링된 페이지" : "Crawled pages"}</span>
          <InfoHint label={ko ? "최근 진단에서 확인한 페이지 수" : "Pages checked in the latest audit"} />
        </div>
        <p className="mt-0.5 text-[22px] font-semibold leading-[28px] text-[#5753c9]">
          {summary.crawledPages.toLocaleString()}
        </p>
        <div className="mt-3">
          <AuditDistribution summary={summary} ko={ko} />
        </div>
      </div>

      <div className="mt-auto pt-6">
        <Link
          href={`/siteaudit/?campaign=${encodeURIComponent(summary.campaignId)}`}
          className="inline-flex h-[30px] items-center justify-center rounded-[6px] border border-[#cfd1d6] bg-white px-3 text-[13px] font-medium text-app-text transition-colors hover:bg-[#f6f7f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235fe2]"
        >
          {ko ? "전체 보기" : "View all"}
        </Link>
      </div>
    </WidgetCard>
  );
}
