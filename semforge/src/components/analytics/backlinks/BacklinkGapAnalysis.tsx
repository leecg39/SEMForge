"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircledIcon, Cross2Icon, ExternalLinkIcon, GlobeIcon, Link2Icon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { BacklinkGapCsvImport } from "@/components/analytics/backlinks/BacklinkGapCsvImport";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";
import type { BacklinkGapBootstrap, BacklinkGapResult } from "@/server/backlinks/gap";

function dateTime(value: string, locale: "ko" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function BacklinkGapAnalysis({ initialOwnSiteUrl, initialCompetitors }: {
  initialOwnSiteUrl: string;
  initialCompetitors: string[];
}) {
  const { locale } = useLocale(); const ko = locale === "ko";
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<BacklinkGapBootstrap | null>(null);
  const [ownSiteUrl, setOwnSiteUrl] = useState(initialOwnSiteUrl);
  const [competitors, setCompetitors] = useState<string[]>(initialCompetitors.length ? initialCompetitors : [""]);
  const [result, setResult] = useState<BacklinkGapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async () => {
    const { data } = await api.get<BacklinkGapBootstrap>("/api/analytics/backlinks/gap/");
    setBootstrap(data);
    setOwnSiteUrl((current) => current || data.folders[0]?.domain || data.cachedDatasets[0]?.siteUrl || "");
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      loadBootstrap().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "데이터 소스 상태를 확인하지 못했습니다."); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [loadBootstrap]);

  const readyCompetitors = useMemo(() => competitors.map((value) => value.trim()).filter(Boolean), [competitors]);
  const analyze = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ownSiteUrl.trim() || readyCompetitors.length === 0) return;
    setBusy(true); setError(null);
    try {
      const { data } = await api.post<BacklinkGapResult>("/api/analytics/backlinks/gap/", {
        ownSiteUrl,
        competitorSiteUrls: readyCompetitors,
        collect: Boolean(bootstrap?.sources.commonCrawl.enabled),
      });
      setResult(data);
      const query = new URLSearchParams({ own: data.ownSiteUrl, competitors: data.competitorSiteUrls.join(",") });
      router.replace(`/analytics/gap/backlinks/?${query}`, { scroll: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "백링크 갭 분석에 실패했습니다.");
    } finally { setBusy(false); }
  };

  const updateCompetitor = (index: number, value: string) => setCompetitors((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  const removeCompetitor = (index: number) => setCompetitors((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const connectedCount = bootstrap?.cachedDatasets.length ?? 0;

  return (
    <div className="min-w-0 p-4 sm:p-6">
      <div className="mx-auto max-w-[1440px]">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold tracking-[-0.3px] text-app-text">{ko ? "백링크 갭" : "Backlink Gap"}</h1><span className="rounded-full bg-[#eaf8f0] px-2.5 py-1 text-[10px] font-semibold text-[#176b4b]">{ko ? "실제 데이터" : "Real data"}</span></div><p className="mt-1.5 max-w-[720px] text-[12px] leading-5 text-app-text-secondary">{ko ? "경쟁사에는 링크하지만 내 사이트에는 링크하지 않는 추천 도메인을 실제 URL 단위 데이터로 찾습니다." : "Find referring domains that link to competitors but not to your site using URL-level datasets."}</p></div>
          <Link href="/analytics/backlinks/overview/" className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-app-border bg-white px-3 text-[11px] font-semibold text-app-text shadow-sm"><Link2Icon />{ko ? "백링크 분석 열기" : "Open backlink analytics"}</Link>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <article className="rounded-[11px] border border-app-border bg-white p-4"><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#eef5ff] text-[#235fe2]"><GlobeIcon /></span><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${bootstrap?.sources.commonCrawl.enabled ? "bg-[#eaf8f0] text-[#176b4b]" : "bg-[#fff4df] text-[#8a5a00]"}`}>{bootstrap === null ? (ko ? "확인 중" : "Checking") : bootstrap.sources.commonCrawl.enabled ? (ko ? "연결됨" : "Connected") : (ko ? "설정 필요" : "Setup required")}</span></div><h2 className="mt-3 text-[13px] font-semibold text-app-text">Common Crawl</h2><p className="mt-1 text-[10px] leading-5 text-app-text-secondary">{bootstrap === null ? (ko ? "공급자 상태를 확인하고 있습니다." : "Checking provider status.") : bootstrap.sources.commonCrawl.enabled ? (ko ? "Common Crawl 공개 웹 역색인에 연결되었습니다." : "Connected to the Common Crawl public-web reverse index.") : (ko ? bootstrap.sources.commonCrawl.reason : "Configure a Common Crawl reverse-index gateway to collect competitor links automatically.")}</p></article>
          <article className="rounded-[11px] border border-app-border bg-white p-4"><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#f0efff] text-[#6557e8]"><Link2Icon /></span><span className="rounded-full bg-[#eaf8f0] px-2 py-1 text-[9px] font-semibold text-[#176b4b]">{ko ? "사용 가능" : "Available"}</span></div><h2 className="mt-3 text-[13px] font-semibold text-app-text">CSV URL dataset</h2><p className="mt-1 text-[10px] leading-5 text-app-text-secondary">{ko ? (bootstrap?.sources.csv.reason ?? "수동 데이터 소스를 준비하고 있습니다.") : "Use URL-level exports from Bing Webmaster or another backlink tool."}</p></article>
          <article className="rounded-[11px] border border-app-border bg-white p-4"><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#eaf8f0] text-[#176b4b]"><CheckCircledIcon /></span><span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-[9px] font-semibold text-app-text-secondary">{connectedCount.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</span></div><h2 className="mt-3 text-[13px] font-semibold text-app-text">{ko ? "저장된 데이터셋" : "Saved datasets"}</h2><p className="mt-1 text-[10px] leading-5 text-app-text-secondary">{ko ? "현재 워크스페이스에 격리되어 비교에 사용할 수 있는 도메인 데이터입니다." : "Domain datasets isolated to the current workspace and ready for comparison."}</p></article>
        </section>

        <form onSubmit={(event) => void analyze(event)} className="mt-4 rounded-[12px] border border-app-border bg-white p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(420px,1.4fr)_auto] lg:items-end">
            <label><span className="mb-1.5 block text-[11px] font-semibold text-app-text">{ko ? "내 도메인" : "Your domain"}</span><input list="backlink-gap-domains" value={ownSiteUrl} onChange={(event) => setOwnSiteUrl(event.target.value)} placeholder="example.com" className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 text-[12px] outline-none focus:border-app-blue" /></label>
            <div><div className="mb-1.5 flex items-center justify-between"><span className="text-[11px] font-semibold text-app-text">{ko ? "경쟁 도메인" : "Competitor domains"}</span>{competitors.length < 4 && <button type="button" onClick={() => setCompetitors((current) => [...current, ""])} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6557e8]"><PlusIcon />{ko ? "추가" : "Add"}</button>}</div><div className="grid gap-2 sm:grid-cols-2">{competitors.map((competitor, index) => <div key={index} className="relative"><input list="backlink-gap-domains" value={competitor} onChange={(event) => updateCompetitor(index, event.target.value)} placeholder={`competitor${index + 1}.com`} className="h-11 w-full rounded-[7px] border border-app-border bg-white px-3 pr-9 text-[12px] outline-none focus:border-app-blue" />{competitors.length > 1 && <button type="button" aria-label={ko ? "경쟁 도메인 삭제" : "Remove competitor"} onClick={() => removeCompetitor(index)} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-app-text-secondary hover:bg-[#f2f4f7]"><Cross2Icon /></button>}</div>)}</div></div>
            <button type="submit" disabled={busy || !ownSiteUrl.trim() || readyCompetitors.length === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-[7px] bg-[#171a26] px-5 text-[12px] font-semibold text-white disabled:opacity-40">{busy && <ReloadIcon className="animate-spin" />}{busy ? (ko ? "데이터 수집·비교 중…" : "Collecting and comparing…") : (ko ? "백링크 갭 찾기" : "Find backlink gaps")}</button>
          </div>
          <datalist id="backlink-gap-domains">{bootstrap?.folders.map((folder) => <option key={folder.id} value={folder.domain}>{folder.name}</option>)}{bootstrap?.cachedDatasets.map((dataset) => <option key={`${dataset.provider}-${dataset.siteUrl}`} value={dataset.siteUrl}>{dataset.provider} · {dataset.rowCount}</option>)}</datalist>
          <p className="mt-3 text-[10px] leading-5 text-app-text-secondary">{bootstrap?.sources.commonCrawl.enabled ? (ko ? "Common Crawl 역색인에서 최대 500개 검증 링크를 수집하고 30일 캐시를 재사용합니다." : "Collects up to 500 verified links from the Common Crawl reverse index and reuses a 30-day cache.") : (ko ? "자동 수집 설정이 없으므로 저장된 CSV/캐시만 비교합니다. 아래에서 각 도메인의 CSV를 연결할 수 있습니다." : "No automatic collector is configured, so only saved CSV/cache data is compared. Connect a CSV for each domain below.")}</p>
          {error && <p role="alert" className="mt-3 rounded-[7px] bg-[#fff1f1] px-3 py-2 text-[11px] text-[#a12828]">{error}</p>}
        </form>

        {result && <>
          {result.warning && <p className="mt-4 rounded-[8px] border border-[#efd59b] bg-[#fff9eb] px-3 py-2.5 text-[11px] leading-5 text-[#73551b]">{result.warning}</p>}
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">{[
            [ko ? "내 추천 도메인" : "Your referring domains", result.summary.ownReferringDomains],
            [ko ? "경쟁사 추천 도메인" : "Competitor referring domains", result.summary.competitorReferringDomains],
            [ko ? "링크 기회" : "Link opportunities", result.summary.opportunities],
            [ko ? "2개사 이상 공통" : "Shared by 2+", result.summary.sharedByMultipleCompetitors],
            [ko ? "비교 데이터셋" : "Compared datasets", result.summary.comparedDatasets],
          ].map(([label, value]) => <article key={label} className="rounded-[9px] border border-app-border bg-white p-4"><p className="text-[10px] font-medium text-app-text-secondary">{label}</p><p className="mt-1.5 text-[24px] font-semibold text-app-text">{Number(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</p></article>)}</section>

          <section className="mt-4 rounded-[11px] border border-app-border bg-white p-4"><h2 className="text-[13px] font-semibold text-app-text">{ko ? "비교 데이터 상태" : "Dataset status"}</h2><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{result.datasets.map((dataset) => <article key={`${dataset.role}-${dataset.siteUrl}`} className="rounded-[8px] bg-[#f7f8fa] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold text-app-text">{dataset.domain}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${dataset.status === "ready" ? "bg-[#eaf8f0] text-[#176b4b]" : dataset.status === "failed" ? "bg-[#fff0f0] text-[#a12828]" : "bg-[#fff4df] text-[#8a5a00]"}`}>{dataset.status === "ready" ? (ko ? "준비됨" : "Ready") : dataset.status === "failed" ? (ko ? "수집 실패" : "Failed") : (ko ? "데이터 없음" : "Missing")}</span></div><p className="mt-1 text-[10px] text-app-text-secondary">{dataset.provider ?? "—"} · {dataset.rowCount.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")} {ko ? "링크" : "links"}</p>{dataset.fetchedAt && <p className="mt-1 text-[9px] text-app-text-secondary">{dateTime(dataset.fetchedAt, locale)}</p>}{dataset.message && <p className="mt-1.5 text-[9px] leading-4 text-[#8a5a00]">{dataset.message}</p>}</article>)}</div></section>

          <section className="mt-4 overflow-hidden rounded-[11px] border border-app-border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3"><div><h2 className="text-[13px] font-semibold text-app-text">{ko ? "경쟁사에만 링크하는 도메인" : "Domains linking only to competitors"}</h2><p className="mt-0.5 text-[10px] text-app-text-secondary">{ko ? "경쟁사 공통 수와 확인된 링크 수 순으로 정렬했습니다." : "Sorted by competitor overlap and verified link count."}</p></div><span className="text-[10px] text-app-text-secondary">{result.rows.length.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")} {ko ? "개 표시" : "shown"}</span></div>
            {result.state === "needs_data" ? <div className="px-5 py-14 text-center"><GlobeIcon className="mx-auto h-7 w-7 text-app-text-secondary" /><p className="mt-3 text-[13px] font-semibold text-app-text">{ko ? "비교할 링크 데이터가 더 필요합니다" : "More link data is required"}</p><p className="mx-auto mt-1 max-w-[560px] text-[11px] leading-5 text-app-text-secondary">{ko ? "내 도메인과 경쟁 도메인 중 하나 이상에 URL 단위 데이터가 있어야 합니다. 아래 CSV 연결을 사용하거나 Common Crawl 역색인 서비스를 설정하세요." : "Your domain and at least one competitor need URL-level data. Use the CSV connector below or configure a Common Crawl reverse-index service."}</p></div> : result.rows.length === 0 ? <div className="px-5 py-14 text-center"><CheckCircledIcon className="mx-auto h-7 w-7 text-[#176b4b]" /><p className="mt-3 text-[13px] font-semibold text-app-text">{ko ? "현재 데이터에서 고유한 링크 기회가 없습니다" : "No unique opportunities in the current data"}</p><p className="mt-1 text-[11px] text-app-text-secondary">{ko ? "실제 0건 결과이며 공급자 오류와는 구분됩니다." : "This is a real zero result, distinct from a provider error."}</p></div> : <div className="overflow-x-auto"><table className="min-w-[940px] w-full text-left"><thead className="bg-[#f7f8fa] text-[10px] font-semibold text-app-text-secondary"><tr><th className="px-4 py-2.5">{ko ? "추천 도메인" : "Referring domain"}</th><th className="px-4 py-2.5">{ko ? "링크된 경쟁사" : "Linked competitors"}</th><th className="px-4 py-2.5 text-right">{ko ? "확인 링크" : "Verified links"}</th><th className="px-4 py-2.5">{ko ? "예시 소스" : "Example source"}</th><th className="px-4 py-2.5">{ko ? "대상 페이지" : "Target page"}</th><th className="px-4 py-2.5">{ko ? "앵커" : "Anchor"}</th></tr></thead><tbody className="divide-y divide-app-border">{result.rows.map((row) => <tr key={row.sourceDomain} className="text-[11px] text-app-text"><td className="px-4 py-3 font-semibold">{row.sourceDomain}</td><td className="px-4 py-3"><div className="flex max-w-[260px] flex-wrap gap-1">{row.competitors.map((competitor) => <span key={competitor} className="rounded-full bg-[#f0efff] px-2 py-1 text-[9px] text-[#5547c8]">{competitor}</span>)}</div></td><td className="px-4 py-3 text-right font-semibold">{row.linkCount.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</td><td className="max-w-[260px] px-4 py-3"><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-[#235fe2] hover:underline"><span className="truncate">{row.sourceUrl}</span><ExternalLinkIcon className="shrink-0" /></a></td><td className="max-w-[220px] truncate px-4 py-3 text-app-text-secondary" title={row.targetUrl}>{row.targetUrl}</td><td className="max-w-[180px] truncate px-4 py-3 text-app-text-secondary" title={row.anchor ?? undefined}>{row.anchor ?? "—"}</td></tr>)}</tbody></table></div>}
          </section>
        </>}

        <div className="mt-4"><BacklinkGapCsvImport key={ownSiteUrl} initialSiteUrl={ownSiteUrl} locale={locale} onImported={async (siteUrl) => { await loadBootstrap(); setOwnSiteUrl((current) => current || siteUrl); setError(null); }} /></div>
        <p className="mt-3 text-[10px] leading-5 text-app-text-secondary">{ko ? "출처 안내: Common Crawl은 공개 웹의 일부만 포함합니다. 공식 URL Index는 URL 패턴 조회용이며 역방향 백링크 API가 아니므로, 자동 수집에는 Web Graph/WARC를 미리 역색인한 서버가 필요합니다. 수집되지 않은 지표는 —로 표시하며 추정값을 만들지 않습니다." : "Source note: Common Crawl covers only part of the public web. Its URL Index is not a reverse-backlink API, so automatic collection requires a prebuilt Web Graph/WARC reverse index. Missing metrics are never fabricated."}</p>
      </div>
    </div>
  );
}
