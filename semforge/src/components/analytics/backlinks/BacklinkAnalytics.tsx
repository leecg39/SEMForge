"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import type {
  BacklinkDataset,
  BacklinkReport,
  BacklinkScope,
} from "@/server/backlinks/contracts";
import { inferBacklinkScope } from "@/server/backlinks/target";
import { BacklinkListPanel } from "@/components/analytics/backlinks/BacklinkListPanel";
import { BacklinkOverviewPanel } from "@/components/analytics/backlinks/BacklinkOverviewPanel";

type BacklinkTab = "overview" | BacklinkDataset;

const TAB_VALUES: BacklinkTab[] = ["overview", "links", "ref_domains", "anchors", "pages"];

const COPY = {
  ko: {
    title: "백링크 분석",
    subtitle: "모든 도메인과 URL의 실제 백링크 프로필을 Semrush 데이터로 분석하세요.",
    input: "분석할 도메인 또는 URL",
    placeholder: "example.com 또는 https://example.com/page",
    analyze: "분석",
    analyzing: "분석 중…",
    root: "루트 도메인",
    subdomain: "서브도메인",
    page: "정확한 URL",
    noCache: "저장된 분석 결과가 없습니다",
    noCacheBody: "분석을 시작하면 Semrush API에서 실제 데이터를 수집하고 24시간 동안 재사용합니다.",
    start: "분석 시작",
    refresh: "데이터 새로고침",
    refreshing: "갱신 중…",
    updated: "업데이트",
    cached: "24시간 캐시",
    overview: "개요",
    links: "백링크",
    ref_domains: "추천 도메인",
    anchors: "앵커",
    pages: "인덱싱 페이지",
    authority: "Authority Score",
    backlinks: "전체 백링크",
    domains: "추천 도메인",
    referringPages: "추천 페이지",
    newLinks: "최근 30일 신규",
    lostLinks: "누락 백링크",
  },
  en: {
    title: "Backlink Analytics",
    subtitle: "Analyze the live backlink profile of any domain or URL with Semrush data.",
    input: "Domain or URL to analyze",
    placeholder: "example.com or https://example.com/page",
    analyze: "Analyze",
    analyzing: "Analyzing…",
    root: "Root domain",
    subdomain: "Subdomain",
    page: "Exact URL",
    noCache: "No saved analysis",
    noCacheBody: "Start an analysis to collect live data from Semrush and reuse it for 24 hours.",
    start: "Start analysis",
    refresh: "Refresh data",
    refreshing: "Refreshing…",
    updated: "Updated",
    cached: "24-hour cache",
    overview: "Overview",
    links: "Backlinks",
    ref_domains: "Referring domains",
    anchors: "Anchors",
    pages: "Indexed pages",
    authority: "Authority Score",
    backlinks: "Backlinks",
    domains: "Referring domains",
    referringPages: "Referring pages",
    newLinks: "New in 30 days",
    lostLinks: "Lost backlinks",
  },
} as const;

function value(number: number | null, locale: "ko" | "en"): string {
  return number === null
    ? "—"
    : new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(number);
}

function formatTimestamp(timestamp: string, locale: "ko" | "en"): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function TargetForm({
  target,
  scope,
  busy,
  locale,
  submitLabel,
  onTarget,
  onScope,
  onSubmit,
  compact = false,
}: {
  target: string;
  scope: BacklinkScope;
  busy: boolean;
  locale: "ko" | "en";
  submitLabel?: string;
  onTarget: (value: string) => void;
  onScope: (value: BacklinkScope) => void;
  onSubmit: () => void;
  compact?: boolean;
}) {
  const copy = COPY[locale];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} className={compact ? "flex flex-1 flex-wrap items-end gap-2" : "space-y-3"}>
      <label className={compact ? "min-w-[240px] flex-1" : "block"}>
        <span className="mb-1.5 block text-[12px] font-medium text-app-text-secondary">{copy.input}</span>
        <input
          value={target}
          onChange={(event) => {
            const next = event.target.value;
            onTarget(next);
            if (scope === "root_domain" && inferBacklinkScope(next) === "page") onScope("page");
          }}
          placeholder={copy.placeholder}
          className="h-11 w-full rounded-[8px] border border-app-border bg-white px-3.5 text-[13px] outline-none transition focus:border-app-blue focus:ring-2 focus:ring-app-blue/15"
          aria-label={copy.input}
        />
      </label>
      <label className={compact ? "block" : "block"}>
        <span className="mb-1.5 block text-[12px] font-medium text-app-text-secondary">{locale === "ko" ? "분석 범위" : "Scope"}</span>
        <select value={scope} onChange={(event) => onScope(event.target.value as BacklinkScope)} className="h-11 rounded-[8px] border border-app-border bg-white px-3 text-[13px] outline-none focus:border-app-blue">
          <option value="root_domain">{copy.root}</option>
          <option value="subdomain">{copy.subdomain}</option>
          <option value="page">{copy.page}</option>
        </select>
      </label>
      <button type="submit" disabled={busy || !target.trim()} className="h-11 rounded-[8px] bg-[#171a26] px-5 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45">
        {busy ? copy.analyzing : submitLabel ?? copy.analyze}
      </button>
    </form>
  );
}

function Landing({
  target,
  scope,
  busy,
  error,
  cacheMiss,
  locale,
  onTarget,
  onScope,
  onAnalyze,
}: {
  target: string;
  scope: BacklinkScope;
  busy: boolean;
  error: string | null;
  cacheMiss: boolean;
  locale: "ko" | "en";
  onTarget: (value: string) => void;
  onScope: (value: BacklinkScope) => void;
  onAnalyze: () => void;
}) {
  const copy = COPY[locale];
  const ko = locale === "ko";
  const cards = [
    { icon: "↗", title: ko ? "신규·누락 백링크" : "New and lost links", body: ko ? "최근 획득하거나 사라진 링크를 확인해 변화에 대응합니다." : "See recently acquired and lost backlinks." },
    { icon: "◎", title: ko ? "링크 품질 분석" : "Link quality", body: ko ? "Authority Score와 follow 속성으로 가치 있는 링크를 구분합니다." : "Separate valuable links by Authority Score and attributes." },
    { icon: "≋", title: ko ? "앵커·페이지 분석" : "Anchors and pages", body: ko ? "어떤 문구와 페이지가 링크를 모으는지 파악합니다." : "Learn which anchors and pages attract links." },
  ];
  return (
    <div className="mx-auto w-full max-w-[1080px] p-4 sm:p-6">
      <section className="overflow-hidden rounded-[14px] border border-app-border bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_80%_20%,#ece4ff_0,transparent_32%),radial-gradient(circle_at_15%_10%,#dff5ff_0,transparent_30%)] px-5 py-12 sm:px-12 sm:py-16">
          <div className="mx-auto max-w-[760px] text-center">
            <span className="inline-flex rounded-full bg-[#eaf3ff] px-3 py-1 text-[11px] font-semibold text-[#235fe2]">Semrush v4 · Live data</span>
            <h1 className="mt-4 text-[30px] font-bold leading-[38px] tracking-[-0.6px] text-app-text sm:text-[36px] sm:leading-[44px]">{copy.title}</h1>
            <p className="mx-auto mt-3 max-w-[640px] text-[14px] leading-6 text-app-text-secondary">{copy.subtitle}</p>
          </div>
          <div className="mx-auto mt-7 max-w-[760px] rounded-[12px] border border-app-border bg-white p-4 shadow-[0_8px_28px_rgba(25,32,54,0.09)] sm:p-5">
            {cacheMiss && <div className="mb-4 rounded-[8px] bg-[#f5f7fb] p-3 text-left"><p className="text-[13px] font-semibold text-app-text">{copy.noCache}</p><p className="mt-1 text-[12px] leading-5 text-app-text-secondary">{copy.noCacheBody}</p></div>}
            <TargetForm target={target} scope={scope} busy={busy} locale={locale} submitLabel={cacheMiss ? copy.start : undefined} onTarget={onTarget} onScope={onScope} onSubmit={onAnalyze} />
            {error && <p className="mt-3 rounded-[7px] bg-[#fff2f2] px-3 py-2 text-left text-[12px] text-[#a12828]">{error}</p>}
          </div>
        </div>
      </section>
      <section className="mt-4 grid gap-4 md:grid-cols-3">
        {cards.map((card) => <article key={card.title} className="rounded-[12px] border border-app-border bg-white p-5"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#f0ecff] text-[18px] text-[#6c43b5]">{card.icon}</span><h2 className="mt-4 text-[15px] font-semibold text-app-text">{card.title}</h2><p className="mt-1.5 text-[12px] leading-5 text-app-text-secondary">{card.body}</p></article>)}
      </section>
      <p className="mt-4 text-center text-[11px] leading-5 text-app-text-secondary">{ko ? "가짜 수치를 사용하지 않습니다. API가 연결되지 않았거나 데이터가 없으면 그 상태를 그대로 표시합니다." : "No synthetic metrics. Missing provider access or data is shown as-is."}</p>
    </div>
  );
}

export function BacklinkAnalytics({
  initialTarget,
  initialScope,
  initialTab,
  initialPage,
  initialSort,
  initialDirection,
}: {
  initialTarget: string;
  initialScope: BacklinkScope;
  initialTab: BacklinkTab;
  initialPage: number;
  initialSort?: string;
  initialDirection: "asc" | "desc";
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState(initialTarget);
  const [scope, setScope] = useState<BacklinkScope>(initialScope);
  const [report, setReport] = useState<BacklinkReport | null>(null);
  const [tab, setTab] = useState<BacklinkTab>(initialTab);
  const [loading, setLoading] = useState(Boolean(initialTarget));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheMiss, setCacheMiss] = useState(false);

  const replaceQuery = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    if (!initialTarget) return;
    let active = true;
    api.get<BacklinkReport>(`/api/analytics/backlinks/report/?target=${encodeURIComponent(initialTarget)}&scope=${initialScope}`)
      .then(({ data }) => { if (active) setReport(data); })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ClientApiError && reason.code === "NOT_FOUND" && (reason.details as { cacheMiss?: boolean } | undefined)?.cacheMiss) {
          setCacheMiss(true);
          setError(null);
        } else {
          setError(reason instanceof Error ? reason.message : (locale === "ko" ? "분석 결과를 불러오지 못했습니다." : "Could not load the report."));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialScope, initialTarget, locale]);

  const analyze = async (mode: "if-stale" | "force") => {
    const isRefresh = mode === "force";
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<BacklinkReport>("/api/analytics/backlinks/report/", { target, scope, mode });
      setReport(data);
      setCacheMiss(false);
      replaceQuery({ target: data.target, scope: data.scope, tab: "overview", page: null, sort: null, direction: null });
      setTarget(data.target);
      setScope(data.scope);
      setTab("overview");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (locale === "ko" ? "백링크 분석에 실패했습니다." : "Backlink analysis failed."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (!report) {
    if (loading && !cacheMiss) return <div className="flex min-h-[520px] items-center justify-center p-6 text-[13px] text-app-text-secondary">{copy.analyzing}</div>;
    return <Landing target={target} scope={scope} busy={loading} error={error} cacheMiss={cacheMiss} locale={locale} onTarget={setTarget} onScope={setScope} onAnalyze={() => void analyze("if-stale")} />;
  }

  const metrics = [
    [copy.authority, report.overview.authorityScore],
    [copy.backlinks, report.overview.backlinks],
    [copy.domains, report.overview.referringDomains],
    [copy.referringPages, report.overview.referringPages],
    [copy.newLinks, report.overview.newBacklinks],
    [copy.lostLinks, report.overview.lostBacklinks],
  ] as const;
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-[1440px]">
        <header className="rounded-[10px] border border-app-border bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h1 className="text-[22px] font-bold tracking-[-0.3px] text-app-text">{copy.title}</h1><p className="mt-1 text-[12px] text-app-text-secondary">{report.effectiveTarget}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-semibold text-[#235fe2]">Semrush v4</span><span className="rounded-full bg-[#f1f3f5] px-2.5 py-1 text-[11px] text-app-text-secondary">{copy.updated} {formatTimestamp(report.provenance.fetchedAt, locale)}</span>{report.provenance.cached && <span className="rounded-full bg-[#f1f3f5] px-2.5 py-1 text-[11px] text-app-text-secondary">{copy.cached}</span>}<button type="button" disabled={refreshing} onClick={() => void analyze("force")} className="h-8 rounded-[7px] border border-app-border bg-white px-3 text-[11px] font-medium disabled:opacity-50">{refreshing ? copy.refreshing : copy.refresh}</button></div>
          </div>
          <div className="mt-4 border-t border-[#eef0f2] pt-4"><TargetForm target={target} scope={scope} busy={loading} locale={locale} onTarget={setTarget} onScope={setScope} onSubmit={() => void analyze("if-stale")} compact /></div>
          {error && <p className="mt-3 rounded-[7px] bg-[#fff2f2] px-3 py-2 text-[12px] text-[#a12828]">{error}</p>}
          {report.provenance.warning && <p className="mt-3 rounded-[7px] border border-[#f0d59b] bg-[#fff9eb] px-3 py-2 text-[12px] text-[#73551b]">{report.provenance.warning}</p>}
        </header>

        <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map(([label, metricValue]) => <article key={label} className="rounded-[9px] border border-app-border bg-white p-4"><p className="text-[11px] leading-4 text-app-text-secondary">{label}</p><p className="mt-1.5 text-[23px] font-semibold leading-8 text-app-text">{value(metricValue, locale)}</p></article>)}
        </section>

        <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-app-border" aria-label={locale === "ko" ? "백링크 보고서" : "Backlink reports"}>
          {TAB_VALUES.map((value) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => { setTab(value); replaceQuery({ tab: value, page: null, sort: null, direction: null }); }} className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-[12px] font-medium ${tab === value ? "border-app-blue text-app-text" : "border-transparent text-app-text-secondary hover:text-app-text"}`}>{copy[value]}</button>)}
        </nav>

        <main className="mt-4">
          {tab === "overview" ? <BacklinkOverviewPanel report={report} locale={locale} /> : <BacklinkListPanel key={`${report.target}|${report.scope}|${tab}`} target={report.target} scope={report.scope} dataset={tab} locale={locale} initialPage={initialPage} initialSort={initialSort} initialDirection={initialDirection} onQueryState={(state) => replaceQuery({ page: state.page > 1 ? String(state.page) : null, sort: state.sort, direction: state.direction })} />}
        </main>
      </div>
    </div>
  );
}
