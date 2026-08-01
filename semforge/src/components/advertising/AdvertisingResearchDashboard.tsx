"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/LocaleProvider";
import type { AdvertisingResearchReport } from "@/server/advertising/contracts";

const card = "rounded-[10px] border border-app-border bg-white";

function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function runLabel(status: AdvertisingResearchReport["run"]["status"], ko: boolean): string {
  const labels = ko ? {
    queued: "수집 대기 중",
    running: "광고 SERP 수집 중",
    completed: "수집 완료",
    failed: "수집 실패",
  } : {
    queued: "Queued",
    running: "Collecting advertising SERPs",
    completed: "Collection complete",
    failed: "Collection failed",
  };
  return labels[status];
}

export function AdvertisingResearchDashboard({ mode }: { mode: "search" | "shopping" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [domain, setDomain] = useState(searchParams.get("domain") ?? "");
  const [keywords, setKeywords] = useState("");
  const [report, setReport] = useState<AdvertisingResearchReport | null>(null);
  const [runId, setRunId] = useState(searchParams.get("run") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderId = searchParams.get("fid");
  const isShopping = mode === "shopping";

  const loadReport = useCallback(async (id: string) => {
    const { data } = await api.get<AdvertisingResearchReport>(
      `/api/advertising/research-runs/${id}/`,
    );
    setReport(data);
    return data;
  }, []);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const next = await loadReport(runId);
        if (!cancelled && (next.run.status === "queued" || next.run.status === "running")) {
          timer = setTimeout(poll, 1500);
        }
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadReport, runId]);

  const startResearch = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const parsedKeywords = keywords
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 20);
      const { data } = await api.post<AdvertisingResearchReport["run"]>(
        "/api/advertising/research-runs/",
        {
          domain,
          folderId: folderId || null,
          countryCode: "KR",
          languageCode: "ko",
          device: "desktop",
          keywords: parsedKeywords,
        },
      );
      setRunId(data.id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("run", data.id);
      params.set("domain", data.domain);
      router.replace(`?${params}`);
      await loadReport(data.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(
    () =>
      (report?.rows ?? []).filter((row) =>
        isShopping ? row.resultType === "shopping_ad" : row.resultType === "search_ad",
      ),
    [isShopping, report],
  );
  const competitors = new Set(rows.map((row) => row.domain)).size;
  const running = report?.run.status === "queued" || report?.run.status === "running";

  return (
    <div className="min-h-full bg-[#f5f6f7] p-4 text-app-text md:p-6">
      <div className="mx-auto max-w-[1380px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-app-text-secondary">{ko ? "광고 툴킷 · 리서치" : "Advertising Toolkit · Research"}</p>
            <h1 className="mt-1 text-[24px] font-semibold">
              {isShopping ? (ko ? "PLA 리서치" : "PLA Research") : (ko ? "광고 리서치" : "Advertising Research")}
            </h1>
            <p className="mt-1 text-[13px] text-app-text-secondary">
              {isShopping
                ? (ko ? "실제 Google 쇼핑 결과에서 상품 광고와 판매자를 확인합니다." : "Review product ads and sellers from real Google Shopping results.")
                : (ko ? "실제 검색 결과에서 경쟁사의 광고 문구와 랜딩 URL을 확인합니다." : "Review competitor ad copy and landing URLs from real search results.")}
            </p>
          </div>
          <Link
            href={`/advertising/ads-launch-assistant${folderId ? `?fid=${encodeURIComponent(folderId)}` : ""}`}
            className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-[#151a18] px-4 text-[13px] font-semibold text-white"
          >
            {ko ? "캠페인 초안 만들기" : "Create campaign draft"} <ArrowRightIcon />
          </Link>
        </div>

        <form onSubmit={startResearch} className={cn(card, "mt-5 p-4")}>
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,.8fr)_minmax(360px,1.5fr)_auto]">
            <label className="block text-[12px] font-medium">
              {ko ? "분석 도메인" : "Domain to analyze"}
              <div className="relative mt-1.5">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-secondary" />
                <input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com"
                  required
                  className="h-10 w-full rounded-[7px] border border-app-border bg-white pl-9 pr-3 text-[13px] outline-none focus:border-app-blue"
                />
              </div>
            </label>
            <label className="block text-[12px] font-medium">
              {ko ? "키워드 (쉼표 또는 줄바꿈, 최대 20개)" : "Keywords (comma or line break, up to 20)"}
              <input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder={ko ? "비워 두면 웹사이트 문맥에서 시작 키워드를 제안합니다." : "Leave blank to suggest starting keywords from website context."}
                className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] outline-none focus:border-app-blue"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-[7px] bg-app-blue px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ReloadIcon className={loading ? "animate-spin" : ""} />
              {loading ? (ko ? "준비 중" : "Preparing") : (ko ? "실제 데이터 수집" : "Collect real data")}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-[6px] bg-[#fff0f2] px-3 py-2 text-[12px] text-[#b42345]">
              {error} {error.includes("로그인") && <Link className="font-semibold underline" href="/login/">{ko ? "로그인" : "Sign in"}</Link>}
            </p>
          )}
        </form>

        {report ? (
          <>
            <div className={cn(card, "mt-4 flex flex-wrap items-center gap-3 px-4 py-3")}>
              <span className={cn("h-2.5 w-2.5 rounded-full", running ? "animate-pulse bg-[#e49a10]" : report.run.status === "failed" ? "bg-app-red" : "bg-app-green")} />
              <strong className="text-[13px]">{runLabel(report.run.status, ko)}</strong>
              <span className="text-[12px] text-app-text-secondary">
                {report.run.processedCount}/{report.run.totalCount} {ko ? "키워드 · 출처" : "keywords · Source"} {report.run.source}
              </span>
              {report.run.currentKeyword && <span className="rounded-full bg-app-bg px-2 py-1 text-[11px]">{report.run.currentKeyword}</span>}
              {isShopping && (
                <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[10px] font-semibold", report.coverage.plaAvailability === "available" ? "bg-[#e9f7ef] text-[#08765c]" : report.coverage.plaAvailability === "unavailable" ? "bg-[#fff0f2] text-[#b42345]" : "bg-[#fff8e1] text-[#725400]")}>
                  {report.coverage.plaAvailability === "checking" && (ko ? "PLA 가용성 확인 중" : "Checking PLA availability")}
                  {report.coverage.plaAvailability === "available" && (ko ? "PLA 응답 사용 가능" : "PLA response available")}
                  {report.coverage.plaAvailability === "no_results" && (ko ? "PLA 지원 · 광고 0건" : "PLA supported · 0 ads")}
                  {report.coverage.plaAvailability === "unavailable" && (ko ? "공급자 PLA 블록 미제공" : "Provider did not return a PLA block")}
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [isShopping ? (ko ? "쇼핑 광고" : "Shopping ads") : (ko ? "검색 광고" : "Search ads"), rows.length.toLocaleString()],
                [ko ? "경쟁 도메인" : "Competing domains", competitors.toLocaleString()],
                [ko ? "광고 0건 키워드" : "Keywords with 0 ads", report.coverage.zeroResultKeywords.toLocaleString()],
                [ko ? "수집 실패" : "Collection failures", report.coverage.failedKeywords.toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className={cn(card, "p-4")}>
                  <p className="text-[11px] text-app-text-secondary">{label}</p>
                  <p className="mt-1 text-[24px] font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <section className={cn(card, "mt-4 overflow-hidden")}>
              <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
                <div>
                  <h2 className="text-[14px] font-semibold">{ko ? "관측된 광고" : "Observed ads"}</h2>
                  <p className="mt-0.5 text-[11px] text-app-text-secondary">{ko ? "수집되지 않은 검색량·CPC는 — 로 표시합니다." : "Unavailable volume and CPC values are shown as —."}</p>
                </div>
                <span className="rounded-full bg-[#e9f7ef] px-2.5 py-1 text-[10px] font-semibold text-[#08765c]">{ko ? "실데이터" : "Real data"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-[12px]">
                  <thead className="bg-[#f8f9fa] text-app-text-secondary">
                    <tr>
                      {[
                        ko ? "키워드" : "Keyword",
                        ko ? "위치" : "Position",
                        ko ? "광고주/도메인" : "Advertiser/domain",
                        isShopping ? (ko ? "상품·가격" : "Product/price") : (ko ? "광고 문구" : "Ad copy"),
                        ko ? "랜딩 URL" : "Landing URL",
                        ko ? "검색량" : "Volume",
                        "CPC",
                      ].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">{heading}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.keyword}-${row.resultType}-${row.url}-${index}`} className="border-t border-[#eef0f2] align-top hover:bg-[#fbfbfc]">
                        <td className="px-4 py-3 font-medium">{row.keyword}</td>
                        <td className="px-4 py-3">
                          {row.position}
                          {row.previousPosition !== null && row.previousPosition !== row.position && (
                            <span className={cn("ml-1 text-[10px]", row.position < row.previousPosition ? "text-app-green" : "text-app-red")}>
                              {row.position < row.previousPosition ? "↑" : "↓"}{Math.abs(row.previousPosition - row.position)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3"><strong className="block">{row.advertiser ?? row.domain}</strong><span className="text-[10px] text-app-text-secondary">{row.domain}</span></td>
                        <td className="max-w-[320px] px-4 py-3"><strong className="block">{row.title || (ko ? "제목 미제공" : "Title unavailable")}</strong><span className="mt-1 block line-clamp-2 text-[11px] text-app-text-secondary">{isShopping ? row.price ?? (ko ? "가격 미제공" : "Price unavailable") : row.description ?? (ko ? "설명 미제공" : "Description unavailable")}</span></td>
                        <td className="max-w-[240px] px-4 py-3"><a href={row.url} target="_blank" rel="noreferrer" className="block truncate text-app-blue hover:underline">{row.url}</a></td>
                        <td className="px-4 py-3">{row.volume?.toLocaleString() ?? "—"}</td>
                        <td className="px-4 py-3">{row.cpcCents === null ? "—" : `${(row.cpcCents / 100).toFixed(2)}`}</td>
                      </tr>
                    ))}
                    {!running && rows.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-14 text-center text-[13px] text-app-text-secondary">{report.run.status === "failed" ? report.run.errorMessage : isShopping ? report.coverage.plaAvailability === "unavailable" ? (ko ? "공급자 응답에 쇼핑 광고 블록이 없어 현재 PLA 데이터를 제공할 수 없습니다." : "The provider returned no shopping block, so PLA data is unavailable.") : (ko ? "쇼핑 광고 블록은 지원되지만 이 수집에서는 광고가 0건이었습니다." : "Shopping is supported, but this collection returned 0 ads.") : (ko ? "이 수집에서 검색 광고가 관측되지 않았습니다." : "No search ads were observed in this collection.")}</td></tr>
                    )}
                    {running && rows.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-14 text-center text-[13px] text-app-text-secondary">{ko ? "광고 결과를 수집하고 있습니다…" : "Collecting advertising results…"}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <div className={cn(card, "mt-4 px-6 py-20 text-center")}>
            <MagnifyingGlassIcon className="mx-auto h-8 w-8 text-app-text-secondary" />
            <h2 className="mt-4 text-[17px] font-semibold">{ko ? "광고 리서치를 시작하세요" : "Start advertising research"}</h2>
            <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-5 text-app-text-secondary">{ko ? "데모 수치를 표시하지 않습니다. 도메인과 키워드를 입력하면 실제 SERP 공급자 결과만 이 화면에 나타납니다." : "No demo metrics are shown. Enter a domain and keywords to display only real SERP provider results."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
