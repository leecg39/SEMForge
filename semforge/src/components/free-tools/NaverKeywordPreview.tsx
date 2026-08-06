"use client";

// @TASK NKI-PUBLIC-UI - 네이버 키워드 공개 미리보기
// @SPEC 사용자 승인 계획: SEMForge 국내형 키워드 인텔리전스 / 공개 무료 도구
// @TEST src/components/free-tools/NaverKeywordPreview.test.ts
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { useLocale } from "@/i18n/LocaleProvider";
import type {
  NaverBlogOverview,
  NaverCacheStatus,
  NaverKeywordCount,
  NaverKeywordOverviewReport,
  NaverMeasurement,
  NaverSearchAdsOverview,
  NaverSection,
  NaverTrendOverview,
} from "@/server/naver-keywords/contracts";

const PREVIEW_ENDPOINT = "/api/public/naver-keywords/preview/";

type Locale = "ko" | "en";

interface PreviewErrorState {
  kind: "validation" | "rate-limit" | "request";
  message: string;
  retryAfterSeconds?: number;
}

interface JsonRecord {
  [key: string]: unknown;
}

export class PreviewHttpError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "PreviewHttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function normalizePreviewKeyword(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function formatVolumeRange(value: NaverKeywordCount, locale: Locale): string {
  if (value.display.trim()) return value.display;
  if (value.relation === "lt" && value.maxExclusive !== null) {
    return `<${new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US").format(value.maxExclusive)}`;
  }
  if (value.maxExclusive !== null && value.maxExclusive > value.min + 1) {
    const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
    return `${number.format(value.min)}–${number.format(value.maxExclusive - 1)}`;
  }
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US").format(value.min);
}

export function formatOptionalVolume(value: NaverKeywordCount | null, locale: Locale): string {
  return value ? formatVolumeRange(value, locale) : locale === "ko" ? "사용 불가" : "Unavailable";
}

export function buildSignupHref(keyword: string): string {
  const normalized = normalizePreviewKeyword(keyword);
  if (!normalized) return "/signup/";
  const search = new URLSearchParams({ keyword: normalized });
  return `/signup/?${search.toString()}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreviewReport(value: unknown): value is NaverKeywordOverviewReport {
  if (!isRecord(value) || typeof value.keyword !== "string") return false;
  return [value.searchAds, value.trend, value.blog].every(
    (section) =>
      isRecord(section) &&
      (section.status === "live" || section.status === "unavailable" || section.status === "error"),
  );
}

function getBodyData(body: unknown): unknown {
  return isRecord(body) && "data" in body ? body.data : body;
}

function errorMessageFromBody(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return typeof body.error.message === "string" ? body.error.message : null;
}

function numericRetryAfter(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.ceil(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function retryAfterFromBody(body: unknown): number | undefined {
  if (!isRecord(body) || !isRecord(body.error) || !isRecord(body.error.details)) return undefined;
  return (
    numericRetryAfter(body.error.details.retryAfter) ??
    numericRetryAfter(body.error.details.retryAfterSeconds)
  );
}

function retryAfterFromHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = numericRetryAfter(value);
  if (seconds !== undefined) return seconds;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

export async function requestPreview(
  keyword: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NaverKeywordOverviewReport> {
  const response = await fetchImpl(PREVIEW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("application/json") ? await response.json() : null;
  const report = getBodyData(body);

  // 전체 공급자 실패는 503으로 전달될 수 있지만, 섹션별 unavailable 상태는 그대로 보여준다.
  if (isPreviewReport(report)) return report;

  if (!response.ok) {
    const retryAfter =
      retryAfterFromBody(body) ?? retryAfterFromHeader(response.headers.get("retry-after"));
    throw new PreviewHttpError(
      response.status,
      errorMessageFromBody(body) ?? "PREVIEW_REQUEST_FAILED",
      retryAfter,
    );
  }
  throw new PreviewHttpError(response.status, "PREVIEW_RESPONSE_INVALID");
}

export function summarizeReportAvailability(report: NaverKeywordOverviewReport): {
  liveSections: number;
  partial: boolean;
  noneAvailable: boolean;
} {
  const sections = [report.searchAds, report.trend, report.blog];
  const liveSections = sections.filter((section) => section.status === "live").length;
  return {
    liveSections,
    partial: liveSections > 0 && liveSections < sections.length,
    noneAvailable: liveSections === 0,
  };
}

function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatTimestamp(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPostDate(value: string, locale: Locale): string {
  if (!/^\d{8}$/.test(value)) return value;
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function measurementLabel(value: NaverMeasurement, locale: Locale): string {
  const labels: Record<NaverMeasurement, [string, string]> = {
    absolute: ["절대값", "Absolute"],
    relative: ["상대 지수", "Relative index"],
    calculated: ["계산값", "Calculated"],
    inferred: ["추론값", "Inferred"],
  };
  return labels[value][locale === "ko" ? 0 : 1];
}

function cacheLabel(value: NaverCacheStatus, locale: Locale): string {
  if (value === "stale") return locale === "ko" ? "이전 캐시" : "Stale cache";
  return locale === "ko" ? "최신 캐시" : "Fresh cache";
}

function SourceBadges<T>({ section, locale }: { section: NaverSection<T>; locale: Locale }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6c6e79]">
      <span className="inline-flex min-h-7 items-center rounded-full border border-[#dfe1e2] bg-white px-3 font-semibold text-[#3f443d]">
        {section.source}
      </span>
      <span className="inline-flex min-h-7 items-center rounded-full bg-[#f3f6f6] px-3">
        {measurementLabel(section.measurement, locale)}
      </span>
      <span className="inline-flex min-h-7 items-center rounded-full bg-[#f3f6f6] px-3">
        {cacheLabel(section.cache, locale)}
      </span>
      <time dateTime={section.fetchedAt}>{formatTimestamp(section.fetchedAt, locale)}</time>
    </div>
  );
}

function SectionUnavailable<T>({ section, locale }: { section: NaverSection<T>; locale: Locale }) {
  return (
    <div>
      <div className="rounded-[8px] border border-dashed border-[#d1d2d5] bg-[#f8f9f9] px-5 py-8 text-center">
        <p className="text-[15px] font-semibold text-[#3f443d]">
          {section.status === "error"
            ? locale === "ko"
              ? "데이터를 불러오지 못했습니다"
              : "Could not load this data"
            : locale === "ko"
              ? "현재 사용할 수 없는 데이터입니다"
              : "This data is currently unavailable"}
        </p>
        {section.reason && <p className="mt-2 text-[13px] leading-6 text-[#6c6e79]">{section.reason}</p>}
      </div>
      <div className="mt-4"><SourceBadges section={section} locale={locale} /></div>
    </div>
  );
}

function ResultSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-[#e8e9e9] bg-white p-5 sm:p-7">
      <header className="mb-5">
        <h2 className="font-[family-name:var(--font-lazzer)] text-[20px] font-semibold tracking-[-0.3px] text-[#181e15]">
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-[#6c6e79]">{description}</p>
      </header>
      {children}
    </section>
  );
}

function VolumeCard({ label, value, locale }: { label: string; value: NaverKeywordCount | null; locale: Locale }) {
  return (
    <article className="min-w-0 border-l-2 border-[#ff385c] bg-[#fafafa] px-4 py-5">
      <p className="text-[12px] font-medium text-[#6c6e79]">{label}</p>
      <p className={`mt-2 truncate font-[family-name:var(--font-lazzer)] font-semibold text-[#181e15] ${value ? "text-[28px] tracking-[-0.8px]" : "text-[18px] tracking-[-0.2px]"}`}>
        {formatOptionalVolume(value, locale)}
      </p>
      <p className="mt-1 text-[11px] text-[#6c6e79]">
        {value
          ? locale === "ko" ? "최근 30일 월간 검색수" : "Monthly queries, last 30 days"
          : locale === "ko" ? "공급자가 값을 제공하지 않음" : "Not provided by the source"}
      </p>
    </article>
  );
}

function competitionText(
  data: NaverSearchAdsOverview["primary"],
  locale: Locale,
): string {
  if (!data?.competition) return locale === "ko" ? "제공되지 않음" : "Not provided";
  if (locale === "ko" && data.competitionLabel) return data.competitionLabel;
  return {
    low: locale === "ko" ? "낮음" : "Low",
    medium: locale === "ko" ? "중간" : "Medium",
    high: locale === "ko" ? "높음" : "High",
  }[data.competition];
}

function SearchAdsResult({
  section,
  locale,
}: {
  section: NaverSection<NaverSearchAdsOverview>;
  locale: Locale;
}) {
  if (section.status !== "live") return <SectionUnavailable section={section} locale={locale} />;
  const primary = section.data.primary;
  if (!primary) {
    return (
      <div>
        <p className="rounded-[8px] bg-[#f8f9f9] p-5 text-[14px] text-[#6c6e79]">
          {locale === "ko" ? "일치하는 검색광고 키워드 통계가 없습니다." : "No matching Search Ads keyword statistics."}
        </p>
        <div className="mt-4"><SourceBadges section={section} locale={locale} /></div>
      </div>
    );
  }

  const related = section.data.relatedKeywords.slice(0, 5);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <VolumeCard label={locale === "ko" ? "PC 검색량" : "Desktop"} value={primary.monthlyPcQueries} locale={locale} />
        <VolumeCard label={locale === "ko" ? "모바일 검색량" : "Mobile"} value={primary.monthlyMobileQueries} locale={locale} />
        <VolumeCard label={locale === "ko" ? "합계 검색량" : "Total"} value={primary.monthlyTotalQueries} locale={locale} />
      </div>
      <div className="mt-4 flex flex-col gap-2 border-y border-[#eef0ef] py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] text-[#6c6e79]">{locale === "ko" ? "검색광고 경쟁도" : "Paid-ad competition"}</p>
          <p className="mt-1 text-[18px] font-semibold text-[#181e15]">{competitionText(primary, locale)}</p>
        </div>
        <p className="max-w-[390px] text-[12px] leading-5 text-[#6c6e79]">
          {locale === "ko"
            ? "네이버 검색광고 경쟁도이며 자연검색 노출 난이도와는 다른 지표입니다."
            : "This is paid-search competition, not organic ranking difficulty."}
        </p>
      </div>
      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-[#181e15]">
          {locale === "ko" ? "관련 키워드 미리보기" : "Related keyword preview"}
        </h3>
        {related.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={locale === "ko" ? "관련 키워드 5개" : "Five related keywords"}>
            {related.map((item) => (
              <li key={item.normalizedKeyword} className="rounded-[6px] border border-[#dfe1e2] bg-white px-3 py-2 text-[13px] font-medium text-[#3f443d]">
                {item.keyword}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-[#6c6e79]">{locale === "ko" ? "관련 키워드가 없습니다." : "No related keywords."}</p>
        )}
      </div>
      <div className="mt-5"><SourceBadges section={section} locale={locale} /></div>
    </div>
  );
}

function TrendChart({ data, locale }: { data: NaverTrendOverview; locale: Locale }) {
  const points = data.points.slice(-12);
  if (points.length === 0) {
    return <p className="rounded-[8px] bg-[#f8f9f9] p-5 text-[14px] text-[#6c6e79]">{locale === "ko" ? "표시할 트렌드 관측값이 없습니다." : "No trend observations to display."}</p>;
  }
  const x = (index: number) => (points.length === 1 ? 50 : (index / (points.length - 1)) * 100);
  const y = (ratio: number) => 92 - (Math.max(0, Math.min(100, ratio)) / 100) * 76;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.ratio).toFixed(2)}`).join(" ");

  return (
    <figure>
      <div className="rounded-[8px] bg-[#f7fbfa] px-3 py-5 sm:px-5">
        <svg viewBox="0 0 100 108" preserveAspectRatio="none" className="h-[210px] w-full" role="img" aria-labelledby="naver-trend-title naver-trend-description">
          <title id="naver-trend-title">{locale === "ko" ? `${data.title} 상대 검색 트렌드` : `${data.title} relative search trend`}</title>
          <desc id="naver-trend-description">{locale === "ko" ? "네이버 검색 트렌드의 월별 상대 지수입니다. 절대 검색량이 아닙니다." : "Monthly relative index from Naver Search Trend. This is not absolute volume."}</desc>
          {[16, 35, 54, 73, 92].map((lineY) => <line key={lineY} x1="0" x2="100" y1={lineY} y2={lineY} stroke="#dfe5e3" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />)}
          <path d={path} fill="none" stroke="#ff385c" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <circle key={`${point.period}-${index}`} cx={x(index)} cy={y(point.ratio)} r="1.35" fill="#ff385c" vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div className="mt-2 flex justify-between text-[11px] text-[#6c6e79]">
          <span>{points[0]?.period}</span>
          <span>{points.at(-1)?.period}</span>
        </div>
      </div>
      <figcaption className="mt-3 text-[12px] leading-5 text-[#6c6e79]">
        {locale === "ko"
          ? "가장 높은 시점을 100으로 환산한 상대 지수입니다. 월간 검색수와 직접 비교하지 마세요."
          : "A relative index normalized to a peak of 100. Do not treat it as monthly search volume."}
      </figcaption>
      <ol className="sr-only">
        {points.map((point) => <li key={point.period}>{point.period}: {point.ratio}</li>)}
      </ol>
    </figure>
  );
}

function TrendResult({ section, locale }: { section: NaverSection<NaverTrendOverview>; locale: Locale }) {
  if (section.status !== "live") return <SectionUnavailable section={section} locale={locale} />;
  return (
    <div>
      <TrendChart data={section.data} locale={locale} />
      <div className="mt-5"><SourceBadges section={section} locale={locale} /></div>
    </div>
  );
}

function BlogResult({ section, locale }: { section: NaverSection<NaverBlogOverview>; locale: Locale }) {
  if (section.status !== "live") return <SectionUnavailable section={section} locale={locale} />;
  const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
  const items = section.data.items.slice(0, 3);

  return (
    <div>
      <div className="flex flex-col gap-1 border-l-2 border-[#181e15] bg-[#fafafa] px-4 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-[13px] font-medium text-[#3f443d]">{locale === "ko" ? "블로그 검색 API 결과 수" : "Blog Search API result count"}</p>
        <p className="font-[family-name:var(--font-lazzer)] text-[26px] font-semibold text-[#181e15]">{number.format(section.data.total)}</p>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#6c6e79]">
        {locale === "ko"
          ? "검색 API가 반환한 공급량 참고값입니다. 통합검색·VIEW·스마트블록 순위를 뜻하지 않습니다."
          : "A supply reference returned by the Blog Search API, not a ranking in integrated search, VIEW, or SmartBlock."}
      </p>
      <h3 className="mt-6 text-[13px] font-semibold text-[#181e15]">
        {locale === "ko" ? section.data.resultLabel : "Examples returned by Naver Blog Search API"}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-[#eef0ef] border-y border-[#eef0ef]" role="list">
          {items.map((item) => {
            const href = safeExternalHref(item.link);
            return (
              <li key={item.link} className="py-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#03c75a]" />
                  <div className="min-w-0">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold leading-6 text-[#181e15] underline decoration-[#d1d2d5] underline-offset-4 hover:decoration-[#181e15] focus-visible:rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff385c]">
                        {item.title}
                        <span className="sr-only"> ({locale === "ko" ? "새 창" : "opens in a new tab"})</span>
                      </a>
                    ) : (
                      <p className="font-semibold leading-6 text-[#181e15]">{item.title}</p>
                    )}
                    {item.description && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#6c6e79]">{item.description}</p>}
                    {(item.bloggerName || item.postDate) && (
                    <p className="mt-2 text-[11px] text-[#6c6e79]">
                        {[item.bloggerName, item.postDate ? formatPostDate(item.postDate, locale) : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-[8px] bg-[#f8f9f9] p-5 text-[13px] text-[#6c6e79]">{locale === "ko" ? "표시할 블로그 검색 응답이 없습니다." : "No Blog Search examples to display."}</p>
      )}
      <div className="mt-5"><SourceBadges section={section} locale={locale} /></div>
    </div>
  );
}

const LOCKED_FEATURES: Array<[string, string]> = [
  ["전체 연관 키워드", "Full related keywords"],
  ["인구통계 분석", "Demographic insights"],
  ["CSV 내보내기", "CSV export"],
  ["키워드 목록 저장", "Save to keyword lists"],
  ["콘텐츠 브리프", "Content brief"],
  ["광고 키워드 초안", "Ad keyword draft"],
];

function LockedWorkspace({ keyword, locale }: { keyword: string; locale: Locale }) {
  return (
    <section className="overflow-hidden rounded-[12px] bg-[#181e15] text-white">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">{locale === "ko" ? "무료 계정에서 계속" : "Continue with a free account"}</p>
          <h2 className="mt-3 max-w-[480px] font-[family-name:var(--font-lazzer)] text-[28px] font-semibold leading-[1.14] tracking-[-0.7px] sm:text-[34px]">
            {locale === "ko" ? "조회에서 실행까지 한 작업공간에서" : "Move from research to action in one workspace"}
          </h2>
          <p className="mt-3 max-w-[520px] text-[14px] leading-6 text-white/65">
            {locale === "ko" ? "현재 키워드를 그대로 가져가 전체 탐색, 저장, 콘텐츠와 광고 작업을 이어가세요." : "Keep this keyword and unlock exploration, saving, content, and advertising workflows."}
          </p>
          <Link href={buildSignupHref(keyword)} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-[8px] bg-[#c21843] px-6 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-[#a90f38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            {locale === "ko" ? "무료 계정 만들기" : "Create a free account"}
          </Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label={locale === "ko" ? "로그인 후 이용 가능한 기능" : "Features available after sign-up"}>
          {LOCKED_FEATURES.map(([ko, en]) => (
            <li key={en} className="flex min-h-12 items-center gap-3 rounded-[8px] border border-white/10 bg-white/[0.04] px-4 text-[13px] text-white/80">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="1.8"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <span>{locale === "ko" ? ko : en}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LoadingSkeleton({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-[12px] border border-[#e8e9e9] bg-white p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d1d2d5] border-t-[#ff385c] motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-[#181e15]">{locale === "ko" ? "네이버 공식 데이터를 확인하고 있습니다" : "Checking official Naver data"}</p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-[8px] bg-[#f3f6f6] motion-reduce:animate-none" />)}
      </div>
      <span className="sr-only">{locale === "ko" ? "검색 결과 로딩 중" : "Loading search results"}</span>
    </div>
  );
}

function ErrorNotice({ error, keyword, locale }: { error: PreviewErrorState; keyword: string; locale: Locale }) {
  const retryMinutes = error.retryAfterSeconds ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60)) : null;
  return (
    <div id="naver-keyword-preview-error" role="alert" className="rounded-[12px] border border-[#f3b8c3] bg-[#fff6f7] p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold text-[#7e1730]">
        {error.kind === "rate-limit"
          ? locale === "ko" ? "오늘의 무료 조회 한도를 사용했습니다" : "You have reached today's free preview limit"
          : locale === "ko" ? "조회 결과를 가져오지 못했습니다" : "We could not fetch the preview"}
      </h2>
      <p className="mt-2 text-[13px] leading-6 text-[#7e1730]">
        {error.kind === "rate-limit"
          ? retryMinutes
            ? locale === "ko" ? `약 ${retryMinutes}분 후 다시 시도하거나 무료 계정에서 계속하세요.` : `Try again in about ${retryMinutes} minutes, or continue with a free account.`
            : locale === "ko" ? "제한이 초기화된 뒤 다시 시도하거나 무료 계정에서 계속하세요." : "Try again after the limit resets, or continue with a free account."
          : error.message}
      </p>
      {error.kind === "rate-limit" && (
        <Link href={buildSignupHref(keyword)} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[8px] bg-[#181e15] px-5 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#181e15]">
          {locale === "ko" ? "현재 키워드로 가입하기" : "Sign up with this keyword"}
        </Link>
      )}
    </div>
  );
}

export function NaverKeywordPreview() {
  const { locale } = useLocale();
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [report, setReport] = useState<NaverKeywordOverviewReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PreviewErrorState | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const normalized = normalizePreviewKeyword(keyword);
    if (!normalized) {
      setError({ kind: "validation", message: locale === "ko" ? "조회할 키워드를 입력해 주세요." : "Enter a keyword to preview." });
      return;
    }
    if (normalized.length > 80) {
      setError({ kind: "validation", message: locale === "ko" ? "키워드는 80자 이내로 입력해 주세요." : "Keep the keyword within 80 characters." });
      return;
    }

    setKeyword(normalized);
    setSubmittedKeyword(normalized);
    setReport(null);
    setPending(true);
    setError(null);
    try {
      const next = await requestPreview(normalized);
      setReport(next);
    } catch (reason) {
      if (reason instanceof PreviewHttpError && reason.status === 429) {
        setError({ kind: "rate-limit", message: reason.message, retryAfterSeconds: reason.retryAfterSeconds });
      } else {
        setError({ kind: "request", message: locale === "ko" ? "잠시 후 다시 시도해 주세요. 사용할 수 없는 데이터는 임의의 값으로 대체하지 않습니다." : "Please try again shortly. Unavailable data is never replaced with fabricated metrics." });
      }
    } finally {
      setPending(false);
    }
  }

  const availability = report ? summarizeReportAvailability(report) : null;
  const partial = availability?.partial ?? false;
  const noneAvailable = availability?.noneAvailable ?? false;
  const activeKeyword = report?.keyword || submittedKeyword || keyword;

  const statusAnnouncement = pending
    ? locale === "ko" ? "네이버 키워드 데이터를 조회하고 있습니다." : "Loading Naver keyword data."
    : error
      ? error.kind === "rate-limit"
        ? locale === "ko" ? "무료 조회 한도에 도달했습니다." : "The free preview limit has been reached."
        : locale === "ko" ? "키워드 조회에 실패했습니다." : "The keyword preview failed."
      : report
        ? partial
          ? locale === "ko" ? "일부 데이터와 함께 조회가 완료되었습니다." : "The preview loaded with partial data."
          : noneAvailable
            ? locale === "ko" ? "현재 사용할 수 있는 공급자 데이터가 없습니다." : "No provider data is currently available."
            : locale === "ko" ? "키워드 조회가 완료되었습니다." : "The keyword preview is ready."
        : "";

  return (
    <div className="bg-[#f7f8f8]">
      <section className="border-b border-[#eceeee] bg-white py-12 sm:py-16 lg:py-20">
        <Container className="px-4 sm:px-8">
          <div className="mx-auto max-w-[1040px]">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6c6e79]">
                  <span className="h-2 w-2 rounded-full bg-[#03c75a]" aria-hidden="true" />
                  {locale === "ko" ? "무료 네이버 키워드 도구" : "Free Naver keyword tool"}
                </div>
                <h1 className="mt-4 max-w-[760px] font-[family-name:var(--font-lazzer)] text-[36px] font-semibold leading-[1.04] tracking-[-1.3px] text-[#181e15] sm:text-[50px] sm:tracking-[-2px]">
                  {locale === "ko" ? "네이버 검색량을 실제 데이터로 확인하세요" : "Check Naver search demand with real data"}
                </h1>
                <p className="mt-5 max-w-[680px] text-[16px] leading-7 text-[#6c6e79] sm:text-[17px]">
                  {locale === "ko" ? "PC·모바일 검색량, 광고 경쟁도, 상대 트렌드와 블로그 검색 API 응답을 한 번에 확인합니다." : "See desktop and mobile demand, paid-ad competition, relative trends, and Blog Search API responses in one view."}
                </p>
              </div>
              <aside className="border-l-2 border-[#03c75a] bg-[#f7fbf9] px-4 py-4 text-[12px] leading-5 text-[#4e554f]">
                <p className="font-semibold text-[#181e15]">{locale === "ko" ? "실데이터·명확한 출처" : "Real data, clear provenance"}</p>
                <p className="mt-1">{locale === "ko" ? "네이버 Search Ads와 API HUB 연결 상태를 그대로 보여주며 사용할 수 없는 값은 만들어내지 않습니다." : "Provider status is shown as-is. Missing values are never fabricated."}</p>
              </aside>
            </div>

            <form onSubmit={submit} className="mt-9 grid gap-3 rounded-[12px] border border-[#dfe1e2] bg-white p-3 shadow-[0_8px_28px_rgba(24,30,21,0.08)] sm:grid-cols-[minmax(0,1fr)_180px]" aria-busy={pending}>
              <div>
                <label htmlFor="naver-keyword-preview-input" className="sr-only">{locale === "ko" ? "네이버 키워드" : "Naver keyword"}</label>
                <input id="naver-keyword-preview-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} maxLength={80} autoComplete="off" enterKeyHint="search" aria-describedby={error ? "naver-keyword-preview-help naver-keyword-preview-error" : "naver-keyword-preview-help"} aria-invalid={error?.kind === "validation" || undefined} placeholder={locale === "ko" ? "예: 검색엔진 최적화" : "e.g. search engine optimization"} className="h-14 w-full rounded-[8px] bg-[#f7f8f8] px-4 text-[16px] text-[#181e15] outline-none placeholder:text-[#6c6e79] focus:bg-white focus:ring-2 focus:ring-[#181e15]" />
                <span id="naver-keyword-preview-help" className="sr-only">{locale === "ko" ? "한 번에 하나의 키워드, 최대 80자" : "One keyword at a time, up to 80 characters"}</span>
              </div>
              <button type="submit" disabled={pending} className="inline-flex min-h-14 items-center justify-center rounded-[8px] bg-[#c21843] px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#a90f38] active:scale-[0.99] disabled:cursor-wait disabled:opacity-65 motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#181e15]">
                {pending ? locale === "ko" ? "조회 중…" : "Checking…" : locale === "ko" ? "검색량 확인" : "Check volume"}
              </button>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6c6e79]">
              <p>{locale === "ko" ? "로그인 없이 서로 다른 키워드 3개/24시간" : "3 distinct keywords per 24 hours without signing in"}</p>
              <p>{locale === "ko" ? "대한민국 · 네이버 공식 공급자" : "South Korea · official Naver providers"}</p>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-8 sm:py-12">
        <Container className="px-4 sm:px-8">
          <p className="sr-only" role="status" aria-live="polite">{statusAnnouncement}</p>
          <div className="mx-auto max-w-[1040px] space-y-4" aria-busy={pending}>
            {error && <ErrorNotice error={error} keyword={activeKeyword} locale={locale} />}
            {pending && !report && <LoadingSkeleton locale={locale} />}

            {report && (
              <div className={pending ? "space-y-4 opacity-55 transition-opacity duration-200" : "space-y-4 transition-opacity duration-200"}>
                <header className="flex flex-col gap-3 rounded-[12px] border border-[#e8e9e9] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6c6e79]">{locale === "ko" ? "조회 결과" : "Preview result"}</p>
                    <h2 className="mt-1 break-words font-[family-name:var(--font-lazzer)] text-[25px] font-semibold text-[#181e15]">“{report.keyword}”</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {partial && <span className="inline-flex min-h-8 items-center rounded-full bg-[#fff4dc] px-3 text-[11px] font-semibold text-[#7a5200]">{locale === "ko" ? "일부 데이터만 제공" : "Partial data"}</span>}
                    {noneAvailable && <span className="inline-flex min-h-8 items-center rounded-full bg-[#f3f6f6] px-3 text-[11px] font-semibold text-[#5f645f]">{locale === "ko" ? "공급자 연결 필요" : "Provider connection required"}</span>}
                    <time dateTime={report.generatedAt} className="text-[11px] text-[#6c6e79]">{formatTimestamp(report.generatedAt, locale)}</time>
                  </div>
                </header>

                <ResultSection title={locale === "ko" ? "검색 수요와 광고 경쟁" : "Search demand and ad competition"} description={locale === "ko" ? "Search Ads의 월간 키워드 통계입니다. <10은 0으로 바꾸지 않고 범위로 유지합니다." : "Monthly Search Ads statistics. Values below 10 remain ranges rather than being coerced to zero."}>
                  <SearchAdsResult section={report.searchAds} locale={locale} />
                </ResultSection>

                <div className="grid gap-4 lg:grid-cols-2">
                  <ResultSection title={locale === "ko" ? "최근 12개월 상대 트렌드" : "12-month relative trend"} description={locale === "ko" ? "검색 관심도의 방향을 비교하는 상대 지수입니다." : "A relative index for comparing the direction of search interest."}>
                    <TrendResult section={report.trend} locale={locale} />
                  </ResultSection>
                  <ResultSection title={locale === "ko" ? "블로그 검색 공급량" : "Blog Search supply"} description={locale === "ko" ? "블로그 검색 API가 반환한 결과 수와 응답 예시입니다." : "Result count and examples returned by the Blog Search API."}>
                    <BlogResult section={report.blog} locale={locale} />
                  </ResultSection>
                </div>

                <LockedWorkspace keyword={activeKeyword} locale={locale} />
              </div>
            )}

            {!report && !pending && !error && (
              <div className="grid gap-4 lg:grid-cols-3">
                {[
                  [locale === "ko" ? "검색량" : "Search demand", locale === "ko" ? "PC·모바일·합계 범위를 구분합니다." : "Separate desktop, mobile, and total ranges."],
                  [locale === "ko" ? "상대 트렌드" : "Relative trend", locale === "ko" ? "절대 검색량과 혼동하지 않도록 표시합니다." : "Clearly distinguished from absolute volume."],
                  [locale === "ko" ? "블로그 공급량" : "Blog supply", locale === "ko" ? "검색 API 응답이며 순위로 표현하지 않습니다." : "API responses shown without ranking claims."],
                ].map(([title, body]) => (
                  <article key={title} className="border-t-2 border-[#181e15] bg-white p-5">
                    <h2 className="text-[15px] font-semibold text-[#181e15]">{title}</h2>
                    <p className="mt-2 text-[13px] leading-5 text-[#6c6e79]">{body}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>
    </div>
  );
}
