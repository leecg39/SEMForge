"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircledIcon, GlobeIcon, Link2Icon, LockClosedIcon, ReloadIcon } from "@radix-ui/react-icons";
import { BacklinkListPanel } from "@/components/analytics/backlinks/BacklinkListPanel";
import { BacklinkOverviewPanel } from "@/components/analytics/backlinks/BacklinkOverviewPanel";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import type { BacklinkCollectionProvider, BacklinkDataset, BacklinkProvider, BacklinkReport, BacklinkScope, BingConnectionStatus, BingSite, CommonCrawlConnectionStatus } from "@/server/backlinks/contracts";

type Tab = "overview" | BacklinkDataset;

function metric(value: number | null, locale: "ko" | "en"): string {
  return value === null ? "—" : new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function timestamp(value: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function providerLabel(provider: BacklinkProvider | undefined, ko: boolean): string {
  if (provider === "common-crawl") return "Common Crawl";
  if (provider === "bing-csv") return ko ? "이전 Bing CSV" : "Legacy Bing CSV";
  return "Bing Webmaster API";
}

export function BacklinkAnalytics({ initialSiteUrl, initialTargetUrl, initialScope, initialProvider,
  initialTab, initialTargetPage, initialPage, initialSort, initialDirection }: {
  initialSiteUrl: string; initialTargetUrl: string; initialScope: BacklinkScope; initialProvider?: BacklinkProvider;
  initialTab: Tab; initialTargetPage: string; initialPage: number; initialSort?: string; initialDirection: "asc" | "desc";
}) {
  const { locale } = useLocale(); const ko = locale === "ko";
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const [status, setStatus] = useState<BingConnectionStatus | null>(null);
  const [commonCrawlStatus, setCommonCrawlStatus] = useState<CommonCrawlConnectionStatus | null>(null);
  const [sites, setSites] = useState<BingSite[]>([]);
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl);
  const [targetUrl, setTargetUrl] = useState(initialTargetUrl);
  const [scope, setScope] = useState(initialScope);
  const [provider, setProvider] = useState<BacklinkProvider | undefined>(initialProvider);
  const [report, setReport] = useState<BacklinkReport | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [targetPage, setTargetPage] = useState(initialTargetPage);
  const [busy, setBusy] = useState(Boolean(initialSiteUrl)); const [error, setError] = useState<string | null>(null); const [cacheMiss, setCacheMiss] = useState(false);
  const updateQuery = (values: Record<string, string | null>) => { const params = new URLSearchParams(searchParams.toString()); for (const [key, value] of Object.entries(values)) { if (value) params.set(key, value); else params.delete(key); } router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }); };

  useEffect(() => {
    let active = true;
    api.get<CommonCrawlConnectionStatus>("/api/common-crawl/status/")
      .then(({ data }) => { if (active) setCommonCrawlStatus(data); })
      .catch(() => { if (active) setCommonCrawlStatus({ configured: false, reason: ko ? "Common Crawl 상태를 확인하지 못했습니다." : "Could not check Common Crawl status." }); });
    api.get<BingConnectionStatus>("/api/bing-webmaster/status/").then(({ data }) => {
      if (!active) return; setStatus(data);
      if (data.connected) api.get<{ sites: BingSite[]; selectedSiteUrl: string | null }>("/api/bing-webmaster/sites/").then(({ data: value }) => { if (!active) return; setSites(value.sites); if (!initialSiteUrl) setSiteUrl(value.selectedSiteUrl ?? value.sites[0]?.siteUrl ?? ""); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "사이트 목록을 불러오지 못했습니다."); });
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "연결 상태를 확인하지 못했습니다."); });
    return () => { active = false; };
  }, [initialSiteUrl, ko]);

  useEffect(() => {
    if (!initialSiteUrl) return;
    let active = true;
    const params = new URLSearchParams({ siteUrl: initialSiteUrl, scope: initialScope });
    if (initialTargetUrl) params.set("targetUrl", initialTargetUrl); if (initialProvider) params.set("provider", initialProvider);
    api.get<BacklinkReport>(`/api/analytics/backlinks/report/?${params}`).then(({ data }) => { if (active) { setReport(data); setProvider(data.provenance.provider); } }).catch((reason) => {
      if (!active) return; if (reason instanceof ClientApiError && reason.code === "NOT_FOUND") { setCacheMiss(true); setError(null); } else setError(reason instanceof Error ? reason.message : "분석 결과를 불러오지 못했습니다.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [initialProvider, initialScope, initialSiteUrl, initialTargetUrl]);

  const analyze = async (mode: "if-stale" | "force", collectionProvider: BacklinkCollectionProvider = "auto") => {
    setBusy(true); setError(null);
    try { const { data } = await api.post<BacklinkReport>("/api/analytics/backlinks/report/", { siteUrl, targetUrl: scope === "page" ? targetUrl : null, scope, mode, provider: collectionProvider, limit: 100 }); setReport(data); setProvider(data.provenance.provider); setCacheMiss(false); setTab("overview"); updateQuery({ siteUrl: data.siteUrl, targetUrl: data.targetUrl, scope: data.scope, provider: data.provenance.provider, tab: "overview", page: null, target: null }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "백링크 분석에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const selectPage = (url: string) => { setTargetPage(url); setTab("inbound_links"); updateQuery({ tab: "inbound_links", targetPage: url, page: null, sort: null, direction: null }); };

  if (!report) return (
    <div className="mx-auto w-full max-w-[1120px] p-4 sm:p-6">
      <section className="overflow-hidden rounded-[14px] border border-app-border bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_82%_16%,#e8e3ff_0,transparent_31%),radial-gradient(circle_at_13%_10%,#dff5ff_0,transparent_28%)] px-5 py-10 sm:px-12 sm:py-14">
          <div className="mx-auto max-w-[760px] text-center"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-[#6557e8]"><Link2Icon />Bing · Common Crawl · Ahrefs DR</span><h1 className="mt-4 text-[30px] font-bold tracking-[-0.6px] text-app-text sm:text-[36px]">{ko ? "파일 없이 자동 백링크 분석" : "Automatic backlink analytics"}</h1><p className="mx-auto mt-3 max-w-[680px] text-[13px] leading-6 text-app-text-secondary">{ko ? "Bing 데이터를 우선 조회하고 결과가 비어 있으면 Common Crawl 공개 웹 인덱스로 자동 보완합니다. 확인되지 않은 링크나 수치는 만들지 않습니다." : "Use Bing first, then automatically fall back to the Common Crawl public web index when Bing returns no links. Unverified links are never fabricated."}</p></div>
          <div className="mx-auto mt-7 max-w-[800px] rounded-[12px] border border-app-border bg-white p-5 shadow-[0_8px_28px_rgba(25,32,54,0.09)]">
            <div className="grid gap-2 sm:grid-cols-3">{[{ n: 1, icon: <LockClosedIcon />, text: ko ? "Bing 우선 조회" : "Check Bing first" }, { n: 2, icon: <GlobeIcon />, text: ko ? "Common Crawl 보완" : "Common Crawl fallback" }, { n: 3, icon: <CheckCircledIcon />, text: ko ? "원문 링크 검증" : "Verify source links" }].map((step) => <div key={step.n} className="flex items-center gap-2 rounded-[8px] bg-[#f7f8fa] px-3 py-2.5 text-[11px] font-medium text-app-text"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#6557e8]">{step.icon}</span>{step.text}</div>)}</div>
            <form onSubmit={(event: FormEvent) => { event.preventDefault(); void analyze("if-stale", "auto"); }} className="mt-4 space-y-3">
              <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-app-text-secondary">{status?.connected ? (ko ? "Bing 인증 사이트" : "Verified Bing site") : (ko ? "분석 사이트 URL" : "Site URL")}</span>{status?.connected ? <select value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px]">{sites.map((site) => <option key={site.siteUrl}>{site.siteUrl}</option>)}</select> : <input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://www.example.com/" className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px] outline-none focus:border-app-blue" />}</label>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]"><label><span className="mb-1.5 block text-[11px] font-medium text-app-text-secondary">{ko ? "분석 범위" : "Scope"}</span><select value={scope} onChange={(event) => setScope(event.target.value as BacklinkScope)} className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px]"><option value="site">{ko ? "전체 사이트" : "Entire site"}</option><option value="page">{ko ? "정확한 페이지" : "Exact page"}</option></select></label>{scope === "page" ? <label><span className="mb-1.5 block text-[11px] font-medium text-app-text-secondary">{ko ? "대상 페이지 URL" : "Target page URL"}</span><input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} className="h-11 w-full rounded-[7px] border border-app-border px-3 text-[12px]" /></label> : <div className="rounded-[7px] border border-[#e2dff8] bg-[#f8f7ff] px-3 py-2"><p className="text-[10px] font-medium text-app-text">{commonCrawlStatus?.reason ?? (ko ? "공개 웹 인덱스 상태 확인 중…" : "Checking public index…")}</p><p className="mt-1 text-[9px] text-app-text-secondary">{ko ? "공개 크롤 범위 밖의 링크는 포함되지 않을 수 있습니다." : "Links outside the public crawl may be missing."}</p></div>}</div>
              <div className="grid gap-2 sm:grid-cols-2"><button disabled={busy || !siteUrl || (!status?.connected && !commonCrawlStatus?.configured)} className="h-11 rounded-[7px] bg-[#171a26] text-[12px] font-semibold text-white disabled:opacity-40">{busy ? (ko ? "실제 데이터 수집 중…" : "Collecting real data…") : cacheMiss ? (ko ? "자동 분석 시작" : "Start automatic analysis") : (ko ? "자동 백링크 분석" : "Analyze automatically")}</button><button type="button" disabled={busy || !siteUrl || !commonCrawlStatus?.configured} onClick={() => void analyze("if-stale", "common-crawl")} className="h-11 rounded-[7px] border border-[#6557e8] bg-white text-[12px] font-semibold text-[#5547c8] disabled:opacity-40">{ko ? "Common Crawl로 직접 분석" : "Use Common Crawl directly"}</button></div>
            </form>
            {!status?.connected && status?.configured && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#e2dff8] bg-[#f8f7ff] p-3"><div><p className="text-[11px] font-semibold text-app-text">{ko ? "Bing 연결은 선택 사항입니다" : "Bing connection is optional"}</p><p className="mt-1 text-[9px] text-app-text-secondary">{ko ? "연결하면 인증 사이트의 Bing 데이터를 먼저 조회합니다." : "Connect to check verified-site Bing data first."}</p></div><Link href="/api/bing-webmaster/auth/start/?returnTo=/analytics/backlinks/overview/" className="inline-flex h-9 items-center rounded-[7px] bg-white px-3 text-[10px] font-semibold text-app-text shadow-sm">{ko ? "Bing 연결" : "Connect Bing"}</Link></div>}
            {error && <p className="mt-3 rounded-[7px] bg-[#fff1f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}
          </div>
        </div>
      </section>
    </div>
  );

  const metrics = [{ label: "Domain Rating", value: report.overview.domainRating, tone: "violet" }, { label: ko ? "인바운드 링크" : "Inbound links", value: report.overview.totalInboundLinks, tone: "blue" }, { label: ko ? "링크된 페이지" : "Linked pages", value: report.overview.linkedPages, tone: "green" }, { label: ko ? "신규 링크" : "New links", value: report.overview.newLinks, tone: "green" }, { label: ko ? "누락 링크" : "Lost links", value: report.overview.lostLinks, tone: "red" }];
  return (
    <div className="p-4 sm:p-6"><div className="mx-auto max-w-[1440px]">
      <header><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold tracking-[-0.3px] text-app-text">{ko ? "백링크 분석" : "Backlink analytics"}</h1><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${provider === "common-crawl" ? "bg-[#e9f7ef] text-[#15704e]" : provider === "bing-csv" ? "bg-[#fff3dc] text-[#8a5a00]" : "bg-[#eaf3ff] text-[#235fe2]"}`}>{providerLabel(provider, ko)}</span>{report.provenance.fallbackFromBing && <span className="rounded-full bg-[#f0efff] px-2 py-1 text-[9px] font-semibold text-[#5547c8]">{ko ? "Bing 빈 결과 자동 보완" : "Bing fallback"}</span>}</div><p className="mt-1 text-[12px] text-app-text-secondary">{report.targetUrl ?? report.siteUrl}{report.provenance.commonCrawlRelease ? ` · ${report.provenance.commonCrawlRelease}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-app-text-secondary">{timestamp(report.provenance.fetchedAt, locale)}</span>{report.provenance.cached && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-app-text-secondary">{provider === "common-crawl" ? "30d cache" : "24h cache"}</span>}{provider !== "bing-csv" && <button type="button" disabled={busy} onClick={() => void analyze("force", provider === "common-crawl" ? "common-crawl" : "bing-webmaster")} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[#171a26] px-3 text-[11px] font-semibold text-white disabled:opacity-40"><ReloadIcon />{ko ? "새로고침" : "Refresh"}</button>}</div></div>
        {report.provenance.warning && <p className="mt-3 rounded-[7px] border border-[#efd59b] bg-[#fff9eb] px-3 py-2 text-[11px] text-[#73551b]">{report.provenance.warning}</p>}
      </header>
      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">{metrics.map((item) => <article key={item.label} className="rounded-[9px] border border-app-border bg-white p-4"><p className="text-[10px] font-medium text-app-text-secondary">{item.label}</p><p className="mt-1.5 text-[24px] font-semibold text-app-text">{metric(item.value, locale)}</p>{item.label === "Domain Rating" && report.provenance.domainRatingAttribution && <a href={report.provenance.domainRatingLicenseUrl ?? "https://ahrefs.com/legal/domain-rating-license"} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[9px] text-[#285fca]">{report.provenance.domainRatingAttribution}</a>}</article>)}</section>
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-app-border">{(["overview", "target_pages", "inbound_links"] as Tab[]).map((value) => <button key={value} type="button" onClick={() => { setTab(value); updateQuery({ tab: value, page: null }); }} className={`-mb-px border-b-2 px-4 py-3 text-[12px] font-medium ${tab === value ? "border-[#6557e8] text-app-text" : "border-transparent text-app-text-secondary"}`}>{value === "overview" ? (ko ? "개요" : "Overview") : value === "target_pages" ? (ko ? "링크된 페이지" : "Linked pages") : (ko ? "인바운드 링크" : "Inbound links")}</button>)}</nav>
      <main className="mt-4">{tab === "overview" ? <BacklinkOverviewPanel report={report} locale={locale} onSelectPage={selectPage} /> : <BacklinkListPanel siteUrl={report.siteUrl} targetUrl={report.targetUrl} scope={report.scope} provider={report.provenance.provider} dataset={tab} targetPage={targetPage} locale={locale} initialPage={initialPage} initialSort={initialSort} initialDirection={initialDirection} onSelectPage={selectPage} onQueryState={(state) => updateQuery({ page: state.page > 1 ? String(state.page) : null, sort: state.sort, direction: state.direction, search: state.search || null })} />}</main>
    </div></div>
  );
}
