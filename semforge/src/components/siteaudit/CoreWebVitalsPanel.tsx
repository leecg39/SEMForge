"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Core Web Vitals 패널 — GET /api/psi (PageSpeed Insights 프록시) 실데이터 표시.
 *
 * 계약(ProviderResult 봉투):
 *   { status:"live", data:{ scores:{performance,accessibility,bestPractices,seo},
 *                           cwv:{ lcpMs?, cls?, inpMs?, fcpMs?, tbtMs?, source, originLevel? } } }
 *   { status:"unavailable", reason }  — API 키 미설정 등
 *   { status:"error", reason }        — 제공사 호출 실패
 * 데이터 원칙: 없는 메트릭은 0 으로 채우지 않고 표시하지 않는다.
 */

interface PsiScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface PsiCwv {
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  fcpMs?: number;
  tbtMs?: number;
  source: "field" | "lab" | "none";
  originLevel?: boolean;
}

interface PsiEnvelope {
  status: "live" | "unavailable" | "error";
  data?: { scores: PsiScores; cwv: PsiCwv };
  source?: string;
  fetchedAt?: string;
  reason?: string;
}

const COPY = {
  ko: {
    title: "Core Web Vitals",
    subtitle: "PageSpeed Insights · 모바일 실측",
    refresh: "다시 조회",
    loading: "PageSpeed Insights 를 조회하고 있습니다. 수십 초가 걸릴 수 있습니다…",
    unavailableTitle: "PageSpeed Insights 미설정",
    errorTitle: "PageSpeed 조회 실패",
    retry: "다시 시도",
    scorePerformance: "Performance",
    scoreAccessibility: "Accessibility",
    scoreBestPractices: "Best Practices",
    scoreSeo: "SEO",
    cwvTitle: "핵심 지표",
    lcp: "LCP (최대 콘텐츠풀 페인트)",
    cls: "CLS (누적 레이아웃 이동)",
    inp: "INP (다음 페인트까지의 상호작용)",
    fcp: "FCP (최초 콘텐츠풀 페인트)",
    tbt: "TBT (총 차단 시간)",
    sourceField: "실사용자 데이터 (CrUX)",
    sourceLab: "랩 데이터 (Lighthouse)",
    sourceNone: "메트릭 데이터 없음",
    originNote: "URL 단위 데이터가 없어 오리진 단위 데이터를 표시합니다.",
    fetchedAt: (date: string) => `조회 시각: ${date}`,
    sourceLabel: "출처: pagespeed-insights",
  },
  en: {
    title: "Core Web Vitals",
    subtitle: "PageSpeed Insights · mobile",
    refresh: "Refresh",
    loading: "Querying PageSpeed Insights. This can take tens of seconds…",
    unavailableTitle: "PageSpeed Insights not configured",
    errorTitle: "PageSpeed lookup failed",
    retry: "Retry",
    scorePerformance: "Performance",
    scoreAccessibility: "Accessibility",
    scoreBestPractices: "Best Practices",
    scoreSeo: "SEO",
    cwvTitle: "Core metrics",
    lcp: "LCP (Largest Contentful Paint)",
    cls: "CLS (Cumulative Layout Shift)",
    inp: "INP (Interaction to Next Paint)",
    fcp: "FCP (First Contentful Paint)",
    tbt: "TBT (Total Blocking Time)",
    sourceField: "Real-user data (CrUX)",
    sourceLab: "Lab data (Lighthouse)",
    sourceNone: "No metric data",
    originNote: "No URL-level data; showing origin-level data.",
    fetchedAt: (date: string) => `Fetched: ${date}`,
    sourceLabel: "Source: pagespeed-insights",
  },
} as const;

function scoreColor(score: number): string {
  if (score >= 90) return "#00a87d";
  if (score >= 50) return "#f5a623";
  return "#e01b4b";
}

function formatMs(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

function ScoreDial({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 64 64" className="h-[64px] w-[64px]" role="img" aria-label={`${label} ${score}`}>
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#eceef2" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${((score / 100) * circumference).toFixed(1)} ${circumference.toFixed(1)}`}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>
          {score}
        </text>
      </svg>
      <span className="text-[11px] font-medium text-app-text-secondary">{label}</span>
    </div>
  );
}

export function CoreWebVitalsPanel({ domain }: { domain: string }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  // 로딩 상태를 별도 setState 없이 파생한다 (effect 안 동기 setState 금지 규칙 대응).
  // data 가 현재 domain/reload 조합과 다르면 아직 로딩 중으로 본다.
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{
    domain: string;
    reload: number;
    result: PsiEnvelope;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const target = `https://${domain.replace(/^https?:\/\//, "")}`;
        const response = await fetch(
          `/api/psi/?url=${encodeURIComponent(target)}&strategy=mobile`
        );
        const body = (await response.json()) as PsiEnvelope;
        if (!cancelled) setData({ domain, reload, result: body });
      } catch {
        if (!cancelled) setData({ domain, reload, result: { status: "error" } });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [domain, reload]);

  const loading = data === null || data.domain !== domain || data.reload !== reload;
  const result = !loading ? data.result : null;
  const load = useCallback(() => setReload((current) => current + 1), []);

  const dateFormatter = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cwv = result?.status === "live" ? result.data?.cwv : undefined;
  const scores = result?.status === "live" ? result.data?.scores : undefined;
  const cwvRows: { label: string; value: string }[] = [];
  if (cwv) {
    if (cwv.lcpMs !== undefined) cwvRows.push({ label: copy.lcp, value: formatMs(cwv.lcpMs) });
    if (cwv.cls !== undefined) cwvRows.push({ label: copy.cls, value: cwv.cls.toFixed(3) });
    if (cwv.inpMs !== undefined) cwvRows.push({ label: copy.inp, value: formatMs(cwv.inpMs) });
    if (cwv.fcpMs !== undefined) cwvRows.push({ label: copy.fcp, value: formatMs(cwv.fcpMs) });
    if (cwv.tbtMs !== undefined) cwvRows.push({ label: copy.tbt, value: formatMs(cwv.tbtMs) });
  }

  return (
    <section className="rounded-[10px] border border-app-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold text-app-text">{copy.title}</h3>
          <p className="mt-0.5 text-[12px] text-app-text-secondary">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {result && !loading && (
            <span
              className={cn(
                "rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium",
                result.status === "live" && "bg-[#e6f5f0] text-[#0a6b57]",
                result.status === "unavailable" && "bg-[#eceef2] text-app-text-secondary",
                result.status === "error" && "bg-[#fdecef] text-[#a4002a]"
              )}
            >
              {result.status === "live"
                ? locale === "ko"
                  ? "실시간 수집"
                  : "Live"
                : result.status === "unavailable"
                  ? locale === "ko"
                    ? "연결 필요"
                    : "Setup needed"
                  : locale === "ko"
                    ? "수집 실패"
                    : "Failed"}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-[28px] rounded-[6px] border border-app-border bg-white px-2.5 text-[12px] font-medium text-app-text transition-colors hover:bg-app-bg disabled:opacity-50"
          >
            {result?.status === "error" ? copy.retry : copy.refresh}
          </button>
        </div>
      </div>

      {loading && (
        <p className="mt-4 flex items-center gap-2.5 text-[13px] text-app-text-secondary" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#235FE2] border-t-transparent" />
          {copy.loading}
        </p>
      )}

      {!loading && result?.status === "unavailable" && (
        <div className="mt-4 rounded-[8px] border border-dashed border-app-border bg-[#f9fafb] px-4 py-6 text-center">
          <p className="text-[13px] font-medium text-app-text">{copy.unavailableTitle}</p>
          {result.reason && (
            <p className="mt-1 text-[12px] text-app-text-secondary">{result.reason}</p>
          )}
        </div>
      )}

      {!loading && result?.status === "error" && (
        <div className="mt-4 rounded-[8px] border border-[#f5c2cd] bg-[#fdecef] px-4 py-4">
          <p className="text-[13px] font-medium text-[#a4002a]">{copy.errorTitle}</p>
          {result.reason && <p className="mt-1 text-[12px] text-[#a4002a]">{result.reason}</p>}
        </div>
      )}

      {!loading && result?.status === "live" && scores && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ScoreDial score={scores.performance} label={copy.scorePerformance} />
            <ScoreDial score={scores.accessibility} label={copy.scoreAccessibility} />
            <ScoreDial score={scores.bestPractices} label={copy.scoreBestPractices} />
            <ScoreDial score={scores.seo} label={copy.scoreSeo} />
          </div>

          {cwv && (
            <div className="mt-5 border-t border-app-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[13px] font-semibold text-app-text">{copy.cwvTitle}</h4>
                <span className="rounded-[4px] bg-[#eaf1fd] px-1.5 py-0.5 text-[11px] font-medium text-[#235FE2]">
                  {cwv.source === "field"
                    ? copy.sourceField
                    : cwv.source === "lab"
                      ? copy.sourceLab
                      : copy.sourceNone}
                </span>
              </div>
              {cwv.originLevel && (
                <p className="mt-1 text-[12px] text-app-text-secondary">{copy.originNote}</p>
              )}
              {cwvRows.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  {cwvRows.map((row) => (
                    <div key={row.label}>
                      <dt className="text-[11px] leading-[15px] text-app-text-secondary">
                        {row.label}
                      </dt>
                      <dd className="mt-0.5 text-[16px] font-semibold text-app-text">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[12px] text-app-text-secondary">{copy.sourceNone}</p>
              )}
            </div>
          )}

          <p className="mt-4 text-[11px] text-app-text-secondary" suppressHydrationWarning>
            {copy.sourceLabel}
            {result.fetchedAt
              ? ` · ${copy.fetchedAt(dateFormatter.format(new Date(result.fetchedAt)))}`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
