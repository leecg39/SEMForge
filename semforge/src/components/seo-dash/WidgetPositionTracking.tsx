"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ChevronDownIcon,
  Cross2Icon,
  DesktopIcon,
  InfoCircledIcon,
  MobileIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/i18n/LocaleProvider";
import { PositionTrackingSetupDialog } from "@/components/position-tracking/PositionTrackingSetupDialog";
import { SM, WidgetCard, WidgetTitle } from "@/components/seo-dash/tokens";
import { cn } from "@/lib/utils";

export interface PositionTrackingWidgetKeyword {
  keyword: string;
  position: number | null;
  previousPosition: number | null;
}

/** 수집 실행별 가시성 이력 한 점 (position_tracking_visibility_history 실측). */
export interface PositionTrackingVisibilityPoint {
  capturedAt: string;
  visibility: number;
}

export interface PositionTrackingWidgetSummary {
  campaignId: string;
  location: string;
  device: "desktop" | "mobile" | "tablet";
  searchEngine: "google" | "bing" | "chatgpt" | "gemini";
  visibility: number | null;
  updatedAt: string | null;
  keywords: PositionTrackingWidgetKeyword[];
  history: PositionTrackingVisibilityPoint[];
}

export interface PositionTrackingActiveRunSummary {
  runId: string;
  status: "queued" | "running";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentKeyword: string | null;
}

const RANGE_OPTIONS = [7, 30, 90] as const;

function InfoHint({ label }: { label: string }) {
  return (
    <span title={label} aria-label={label} className="inline-flex text-[#9497a1]">
      <InfoCircledIcon className="h-[13px] w-[13px]" aria-hidden="true" />
    </span>
  );
}

function formatRelativeTime(value: string | null, ko: boolean) {
  if (!value) return ko ? "업데이트 내역 없음" : "No updates yet";
  const elapsedMs = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.max(1, Math.floor(elapsedMs / 3_600_000));
  if (hours < 24) return ko ? `${hours}시간 전` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return ko ? `${days}일 전` : `${days}d ago`;
}

function formatRange(value: string | null, days: number, ko: boolean) {
  const end = value ? new Date(value) : new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  if (ko) {
    const startLabel = new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
    }).format(start);
    const endLabel = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(end);
    return `${startLabel} – ${endLabel}`;
  }

  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(end);
  return `${startLabel} – ${endLabel}`;
}

function RankMetric({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const remaining = Math.max(0, total - value);
  const chartData = value > 0
    ? [
        { key: "ranked", value, color: "#625ee8" },
        { key: "remaining", value: Math.max(remaining, 0.0001), color: "#d2d5d6" },
      ]
    : [{ key: "empty", value: 1, color: "#d2d5d6" }];

  return (
    <div>
      <p className="text-[13px] leading-[18px] text-[#3d4047]">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <PieChart width={26} height={26} aria-hidden="true">
          <Pie
            data={chartData}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            cx={13}
            cy={13}
            innerRadius={8}
            outerRadius={12}
            stroke="none"
            isAnimationActive={false}
          >
            {chartData.map((item) => (
              <Cell key={item.key} fill={item.color} />
            ))}
          </Pie>
        </PieChart>
        <strong className="text-[21px] font-semibold leading-[26px] text-[#5753c9]">
          {value}
        </strong>
      </div>
    </div>
  );
}

function keywordVisibility(position: number | null) {
  if (position === null) return 0;
  return Math.max(0, Math.min(100, 101 - position));
}

function searchEngineLabel(value: PositionTrackingWidgetSummary["searchEngine"]) {
  if (value === "google") return "Google";
  if (value === "bing") return "Bing";
  if (value === "chatgpt") return "ChatGPT";
  return "Gemini";
}

/** 첨부 레퍼런스의 전폭 포지션 추적 요약 위젯. */
export function WidgetPositionTracking({
  summary,
  domain,
  folderId,
  activeRun,
}: {
  summary: PositionTrackingWidgetSummary | null;
  domain: string;
  folderId?: string | null;
  activeRun?: PositionTrackingActiveRunSummary | null;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [hidden, setHidden] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  if (hidden) return null;

  const campaignId = summary?.campaignId;
  const hasKeywords = (summary?.keywords.length ?? 0) > 0;

  if (!summary || !hasKeywords) {
    return (
      <>
        <WidgetCard
          big
          ariaLabel={ko ? "포지션 추적" : "Position Tracking"}
          className="flex min-h-[250px] flex-col md:col-span-2 xl:col-span-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <WidgetTitle>{ko ? "포지션 추적" : "Position Tracking"}</WidgetTitle>
              <InfoHint label={ko ? "검색 및 AI 답변에서 사이트 순위를 추적합니다" : "Track your site across search and AI answers"} />
            </div>
            <button
              type="button"
              aria-label={ko ? "포지션 추적 위젯 숨기기" : "Hide Position Tracking widget"}
              onClick={() => setHidden(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#a4a7ad] transition-colors hover:bg-[#f2f3f4] hover:text-[#666971]"
            >
              <Cross2Icon />
            </button>
          </div>
          <div className="-mx-5 mt-4 border-t border-app-border" />
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-7 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2ff] text-[#5753c9]">
              <DesktopIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-[#292c32]">
              {summary
                ? ko ? "추적할 키워드를 추가해 주세요" : "Add keywords to continue"
                : ko ? "검색 순위 추적을 시작하세요" : "Start tracking search positions"}
            </p>
            <p className="mt-1 max-w-[520px] text-[13px] leading-[20px] text-[#696c75]">
              {ko
                ? "Google·Bing 검색 순위와 ChatGPT·Gemini 인용 순위를 매주 수집하고 변화와 가시성을 확인할 수 있습니다."
                : "Collect Google and Bing rankings plus ChatGPT and Gemini citation positions every week."}
            </p>
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="mt-5 inline-flex h-9 items-center justify-center rounded-[7px] bg-[#17181c] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#303238] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235fe2]"
            >
              {summary ? (ko ? "설정 계속하기" : "Continue setup") : (ko ? "설정" : "Set up")}
            </button>
          </div>
        </WidgetCard>
        <PositionTrackingSetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          domain={domain}
          folderId={folderId}
          campaignId={campaignId}
        />
      </>
    );
  }

  if (activeRun) {
    const progress = activeRun.total > 0
      ? Math.round((activeRun.processed / activeRun.total) * 100)
      : 0;
    return (
      <WidgetCard
        big
        ariaLabel={ko ? "포지션 추적 수집 진행률" : "Position Tracking collection progress"}
        className="flex min-h-[250px] flex-col md:col-span-2 xl:col-span-3"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <WidgetTitle>{ko ? "포지션 추적" : "Position Tracking"}</WidgetTitle>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#eef5ff] px-2 py-0.5 text-[11px] font-medium text-[#235fe2]">
                <ReloadIcon className="h-3 w-3 animate-spin" aria-hidden="true" />
                {ko ? "수집 중" : "Collecting"}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-[#696c75]">
              {activeRun.currentKeyword
                ? `${ko ? "현재 키워드" : "Current keyword"}: ${activeRun.currentKeyword}`
                : ko ? "수집을 시작할 준비를 하고 있습니다." : "Preparing to collect rankings."}
            </p>
          </div>
          <strong className="text-[22px] font-semibold text-[#5753c9]">
            {activeRun.processed}/{activeRun.total}
          </strong>
        </div>
        <div className="mt-8 h-2 overflow-hidden rounded-full bg-[#e9eaee]" aria-label={`${progress}%`}>
          <div className="h-full rounded-full bg-[#625ee8] transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#696c75]">
          <span>{ko ? "성공" : "Succeeded"} {activeRun.succeeded} · {ko ? "실패" : "Failed"} {activeRun.failed}</span>
          <Link
            href={`/position-tracking/?campaign=${encodeURIComponent(summary.campaignId)}&run=${encodeURIComponent(activeRun.runId)}`}
            className="font-medium text-[#235fe2] hover:underline"
          >
            {ko ? "상세 진행률 보기" : "View progress"} →
          </Link>
        </div>
      </WidgetCard>
    );
  }

  const keywords = summary.keywords;
  const total = Math.max(1, keywords.length);
  const counts = {
    top3: keywords.filter((item) => item.position !== null && item.position <= 3).length,
    top10: keywords.filter((item) => item.position !== null && item.position <= 10).length,
    top20: keywords.filter((item) => item.position !== null && item.position <= 20).length,
    top100: keywords.filter((item) => item.position !== null && item.position <= 100).length,
  };
  // 실적 개선/하락: 직전 수집 대비 순위 변화 실측 (previous_position 비교).
  const improvedCount = keywords.filter(
    (item) =>
      item.position !== null && item.previousPosition !== null && item.position < item.previousPosition
  ).length;
  const declinedCount = keywords.filter(
    (item) =>
      item.position !== null && item.previousPosition !== null && item.position > item.previousPosition
  ).length;
  const tableRows = [...keywords]
    .sort((a, b) => {
      // 코드포인트 비교로 서버/클라이언트 정렬을 결정적으로 유지한다.
      // localeCompare 는 런타임 기본 콜레이션(en vs ko)에 따라 순서가 달라져
      // SSR 하이드레이션 불일치를 일으킨다 (QA ISSUE-001).
      if (a.position === null && b.position === null) {
        return a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0;
      }
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    })
    .slice(0, 3);
  const history = summary.history;
  const historyData = history.map((point) => ({
    label: new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(point.capturedAt)),
    visibility: point.visibility,
  }));
  const location = summary.location.split(",")[0] || domain;
  const engine = searchEngineLabel(summary.searchEngine);
  const language = location.toLowerCase().includes("seoul") ? "Korean" : "English";
  const visibility = Math.max(0, Math.min(100, summary.visibility ?? 0));
  const DeviceIcon = summary.device === "mobile" ? MobileIcon : DesktopIcon;

  return (
    <WidgetCard
      big
      ariaLabel={ko ? "포지션 추적" : "Position Tracking"}
      className="flex min-h-[474px] flex-col md:col-span-2 xl:col-span-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div>
          <div className="flex items-center gap-1.5">
            <WidgetTitle>{ko ? "포지션 추적" : "Position Tracking"}</WidgetTitle>
            <InfoHint label={ko ? "추적 키워드의 검색 순위 요약" : "Search ranking summary for tracked keywords"} />
          </div>
          <Link
            href="/position-tracking/"
            className={cn("mt-3 inline-flex items-center gap-1.5 text-[14px] leading-[20px] hover:underline", SM.link)}
          >
            <DeviceIcon className="h-[15px] w-[15px]" aria-hidden="true" />
            <span>{location} ({engine})</span>
            <span aria-hidden="true">•</span>
            <span>{language}</span>
            <ChevronDownIcon className="h-[14px] w-[14px]" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex items-center gap-3 text-[13px] leading-[20px] text-[#696c75]">
          <span suppressHydrationWarning>
            {ko ? "마지막 업데이트" : "Last update"}: {formatRelativeTime(summary?.updatedAt ?? null, ko)}
          </span>
          <span className="h-4 w-px bg-[#d9dade]" aria-hidden="true" />
          <span suppressHydrationWarning>{formatRange(summary?.updatedAt ?? null, range, ko)}</span>
          <span className="relative inline-flex items-center">
            <select
              aria-label={ko ? "조회 기간" : "Date range"}
              value={range}
              onChange={(event) => setRange(Number(event.target.value) as (typeof RANGE_OPTIONS)[number])}
              className="appearance-none bg-transparent py-1 pl-1 pr-5 text-[13px] font-medium text-[#235fe2] outline-none"
            >
              {RANGE_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {ko ? `지난 ${days}일` : `Last ${days} days`}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-0 h-[14px] w-[14px] text-[#235fe2]" aria-hidden="true" />
          </span>
          <button
            type="button"
            aria-label={ko ? "포지션 추적 위젯 숨기기" : "Hide Position Tracking widget"}
            onClick={() => setHidden(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#a4a7ad] transition-colors hover:bg-[#f2f3f4] hover:text-[#666971]"
          >
            <Cross2Icon />
          </button>
        </div>
      </div>

      <div className="-mx-5 mt-4 border-t border-app-border" />

      <div className="grid flex-1 gap-8 py-5 md:grid-cols-2 xl:grid-cols-[1fr_1.08fr_1.12fr] xl:gap-12">
        <section aria-label={ko ? "가시성 요약" : "Visibility summary"} className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] leading-[20px] text-[#34373e]">
            <span>{ko ? "가시성" : "Visibility"}</span>
            <InfoHint label={ko ? "추적 키워드의 검색 결과 가시성" : "Search visibility across tracked keywords"} />
          </div>
          <p className="mt-1 text-[22px] font-semibold leading-[28px] text-[#5753c9]">{visibility}%</p>
          {historyData.length >= 2 ? (
            <div className="mt-3 h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ptVisibilityArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#625ee8" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#625ee8" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef0f2" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "#e0e1e9" }}
                    tick={{ fontSize: 11, fill: "#6c6e79" }}
                    tickMargin={6}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6c6e79" }}
                    width={32}
                    tickFormatter={(value: number) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e0e1e9", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                    formatter={(value) => [`${Number(value)}%`, ko ? "가시성" : "Visibility"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="visibility"
                    stroke="#625ee8"
                    strokeWidth={2}
                    fill="url(#ptVisibilityArea)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <>
              <Image
                src="/images/seo/position-tracking-empty.png"
                alt=""
                width={256}
                height={256}
                className="ml-[76px] mt-6 h-[92px] w-[92px] object-contain"
              />
              <p className="mt-3 text-[14px] leading-[20px] text-[#575a62]">
                {ko ? "반복 데이터 분석 이후에 추세가 표시됩니다" : "A trend appears after recurring data collection"}
              </p>
            </>
          )}
        </section>

        <section aria-label={ko ? "키워드 순위 구간" : "Keyword ranking groups"} className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] leading-[20px] text-[#34373e]">
            <span>{ko ? "키워드" : "Keywords"}</span>
            <InfoHint label={ko ? "순위 구간별 추적 키워드 수" : "Tracked keyword count by ranking group"} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-10 gap-y-8">
            <RankMetric label={ko ? "상위 3개" : "Top 3"} value={counts.top3} total={total} />
            <RankMetric label={ko ? "상위 10개" : "Top 10"} value={counts.top10} total={total} />
            <RankMetric label={ko ? "상위 20개" : "Top 20"} value={counts.top20} total={total} />
            <RankMetric label={ko ? "상위 100개" : "Top 100"} value={counts.top100} total={total} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-10">
            <div>
              <p className="text-[13px] leading-[18px] text-[#3d4047]">
                {ko ? "실적 개선 키워드" : "Improved keywords"}
              </p>
              <strong className="mt-1 block text-[21px] font-semibold leading-[26px] text-[#0ba360]">
                {improvedCount}
              </strong>
            </div>
            <div>
              <p className="text-[13px] leading-[18px] text-[#3d4047]">
                {ko ? "실적 하락 키워드" : "Declined keywords"}
              </p>
              <strong className="mt-1 block text-[21px] font-semibold leading-[26px] text-[#d3133a]">
                {declinedCount}
              </strong>
            </div>
          </div>
        </section>

        <section aria-label={ko ? "상위 키워드" : "Top keywords"} className="min-w-0 md:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-1.5 text-[14px] leading-[20px] text-[#34373e]">
            <span>{ko ? "상위 키워드" : "Top keywords"}</span>
            <InfoHint label={ko ? "현재 순위가 높은 추적 키워드" : "Highest-ranking tracked keywords"} />
          </div>
          <table className="mt-3 w-full table-fixed text-left text-[13px]">
            <thead className="text-[#3f4249]">
              <tr>
                <th className="w-[54%] pb-2 font-normal">{ko ? "키워드" : "Keyword"}</th>
                <th className="w-[23%] pb-2 text-center font-normal">{ko ? "포지션" : "Position"}</th>
                <th className="w-[23%] pb-2 text-right font-normal">{ko ? "가시성" : "Visibility"}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length > 0 ? (
                tableRows.map((item) => (
                  <tr key={item.keyword} className="border-b border-[#e8e9eb]">
                    <td className="truncate py-2.5 pr-2 font-medium text-[#235fe2]">{item.keyword}</td>
                    <td className="py-2.5 text-center text-[#282b31]">{item.position ?? "–"}</td>
                    <td className="py-2.5 text-right text-[#282b31]">{keywordVisibility(item.position)}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-[12px] leading-[18px] text-[#777b84]">
                    {summary
                      ? ko
                        ? "이 캠페인에 추적 중인 키워드가 없습니다."
                        : "No keywords tracked in this campaign yet."
                      : ko
                        ? "이 사이트에는 포지션 추적 캠페인이 없습니다."
                        : "No position tracking campaign for this site."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div className="mt-auto pt-1">
        <Link
          href="/position-tracking/"
          className="inline-flex h-[30px] items-center justify-center rounded-[6px] border border-[#cfd1d6] bg-white px-3 text-[13px] font-medium text-[#5c6068] transition-colors hover:bg-[#f6f7f8] hover:text-[#25282d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#235fe2]"
        >
          {ko ? "전체 보고서 보기" : "View full report"}
        </Link>
      </div>
    </WidgetCard>
  );
}
