"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import type { AnalyticsDevice, DomainAnalyticsReport } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";
import { AdvertisingSection } from "./domain-overview/AdvertisingSection";
import { BacklinksSection } from "./domain-overview/BacklinksSection";
import { COMPARE_DOMAINS_HREF, COPY, OVERVIEW_HREF } from "./domain-overview/copy";
import { DataSourcesPanel } from "./domain-overview/DataSourcesPanel";
import { KpiPanels } from "./domain-overview/KpiPanels";
import { OrganicResearchSection } from "./domain-overview/OrganicResearchSection";
import { LoadingCards } from "./domain-overview/primitives";
import { pushRecentDomain } from "./domain-overview/recent";
import { ReportHeader } from "./domain-overview/ReportHeader";
import { TopKeywordsPanel } from "./domain-overview/TopKeywordsPanel";
import { TrendsSection } from "./domain-overview/TrendsSection";

type TabKey = "overview" | "keywords" | "sources";
type LoadStatus = "loading" | "ready" | "error";

interface ApiSuccess<T> {
  data: T;
}

interface ApiFailure {
  error?: { code?: string; message?: string };
}

async function fetchDomainReport(
  domain: string,
  device: AnalyticsDevice,
  signal: AbortSignal,
  country: string,
): Promise<DomainAnalyticsReport> {
  const params = new URLSearchParams({ domain, country, device });
  const response = await fetch(`/api/analytics/domain-overview/?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as ApiSuccess<DomainAnalyticsReport> & ApiFailure;
  if (!response.ok || !body.data) {
    const failure = new Error(body.error?.message || `HTTP ${response.status}`) as Error & {
      code?: string;
    };
    failure.code = body.error?.code;
    throw failure;
  }
  return body.data;
}

/** 수집 API 봉투의 키워드별 결과. */
interface DomainSeedOutcome {
  keyword: string;
  position: number | null;
  url: string | null;
  error?: string;
}

interface DomainSeedCollectResponse {
  domain: string;
  collected: number;
  failed: number;
  ranked: number;
  outcomes: DomainSeedOutcome[];
  capturedAt: string;
}

/** 서버 suggestDomainKeywords 와 동일한 규칙의 클라이언트 미리보기 후보. */
function suggestKeywordsClient(domain: string): string[] {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return [];
  let hostname = trimmed;
  try {
    hostname = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return [];
  }
  hostname = hostname.replace(/^www\./, "").replace(/\.$/, "");
  const sld = hostname.split(".")[0] ?? "";
  const tokens = sld.split(/[-_]/).filter(Boolean);
  const suggestions = new Set<string>();
  if (sld) suggestions.add(sld);
  if (tokens.length > 1) {
    suggestions.add(tokens.join(" "));
    suggestions.add(tokens.join(""));
  }
  return [...suggestions].slice(0, 5);
}

export function DomainIntelligenceDashboard({
  initialReport,
  initialDomain,
  initialCountry,
}: {
  initialReport: DomainAnalyticsReport | null;
  initialDomain: string;
  initialCountry?: string;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const router = useRouter();
  const [domain] = useState(initialDomain);
  const [device, setDevice] = useState<AnalyticsDevice>("desktop");
  const [country, setCountry] = useState(initialCountry ?? "US");
  const [report, setReport] = useState<DomainAnalyticsReport | null>(initialReport);
  const [status, setStatus] = useState<LoadStatus>(initialReport ? "ready" : "error");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [collectInput, setCollectInput] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectSummary, setCollectSummary] = useState<DomainSeedCollectResponse | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const runQuery = useCallback(async (
    nextDomain: string,
    nextDevice: AnalyticsDevice,
    nextCountry: string
  ): Promise<"ready" | "not_found" | "error"> => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setError(null);
    setNotFound(false);
    try {
      const nextReport = await fetchDomainReport(nextDomain, nextDevice, controller.signal, nextCountry);
      if (requestId !== requestIdRef.current) return "error";
      setReport(nextReport);
      setStatus("ready");
      return "ready";
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return "error";
      setError(caught instanceof Error ? caught.message : copy.loadError);
      setNotFound((caught as { code?: string })?.code === "NOT_FOUND");
      setStatus("error");
      return (caught as { code?: string })?.code === "NOT_FOUND" ? "not_found" : "error";
    }
  }, [copy.loadError]);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  /** "N일 전" 식 상대 날짜 — 30일 이상이면 절대 날짜. */
  const relativeDate = useCallback(
    (iso: string | null): string => {
      if (!iso) return "—";
      const timestamp = new Date(iso).getTime();
      if (!Number.isFinite(timestamp)) return "—";
      const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
      if (days <= 0) return copy.today;
      if (days === 1) return copy.dayAgo;
      if (days < 30) return `${days}${locale === "ko" ? "" : " "}${copy.daysAgo}`;
      return dateFormatter.format(new Date(timestamp));
    },
    [copy, dateFormatter, locale],
  );

  /** 실시간 수집: 로컬 데이터가 없는 실제 도메인의 브랜드/지정 키워드 SERP 를 수집한 뒤 리포트를 다시 계산한다. */
  const runCollect = async (auto = false) => {
    setCollecting(true);
    setCollectError(null);
    if (!auto) setCollectSummary(null);
    try {
      const keywords = collectInput
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      const response = await fetch("/api/analytics/domain-overview/collect/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          domain,
          keywords: keywords.length > 0 ? keywords : undefined,
          countryCode: country,
          device,
        }),
      });
      const body = (await response.json()) as ApiSuccess<DomainSeedCollectResponse> & ApiFailure;
      if (!response.ok || !body.data) {
        const failure = new Error(body.error?.message || `HTTP ${response.status}`) as Error & {
          code?: string;
        };
        failure.code = body.error?.code;
        throw failure;
      }
      setCollectSummary(body.data);
      if (body.data.collected > 0) {
        await runQuery(domain, device, country);
      }
    } catch (caught) {
      setCollectError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setCollecting(false);
    }
  };

  /**
   * 서버에서 초기 리포트를 만들지 못한 경우(미보유 도메인):
   * 실제 오류 사유를 API에서 가져오고, NOT_FOUND 면 실시간 수집까지 자동 실행해
   * 수집 데이터로 리포트를 만든다.
   */
  const autoCollectRef = useRef(false);
  useEffect(() => {
    if (initialReport || autoCollectRef.current) return;
    autoCollectRef.current = true;
    void (async () => {
      const outcome = await runQuery(domain, device, country);
      if (outcome === "not_found") await runCollect(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 리포트가 만들어진 도메인만 랜딩의 "마지막 확인" 목록에 남긴다. */
  useEffect(() => {
    if (status === "ready" && report) {
      pushRecentDomain({ domain: report.query.domain, country: report.query.countryCode });
    }
  }, [status, report]);

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${report.query.domain}-domain-overview.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  /** 국가(데이터베이스)·기기 전환 — 같은 도메인으로 리포트를 다시 계산한다. */
  const handleScopeChange = (nextCountry: string, nextDevice: AnalyticsDevice) => {
    if (nextCountry === country && nextDevice === device) return;
    setCountry(nextCountry);
    setDevice(nextDevice);
    void runQuery(domain, nextDevice, nextCountry);
  };

  /** 다른 도메인 분석 — 국가는 서버가 도메인 TLD 기준으로 다시 고르도록 넘기지 않는다. */
  const handleAnalyze = (nextDomain: string) => {
    router.push(`${OVERVIEW_HREF}?domain=${encodeURIComponent(nextDomain)}`);
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <ReportHeader
        domain={domain}
        country={country}
        device={device}
        provenanceLive={report?.provenance === "live"}
        updatedLabel={report?.freshness.serpCapturedAt ? relativeDate(report.freshness.serpCapturedAt) : null}
        busy={status === "loading" || collecting}
        exportDisabled={!report}
        onScopeChange={handleScopeChange}
        onAnalyze={handleAnalyze}
        onExport={exportReport}
      />

      <div className="min-h-[24px]" aria-live="polite">
        {error && !notFound && (
          <div role="alert" className="mt-4 rounded-[8px] border border-[#ffc8d4] bg-[#fff4f6] px-4 py-3 text-[13px] text-[#a80028]">
            <div className="flex items-start justify-between gap-3">
              <span>{copy.loadError} {error}</span>
              <button type="button" onClick={() => void runQuery(domain, device, country)} className="shrink-0 font-semibold underline underline-offset-2">{copy.analyze}</button>
            </div>
          </div>
        )}
        {notFound && (
          <div role="status" className="mt-4 rounded-[8px] border border-app-border bg-a2-card px-4 py-3 text-[13px] text-a2-text shadow-[var(--a2-card-shadow)]">
            <div className="flex items-start justify-between gap-3">
              <span>{error}</span>
              <button type="button" onClick={() => void runQuery(domain, device, country)} className="shrink-0 font-semibold text-app-blue underline underline-offset-2">{copy.analyze}</button>
            </div>

            {/* 실시간 수집 패널 — 원천 스토어에 없는 실제 도메인은 TalorData 로 브랜드 SERP 를 수집해 리포트를 만든다 */}
            <div className="mt-3 border-t border-app-border pt-3">
              <p className="text-[12px] font-semibold text-a2-text">{copy.liveCollectTitle}</p>
              <p className="mt-1 text-[12px] leading-[18px] text-a2-text-muted">{copy.liveCollectDescription}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={collectInput}
                  onChange={(event) => setCollectInput(event.target.value)}
                  placeholder={suggestKeywordsClient(domain).join(", ") || copy.liveCollectPlaceholder}
                  aria-label={copy.liveCollectKeywordsLabel}
                  className="h-9 min-w-[220px] flex-1 rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-a2-text outline-none focus:border-app-blue"
                />
                <button
                  type="button"
                  onClick={() => void runCollect()}
                  disabled={collecting}
                  className="h-9 shrink-0 rounded-[7px] bg-app-blue px-4 text-[12px] font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-60"
                >
                  {collecting ? copy.liveCollecting : copy.liveCollectAction}
                </button>
              </div>
              {collectError && <p className="mt-2 text-[12px] font-medium text-[#a80028]">{collectError}</p>}
              {collectSummary && (
                <ul className="mt-2 flex flex-col gap-1 text-[12px]">
                  {collectSummary.outcomes.map((outcome) => (
                    <li key={outcome.keyword} className="flex items-center gap-2">
                      <span className="font-medium text-a2-text">{outcome.keyword}</span>
                      {outcome.error ? (
                        <span className="text-[#a80028]">— {outcome.error}</span>
                      ) : outcome.position !== null ? (
                        <span className="font-semibold text-[#0a6b57]">
                          {copy.liveCollectRanked} #{outcome.position}
                        </span>
                      ) : (
                        <span className="text-a2-text-muted">{copy.liveCollectNotFound}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {!report && status === "loading" ? (
        <LoadingCards copy={copy} />
      ) : report ? (
        <div className={cn("transition-opacity", status === "loading" && "pointer-events-none opacity-60")}>
          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-app-border" role="tablist" aria-label={copy.title}>
            {([
              ["overview", copy.overview],
              ["keywords", copy.topKeywords],
              ["sources", copy.dataSources],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                id={`domain-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`domain-panel-${key}`}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-[13px] font-medium transition-colors",
                  activeTab === key
                    ? "border-app-blue text-a2-text"
                    : "border-transparent text-a2-text-muted hover:text-a2-text",
                )}
              >
                {label}
              </button>
            ))}
            <Link
              href={COMPARE_DOMAINS_HREF}
              className="-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-4 text-[13px] font-medium text-a2-text-muted transition-colors hover:text-a2-text"
            >
              {copy.compareDomains} →
            </Link>
          </div>

          {activeTab === "overview" && (
            <section id="domain-panel-overview" role="tabpanel" aria-labelledby="domain-tab-overview" className="pt-4">
              <KpiPanels report={report} />
              <TrendsSection report={report} />
              <OrganicResearchSection report={report} />
              <AdvertisingSection />
              <BacklinksSection report={report} />
            </section>
          )}

          {activeTab === "keywords" && (
            <section id="domain-panel-keywords" role="tabpanel" aria-labelledby="domain-tab-keywords" className="pt-4">
              <TopKeywordsPanel report={report} />
            </section>
          )}

          {activeTab === "sources" && (
            <section id="domain-panel-sources" role="tabpanel" aria-labelledby="domain-tab-sources" className="pt-4">
              <DataSourcesPanel report={report} />
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
