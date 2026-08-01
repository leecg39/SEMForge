"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ReloadIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import {
  buildMarketPlayers,
  buildPageMovers,
  normalizeGscTarget,
  previousDateRange,
  resolveAccessibleCampaign,
  resolveAccessibleGscProperty,
  summarizeGscRows,
  type MarketPlayer,
  type PageMover,
  type TrafficGscRow,
  type TrafficTotals,
} from "@/lib/traffic-market";
import type { DiscoveredCompetitors } from "@/server/position-tracking/insights";
import type { KeywordHighlights, PagesBreakdown } from "@/server/position-tracking/highlights";
import type { CampaignListItem, CampaignOverview } from "@/server/position-tracking/overview";

export type TrafficMarketView = "overview" | "traffic" | "market" | "pages";

interface ProviderEnvelope<T> {
  status: "live" | "unavailable" | "error";
  data?: T;
  reason?: string;
  source?: string;
}

interface GscStatusData {
  connected?: boolean;
  siteUrl?: string | null;
}

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

interface GscDataset {
  trend: TrafficGscRow[];
  queries: TrafficGscRow[];
  pages: PageMover[];
  countries: TrafficGscRow[];
  devices: TrafficGscRow[];
  totals: TrafficTotals;
  previousTotals: TrafficTotals;
}

interface MarketDataset {
  overview: CampaignOverview;
  discovered: DiscoveredCompetitors;
  highlights: KeywordHighlights;
  pages: PagesBreakdown;
}

const CARD = "rounded-[10px] border border-app-border bg-white shadow-[0_1px_2px_rgba(23,27,25,0.04)]";
const SOURCE_BADGE = "inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] font-semibold";

function fmt(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const end = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
  return { start: dateInput(start), end: dateInput(end) };
}

async function fetchProvider<T>(url: string, signal?: AbortSignal): Promise<ProviderEnvelope<T>> {
  const response = await fetch(url, { cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (!response.ok) return { status: "error", reason: `요청 실패 (HTTP ${response.status})` };
  return response.json() as Promise<ProviderEnvelope<T>>;
}

async function fetchAppData<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal, headers: { Accept: "application/json" } });
  const body = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok || !body.data) throw new Error(body.error?.message || `요청 실패 (HTTP ${response.status})`);
  return body.data;
}

function delta(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

function Delta({
  value,
  invert = false,
  suffix = "%",
}: {
  value: number | null;
  invert?: boolean;
  suffix?: string;
}) {
  if (value === null || !Number.isFinite(value)) return <span className="text-app-text-secondary">비교 데이터 없음</span>;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={cn("font-semibold", value === 0 ? "text-app-text-secondary" : good ? "text-[#087a5b]" : "text-[#b4233f]") }>
      {value > 0 ? "+" : ""}{value.toFixed(1)}{suffix}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  change,
  invertChange = false,
  changeSuffix = "%",
}: {
  label: string;
  value: string;
  note: string;
  change?: number | null;
  invertChange?: boolean;
  changeSuffix?: string;
}) {
  return (
    <article className={cn(CARD, "min-w-0 p-4")}>
      <p className="text-[11px] font-medium text-app-text-secondary">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-app-text">{value}</p>
      <div className="mt-2 flex min-h-4 items-center gap-2 text-[10px] text-app-text-secondary">
        {change !== undefined && <Delta value={change} invert={invertChange} suffix={changeSuffix} />}
        <span>{note}</span>
      </div>
    </article>
  );
}

function EmptyPanel({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className={cn(CARD, "px-6 py-14 text-center")}>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-[620px] text-[12px] leading-5 text-app-text-secondary">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function TrafficOverviewDashboard({
  initialSiteUrl = "",
  initialView = "overview",
  initialCampaignId = "",
  campaigns = [],
}: {
  initialSiteUrl?: string;
  initialView?: TrafficMarketView;
  initialCampaignId?: string;
  campaigns?: CampaignListItem[];
}) {
  const router = useRouter();
  const initialCampaign = resolveAccessibleCampaign({
    requested: initialCampaignId,
    campaigns,
  });
  const [gscStatus, setGscStatus] = useState<GscStatusData | null>(null);
  const [properties, setProperties] = useState<GscSite[]>([]);
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl);
  const [siteInput, setSiteInput] = useState(initialSiteUrl);
  const [range, setRange] = useState(defaultRange);
  const [gsc, setGsc] = useState<GscDataset | null>(null);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscReason, setGscReason] = useState<string | null>(null);
  const [gscNotice, setGscNotice] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaign.value);
  const [campaignNotice, setCampaignNotice] = useState<string | null>(
    initialCampaign.requestedUnavailable
      ? "요청한 검색 시장 프로젝트는 현재 워크스페이스에서 사용할 수 없어 접근 가능한 프로젝트로 전환했습니다."
      : null,
  );
  const [market, setMarket] = useState<MarketDataset | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketReason, setMarketReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchProvider<GscStatusData>("/api/gsc/status/"),
      fetchProvider<{ sites: GscSite[] }>("/api/gsc/sites/"),
    ]).then(([statusResult, sitesResult]) => {
      if (cancelled) return;
      const statusData = statusResult.data ?? { connected: false, siteUrl: null };
      const siteRows = sitesResult.status === "live" ? sitesResult.data?.sites ?? [] : [];
      const resolvedSite = resolveAccessibleGscProperty({
        requested: initialSiteUrl,
        properties: siteRows.map((item) => item.siteUrl),
        connected: statusData.siteUrl,
      });
      setGscStatus(statusData);
      setProperties(siteRows);
      if (resolvedSite.value) {
        setSiteUrl(resolvedSite.value);
        setSiteInput(resolvedSite.value);
      }
      setGscNotice(
        resolvedSite.requestedUnavailable
          ? `요청한 Search Console 속성(${initialSiteUrl})에 접근 권한이 없어 연결된 속성(${resolvedSite.value})으로 전환했습니다.`
          : null,
      );
      if (statusResult.status !== "live") setGscReason(statusResult.reason ?? "Search Console 연결 상태를 확인할 수 없습니다.");
    }).catch((error) => {
      if (!cancelled) setGscReason(error instanceof Error ? error.message : "Search Console 연결 상태를 확인할 수 없습니다.");
    });
    return () => { cancelled = true; };
  }, [initialSiteUrl]);

  const loadGsc = useCallback(async (
    target: string,
    currentRange: { start: string; end: string },
    signal: AbortSignal,
  ) => {
    if (!target) return;
    await Promise.resolve();
    if (currentRange.start > currentRange.end) {
      setGsc(null);
      setGscReason("시작일은 종료일보다 늦을 수 없습니다.");
      setGscLoading(false);
      return;
    }
    setGscLoading(true);
    setGscReason(null);
    const previous = previousDateRange(currentRange.start, currentRange.end);
    const query = (dimensions: string, start = currentRange.start, end = currentRange.end, rowLimit = 100) =>
      fetchProvider<{ rows: TrafficGscRow[] }>(
        `/api/gsc/query/?siteUrl=${encodeURIComponent(target)}&startDate=${start}&endDate=${end}&dimensions=${dimensions}&rowLimit=${rowLimit}`,
        signal,
      );
    try {
      const [trend, queries, pages, countries, devices, previousTrend, previousPages] = await Promise.all([
        query("date", currentRange.start, currentRange.end, 120),
        query("query", currentRange.start, currentRange.end, 100),
        query("page", currentRange.start, currentRange.end, 100),
        query("country", currentRange.start, currentRange.end, 100),
        query("device", currentRange.start, currentRange.end, 20),
        query("date", previous.start, previous.end, 120),
        query("page", previous.start, previous.end, 100),
      ]);
      const results = [trend, queries, pages, countries, devices, previousTrend, previousPages];
      const unavailable = results.find((item) => item.status !== "live");
      if (unavailable) {
        setGsc(null);
        setGscReason(unavailable.reason ?? "Search Console 데이터를 가져올 수 없습니다.");
        return;
      }
      const byDate = (rows: TrafficGscRow[]) => [...rows].sort((a, b) => (a.keys[0] ?? "").localeCompare(b.keys[0] ?? ""));
      setGsc({
        trend: byDate(trend.data?.rows ?? []),
        queries: [...(queries.data?.rows ?? [])].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
        pages: buildPageMovers(pages.data?.rows ?? [], previousPages.data?.rows ?? []),
        countries: [...(countries.data?.rows ?? [])].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
        devices: [...(devices.data?.rows ?? [])].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
        totals: summarizeGscRows(trend.data?.rows ?? []),
        previousTotals: summarizeGscRows(previousTrend.data?.rows ?? []),
      });
    } catch (error) {
      if (!signal.aborted) setGscReason(error instanceof Error ? error.message : "Search Console 조회 중 오류가 발생했습니다.");
    } finally {
      if (!signal.aborted) setGscLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!siteUrl || !gscStatus?.connected) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => loadGsc(siteUrl, range, controller.signal));
    return () => controller.abort();
  }, [gscStatus?.connected, loadGsc, range, siteUrl]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      setMarketLoading(true);
      setMarketReason(null);
      try {
        const [overview, discovered, highlights, pages] = await Promise.all([
          fetchAppData<CampaignOverview>(`/api/position-tracking/${selectedCampaignId}/overview/`, controller.signal),
          fetchAppData<DiscoveredCompetitors>(`/api/position-tracking/${selectedCampaignId}/discovered-competitors/`, controller.signal),
          fetchAppData<KeywordHighlights>(`/api/position-tracking/${selectedCampaignId}/highlights/`, controller.signal),
          fetchAppData<PagesBreakdown>(`/api/position-tracking/${selectedCampaignId}/pages/`, controller.signal),
        ]);
        setMarket({ overview, discovered, highlights, pages });
      } catch (error) {
        if (!controller.signal.aborted) setMarketReason(error instanceof Error ? error.message : "시장 데이터를 가져오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setMarketLoading(false);
      }
    });
    return () => controller.abort();
  }, [selectedCampaignId]);

  const propertyValues = useMemo(() => properties.map((item) => item.siteUrl), [properties]);
  const selectedCampaign = campaigns.find((item) => item.id === selectedCampaignId) ?? null;
  const marketPlayers: MarketPlayer[] = market
    ? buildMarketPlayers({
      ownDomain: market.overview.domain,
      ownAppearances: market.overview.avgPosition.rankedCount,
      ownAvgPosition: market.overview.avgPosition.current,
      keywordsWithSerp: market.discovered.keywordsWithSerp,
      competitors: market.discovered.competitors,
    })
    : [];

  const hrefFor = (view: TrafficMarketView) => {
    const path = view === "overview" ? "/analytics/traffic/" : `/analytics/traffic/${view === "traffic" ? "traffic-overview" : view === "market" ? "market-overview" : "top-pages"}/`;
    const params = new URLSearchParams();
    if (siteUrl) params.set("siteUrl", siteUrl);
    if (selectedCampaignId) params.set("campaign", selectedCampaignId);
    return `${path}${params.size ? `?${params}` : ""}`;
  };

  const analyze = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = normalizeGscTarget(siteInput, propertyValues);
    if (!target) return;
    if (propertyValues.length > 0 && !propertyValues.includes(target)) {
      setGscReason("현재 Google 계정에 등록된 Search Console 속성을 선택해 주세요.");
      return;
    }
    setGscReason(null);
    setGscNotice(null);
    setSiteUrl(target);
    router.push(`/analytics/traffic/traffic-overview/?siteUrl=${encodeURIComponent(target)}${selectedCampaignId ? `&campaign=${encodeURIComponent(selectedCampaignId)}` : ""}`);
  };

  return (
    <div className="mx-auto w-full max-w-[1560px] p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7f46c5]">Traffic &amp; Market</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em] text-app-text">트래픽 및 시장 인사이트</h1>
          <p className="mt-1 text-[13px] text-app-text-secondary">자사 검색 유입은 Search Console 실측으로, 검색 시장은 TalorData SERP 관측으로 분석합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={cn(SOURCE_BADGE, gscStatus?.connected ? "border-[#a7dccd] bg-[#effaf6] text-[#087a5b]" : "border-app-border bg-white text-app-text-secondary")}>GSC {gscStatus?.connected ? "연결됨" : "미연결"}</span>
          <span className={cn(SOURCE_BADGE, selectedCampaign?.configured ? "border-[#cbb7ec] bg-[#f7f2ff] text-[#6f3aaa]" : "border-app-border bg-white text-app-text-secondary")}>TalorData {selectedCampaign?.configured ? "수집 데이터" : "프로젝트 필요"}</span>
        </div>
      </header>

      <section className={cn(CARD, "mt-5 p-4")} aria-label="보고서 설정">
        <form onSubmit={analyze} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(220px,0.7fr)_auto]">
          <label className="min-w-0 text-[11px] font-semibold text-app-text-secondary">
            Search Console 속성 또는 도메인
            <input
              list="gsc-properties"
              value={siteInput}
              onChange={(event) => {
                setSiteInput(event.target.value);
                setGscReason(null);
              }}
              placeholder="예: example.com 또는 sc-domain:example.com"
              className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] text-app-text outline-none focus:border-app-blue focus:ring-2 focus:ring-app-blue/10"
            />
            <datalist id="gsc-properties">{properties.map((item) => <option key={item.siteUrl} value={item.siteUrl} />)}</datalist>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-app-text-secondary">
            검색 시장 프로젝트
            <select
              value={selectedCampaignId}
              onChange={(event) => {
                setMarket(null);
                setCampaignNotice(null);
                setSelectedCampaignId(event.target.value);
              }}
              className="mt-1.5 h-10 w-full rounded-[7px] border border-app-border bg-white px-3 text-[13px] outline-none focus:border-app-blue"
            >
              <option value="">프로젝트 선택</option>
              {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!siteInput.trim()} className="mt-auto h-10 rounded-[7px] bg-[#171b18] px-6 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">분석하기</button>
        </form>
      </section>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-app-border" aria-label="트래픽 및 시장 보고서">
        {([
          ["overview", "시작하기"],
          ["traffic", "트래픽 분석"],
          ["market", "시장 개요"],
          ["pages", "상위 페이지"],
        ] as const).map(([key, label]) => (
          <Link key={key} href={hrefFor(key)} aria-current={initialView === key ? "page" : undefined} className={cn("-mb-px min-h-11 shrink-0 border-b-2 px-4 py-3 text-[12px] font-semibold", initialView === key ? "border-[#7f46c5] text-app-text" : "border-transparent text-app-text-secondary hover:text-app-text")}>{label}</Link>
        ))}
      </nav>

      {(gscNotice || campaignNotice) && (
        <div role="status" className="mt-4 rounded-[8px] border border-[#b8d7f2] bg-[#f2f8ff] px-4 py-3 text-[12px] text-[#185ea8]">
          {[gscNotice, campaignNotice].filter(Boolean).join(" ")}
        </div>
      )}

      {(gscReason || marketReason) && (
        <div role="alert" className="mt-4 rounded-[8px] border border-[#f2b8b5] bg-[#fff4f3] px-4 py-3 text-[12px] text-[#a4002a]">
          {[gscReason, marketReason].filter(Boolean).join(" ")}
        </div>
      )}

      {initialView === "overview" && (
        <OverviewContent
          siteUrl={siteUrl}
          campaign={selectedCampaign}
          gscConnected={Boolean(gscStatus?.connected)}
          hrefFor={hrefFor}
        />
      )}

      {initialView === "traffic" && (
        <TrafficContent
          data={gsc}
          loading={gscLoading}
          connected={Boolean(gscStatus?.connected)}
          range={range}
          setRange={setRange}
        />
      )}

      {initialView === "pages" && <PagesContent data={gsc} loading={gscLoading} connected={Boolean(gscStatus?.connected)} />}

      {initialView === "market" && (
        <MarketContent
          data={market}
          players={marketPlayers}
          loading={marketLoading}
          campaign={selectedCampaign}
        />
      )}
    </div>
  );
}

function OverviewContent({ siteUrl, campaign, gscConnected, hrefFor }: {
  siteUrl: string;
  campaign: CampaignListItem | null;
  gscConnected: boolean;
  hrefFor: (view: TrafficMarketView) => string;
}) {
  const cards = [
    { view: "traffic" as const, icon: "↗", title: "트래픽 소스 & 참여", body: "실제 검색 클릭·노출·CTR·평균 순위와 일별 흐름을 확인합니다.", ready: gscConnected && Boolean(siteUrl) },
    { view: "market" as const, icon: "◫", title: "시장 & 경쟁 벤치마킹", body: "수집한 SERP에서 경쟁 도메인의 출현율과 평균 순위를 비교합니다.", ready: Boolean(campaign?.configured) },
    { view: "pages" as const, icon: "▤", title: "상위 페이지", body: "검색 유입 페이지의 클릭 점유율과 직전 기간 대비 상승·하락을 찾습니다.", ready: gscConnected && Boolean(siteUrl) },
    { view: "market" as const, icon: "◎", title: "경쟁자 모니터링", body: "포지션 추적 실행 이력으로 경쟁 구도와 검색 가시성 변화를 이어서 봅니다.", ready: Boolean(campaign?.configured) },
  ];
  return (
    <div className="mt-5">
      <section className="rounded-[12px] bg-[linear-gradient(135deg,#f7f2ff_0%,#ffffff_55%,#eef8ff_100%)] px-5 py-7 sm:px-8">
        <p className="text-[11px] font-semibold text-[#7f46c5]">데이터가 있는 영역부터 바로 시작하세요</p>
        <h2 className="mt-2 max-w-[680px] text-[26px] font-semibold leading-[1.18] tracking-[-0.03em]">실측 트래픽과 검색 시장 신호를 한 워크플로에서 연결합니다.</h2>
        <p className="mt-3 max-w-[720px] text-[13px] leading-5 text-app-text-secondary">SEMrush의 Traffic & Market 정보 구조를 따르되, 클릭스트림 패널 없이 만들 수 없는 전체 방문·이탈률·직접 유입 수치는 표시하지 않습니다.</p>
      </section>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <article key={`${card.title}-${index}`} className={cn(CARD, "flex min-h-[210px] flex-col p-5")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5effc] text-[17px] font-semibold text-[#7f46c5]">{card.icon}</span>
            <h3 className="mt-5 text-[15px] font-semibold">{card.title}</h3>
            <p className="mt-2 flex-1 text-[12px] leading-5 text-app-text-secondary">{card.body}</p>
            <Link href={hrefFor(card.view)} className="mt-5 text-[12px] font-semibold text-app-blue">{card.ready ? "보고서 열기 →" : "연결 상태 확인 →"}</Link>
          </article>
        ))}
      </div>
    </div>
  );
}

function TrafficContent({ data, loading, connected, range, setRange }: {
  data: GscDataset | null;
  loading: boolean;
  connected: boolean;
  range: { start: string; end: string };
  setRange: Dispatch<SetStateAction<{ start: string; end: string }>>;
}) {
  if (!connected) {
    return <div className="mt-5"><EmptyPanel title="Google Search Console 연결이 필요합니다" description="소유 사이트의 검색 클릭과 노출을 실제 값으로 조회하기 위해 읽기 전용 Search Console 연결을 사용합니다." action={<Link href="/api/gsc/auth/start" className="inline-flex h-10 items-center rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white">Google 계정 연결</Link>} /></div>;
  }
  if (loading && !data) return <LoadingPanel label="Search Console 데이터를 불러오는 중…" />;
  if (!data) return <div className="mt-5"><EmptyPanel title="조회할 트래픽 데이터가 없습니다" description="속성과 기간을 확인한 뒤 다시 분석해 주세요." /></div>;
  const { totals, previousTotals } = data;
  return (
    <div className={cn("mt-5 transition-opacity", loading && "pointer-events-none opacity-60")}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-[18px] font-semibold">검색 트래픽 분석</h2><p className="mt-1 text-[11px] text-app-text-secondary">Google Search Console · 선택 기간과 동일한 직전 기간 비교</p></div>
        <div className="flex items-center gap-2">
          <input aria-label="시작일" type="date" max={range.end} value={range.start} onChange={(event) => setRange((value) => ({ ...value, start: event.target.value }))} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[11px]" />
          <span className="text-[11px] text-app-text-secondary">–</span>
          <input aria-label="종료일" type="date" min={range.start} value={range.end} onChange={(event) => setRange((value) => ({ ...value, end: event.target.value }))} className="h-9 rounded-[7px] border border-app-border bg-white px-2 text-[11px]" />
        </div>
      </div>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="검색 클릭" value={fmt(totals.clicks)} change={delta(totals.clicks, previousTotals.clicks)} note="실측" />
        <MetricCard label="검색 노출" value={fmt(totals.impressions)} change={delta(totals.impressions, previousTotals.impressions)} note="실측" />
        <MetricCard label="평균 CTR" value={pct(totals.ctr)} change={delta(totals.ctr, previousTotals.ctr)} note="클릭 ÷ 노출" />
        <MetricCard label="평균 포지션" value={totals.position === null ? "—" : totals.position.toFixed(1)} change={totals.position !== null && previousTotals.position !== null ? ((totals.position - previousTotals.position) / previousTotals.position) * 100 : null} invertChange note="낮을수록 좋음" />
      </section>
      <section className={cn(CARD, "mt-4 p-4")}>
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-[14px] font-semibold">일별 검색 유입 추이</h3><p className="mt-1 text-[10px] text-app-text-secondary">클릭과 노출은 서로 다른 축을 사용합니다.</p></div><span className={cn(SOURCE_BADGE, "border-[#a7dccd] bg-[#effaf6] text-[#087a5b]")}>Google Search Console</span></div>
        {data.trend.length ? (
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}><defs><linearGradient id="trafficClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7f46c5" stopOpacity={0.28}/><stop offset="95%" stopColor="#7f46c5" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="#eceeed" strokeDasharray="3 3" vertical={false}/><XAxis dataKey={(row: TrafficGscRow) => row.keys[0] ?? ""} tick={{ fontSize: 10, fill: "#69716d" }} minTickGap={24}/><YAxis yAxisId="clicks" tick={{ fontSize: 10, fill: "#69716d" }}/><YAxis yAxisId="impressions" orientation="right" tick={{ fontSize: 10, fill: "#69716d" }}/><Tooltip/><Area yAxisId="impressions" type="monotone" dataKey="impressions" stroke="#9aa09d" fill="transparent" name="노출"/><Area yAxisId="clicks" type="monotone" dataKey="clicks" stroke="#7f46c5" fill="url(#trafficClicks)" strokeWidth={2} name="클릭"/></AreaChart></ResponsiveContainer>
          </div>
        ) : <p className="py-16 text-center text-[12px] text-app-text-secondary">선택한 기간에 Search Console 데이터가 없습니다.</p>}
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <DistributionPanel title="국가별 검색 유입" rows={data.countries} />
        <DistributionPanel title="기기별 검색 유입" rows={data.devices} />
      </div>
      <section className={cn(CARD, "mt-4 p-4")}>
        <h3 className="text-[14px] font-semibold">채널 데이터 제공 범위</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ChannelState label="Organic Search" value={fmt(totals.clicks)} live />
          <ChannelState label="Direct / Referral" value="연결 안 됨" />
          <ChannelState label="Paid / Social" value="연결 안 됨" />
          <ChannelState label="AI / Email" value="연결 안 됨" />
        </div>
        <p className="mt-3 text-[10px] leading-4 text-app-text-secondary">Search Console은 자연 검색 클릭만 제공합니다. GA4·광고·이메일 제공자 없이 다른 채널 값을 추정하거나 0으로 채우지 않습니다.</p>
      </section>
    </div>
  );
}

function PagesContent({ data, loading, connected }: { data: GscDataset | null; loading: boolean; connected: boolean }) {
  if (!connected) return <div className="mt-5"><EmptyPanel title="Search Console 연결이 필요합니다" description="상위 페이지는 실제 검색 클릭·노출을 기준으로 집계합니다." /></div>;
  if (loading && !data) return <LoadingPanel label="페이지 성과를 불러오는 중…" />;
  if (!data?.pages.length) return <div className="mt-5"><EmptyPanel title="상위 페이지 데이터가 없습니다" description="선택한 기간에 페이지 단위 검색 클릭 또는 노출이 없습니다." /></div>;
  const pick = (state: PageMover["state"]) => data.pages.filter((row) => row.state === state).slice(0, 3);
  const groups = [
    { state: "growing" as const, label: "상승", color: "text-[#087a5b]", rows: pick("growing") },
    { state: "declining" as const, label: "하락", color: "text-[#b4233f]", rows: pick("declining") },
    { state: "new" as const, label: "새로 감지", color: "text-[#7f46c5]", rows: pick("new") },
  ];
  return (
    <div className={cn("mt-5 transition-opacity", loading && "pointer-events-none opacity-60")}>
      <div><h2 className="text-[18px] font-semibold">상위 검색 유입 페이지</h2><p className="mt-1 text-[11px] text-app-text-secondary">현재 기간과 동일 길이의 직전 기간을 비교합니다.</p></div>
      <section className="mt-4 grid gap-3 lg:grid-cols-3">
        {groups.map((group) => <article key={group.state} className={cn(CARD, "p-4")}><h3 className={cn("text-[12px] font-semibold", group.color)}>{group.label}</h3><div className="mt-3 space-y-3">{group.rows.length ? group.rows.map((row) => <div key={row.page} className="min-w-0"><p className="truncate text-[11px] font-medium" title={row.page}>{row.page}</p><p className="mt-1 text-[10px] text-app-text-secondary">클릭 {fmt(row.clicks)} · 변화 {row.clickDelta === null ? "신규" : `${row.clickDelta > 0 ? "+" : ""}${fmt(row.clickDelta)}`}</p></div>) : <p className="py-4 text-[11px] text-app-text-secondary">해당 페이지가 없습니다.</p>}</div></article>)}
      </section>
      <section className={cn(CARD, "mt-4 overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3"><h3 className="text-[14px] font-semibold">페이지 성과 표</h3><span className={cn(SOURCE_BADGE, "border-[#a7dccd] bg-[#effaf6] text-[#087a5b]")}>GSC 실측</span></div>
        <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-[11px]"><thead className="bg-[#f7f8f8] text-app-text-secondary"><tr><th className="px-4 py-3 font-medium">페이지</th><th className="px-3 py-3 font-medium">클릭</th><th className="px-3 py-3 font-medium">직전 대비</th><th className="px-3 py-3 font-medium">클릭 점유율</th><th className="px-3 py-3 font-medium">노출</th><th className="px-3 py-3 font-medium">CTR</th><th className="px-3 py-3 font-medium">포지션</th></tr></thead><tbody>{data.pages.map((row) => <tr key={row.page} className="border-t border-app-border"><td className="max-w-[360px] truncate px-4 py-3 font-medium" title={row.page}>{row.page}</td><td className="px-3 py-3">{fmt(row.clicks)}</td><td className="px-3 py-3"><span className={cn(row.clickDelta === null ? "text-[#7f46c5]" : row.clickDelta > 0 ? "text-[#087a5b]" : row.clickDelta < 0 ? "text-[#b4233f]" : "text-app-text-secondary")}>{row.clickDelta === null ? "신규" : `${row.clickDelta > 0 ? "+" : ""}${fmt(row.clickDelta)}`}</span></td><td className="px-3 py-3">{row.clickShare.toFixed(1)}%</td><td className="px-3 py-3">{fmt(row.impressions)}</td><td className="px-3 py-3">{pct(row.ctr)}</td><td className="px-3 py-3">{row.position === null ? "—" : row.position.toFixed(1)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

function MarketContent({ data, players, loading, campaign }: { data: MarketDataset | null; players: MarketPlayer[]; loading: boolean; campaign: CampaignListItem | null }) {
  if (!campaign) return <div className="mt-5"><EmptyPanel title="검색 시장 프로젝트를 선택하세요" description="포지션 추적 프로젝트의 실측 SERP를 사용해 경쟁 구도를 계산합니다." action={<Link href="/position-tracking/" className="inline-flex h-10 items-center rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white">포지션 추적 설정</Link>} /></div>;
  if (!campaign.configured) return <div className="mt-5"><EmptyPanel title="프로젝트에 추적 키워드가 없습니다" description="시장 분석의 관측 모수를 만들려면 키워드를 추가하고 첫 수집을 실행하세요." action={<Link href={`/position-tracking/?campaign=${encodeURIComponent(campaign.id)}`} className="inline-flex h-10 items-center rounded-[7px] bg-app-blue px-5 text-[12px] font-semibold text-white">프로젝트 설정</Link>} /></div>;
  if (loading && !data) return <LoadingPanel label="SERP 경쟁 구도를 계산하는 중…" />;
  if (!data) return <div className="mt-5"><EmptyPanel title="시장 데이터를 만들 수 없습니다" description="포지션 추적 수집 상태와 검색 엔진 설정을 확인해 주세요." /></div>;
  const estimatedTraffic = data.overview.estimatedTraffic.current;
  return (
    <div className={cn("mt-5 transition-opacity", loading && "pointer-events-none opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[18px] font-semibold">검색 시장 개요 · {campaign.domain}</h2><p className="mt-1 text-[11px] text-app-text-secondary">{campaign.location} · {campaign.device} · {campaign.searchEngine}{campaign.lastCollectedAt ? ` · 마지막 수집 ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(campaign.lastCollectedAt))}` : ""}</p></div><Link href={`/position-tracking/?campaign=${encodeURIComponent(campaign.id)}`} className="inline-flex h-9 items-center rounded-[7px] border border-app-border bg-white px-4 text-[11px] font-semibold">경쟁자 모니터링 열기</Link></div>
      <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="자사 검색 가시성" value={data.overview.visibility.current === null ? "—" : `${data.overview.visibility.current.toFixed(1)}%`} change={data.overview.visibility.diff} changeSuffix="pp" note="직전 수집 대비" />
        <MetricCard label="SERP 관측 키워드" value={`${data.discovered.keywordsWithSerp}/${data.discovered.totalKeywords}`} note="경쟁 분석 모수" />
        <MetricCard label="발견 경쟁 도메인" value={fmt(data.discovered.competitors.length)} note="최신 SERP" />
        <MetricCard label="예상 검색 트래픽" value={estimatedTraffic === null ? "—" : fmt(estimatedTraffic)} change={data.overview.estimatedTraffic.diff} changeSuffix="" note={`${data.overview.estimatedTraffic.model} 계산식`} />
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <section className={cn(CARD, "p-4")}>
          <div><h3 className="text-[14px] font-semibold">검색 경쟁 구도</h3><p className="mt-1 text-[10px] text-app-text-secondary">X축: 관측 키워드 출현율 · Y축: 평균 순위 기반 강도. 트래픽 점유율이 아닙니다.</p></div>
          {players.length ? <div className="mt-4 h-[330px]"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 20, bottom: 8, left: -10 }}><CartesianGrid stroke="#eceeed" strokeDasharray="3 3"/><XAxis type="number" dataKey="presence" name="출현율" unit="%" domain={[0,100]} tick={{fontSize:10}}/><YAxis type="number" dataKey="rankingStrength" name="순위 강도" domain={[0,100]} tick={{fontSize:10}}/><ZAxis type="number" dataKey="appearances" range={[80,420]}/><Tooltip cursor={{strokeDasharray:"3 3"}}/><Scatter name="검색 플레이어" data={players} fill="#7f46c5"/></ScatterChart></ResponsiveContainer></div> : <p className="py-16 text-center text-[11px] text-app-text-secondary">경쟁 도메인 관측값이 없습니다.</p>}
        </section>
        <section className={cn(CARD, "overflow-hidden")}>
          <div className="border-b border-app-border px-4 py-3"><h3 className="text-[14px] font-semibold">검색 시장 플레이어</h3></div>
          <div className="max-h-[390px] overflow-auto"><table className="w-full text-left text-[11px]"><thead className="sticky top-0 bg-[#f7f8f8] text-app-text-secondary"><tr><th className="px-4 py-2.5 font-medium">도메인</th><th className="px-3 py-2.5 font-medium">출현율</th><th className="px-3 py-2.5 font-medium">평균 순위</th></tr></thead><tbody>{players.map((row) => <tr key={`${row.domain}-${row.own}`} className="border-t border-app-border"><td className="max-w-[220px] truncate px-4 py-3 font-medium" title={row.domain}>{row.domain}{row.own ? <span className="ml-2 rounded bg-[#eef6ff] px-1.5 py-0.5 text-[9px] text-app-blue">자사</span> : null}</td><td className="px-3 py-3">{row.presence.toFixed(1)}%</td><td className="px-3 py-3">{row.avgPosition.toFixed(1)}</td></tr>)}</tbody></table></div>
        </section>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <KeywordPanel title="가시성 기회 키워드" rows={data.highlights.gainers} empty="직전 대비 상승 키워드가 없습니다." />
        <KeywordPanel title="방어가 필요한 키워드" rows={data.highlights.losers} empty="직전 대비 하락 키워드가 없습니다." />
      </div>
      <section className={cn(CARD, "mt-4 overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3"><div><h3 className="text-[14px] font-semibold">검색 유입 예상 상위 페이지</h3><p className="mt-1 text-[10px] text-app-text-secondary">검색량 × 순위별 CTR 모델이며 실제 방문 수가 아닙니다.</p></div><span className={cn(SOURCE_BADGE, "border-[#cbb7ec] bg-[#f7f2ff] text-[#6f3aaa]")}>{data.pages.model}</span></div>
        {data.pages.pages.length ? <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-[11px]"><thead className="bg-[#f7f8f8] text-app-text-secondary"><tr><th className="px-4 py-3 font-medium">페이지</th><th className="px-3 py-3 font-medium">키워드</th><th className="px-3 py-3 font-medium">평균 순위</th><th className="px-3 py-3 font-medium">예상 트래픽</th><th className="px-3 py-3 font-medium">변화</th></tr></thead><tbody>{data.pages.pages.slice(0,10).map((row) => <tr key={row.url} className="border-t border-app-border"><td className="max-w-[420px] truncate px-4 py-3 font-medium" title={row.url}>{row.url}</td><td className="px-3 py-3">{row.keywords}</td><td className="px-3 py-3">{row.avgPosition.toFixed(1)}</td><td className="px-3 py-3">{fmt(row.estTraffic)}</td><td className="px-3 py-3"><span className={cn((row.estTrafficDiff ?? 0) > 0 ? "text-[#087a5b]" : (row.estTrafficDiff ?? 0) < 0 ? "text-[#b4233f]" : "text-app-text-secondary")}>{row.estTrafficDiff === null ? "—" : `${row.estTrafficDiff > 0 ? "+" : ""}${fmt(row.estTrafficDiff)}`}</span></td></tr>)}</tbody></table></div> : <p className="py-12 text-center text-[11px] text-app-text-secondary">페이지별 순위 스냅샷이 없습니다.</p>}
      </section>
    </div>
  );
}

function DistributionPanel({ title, rows }: { title: string; rows: TrafficGscRow[] }) {
  const data = rows.slice(0, 8).map((row) => ({ name: row.keys[0] ?? "기타", clicks: row.clicks, impressions: row.impressions }));
  return <section className={cn(CARD, "p-4")}><h3 className="text-[14px] font-semibold">{title}</h3>{data.length ? <div className="mt-3 h-[240px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{top:4,right:12,bottom:0,left:10}}><CartesianGrid stroke="#eceeed" strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{fontSize:9}}/><YAxis type="category" dataKey="name" width={70} tick={{fontSize:9}}/><Tooltip/><Bar dataKey="clicks" name="클릭" fill="#7f46c5" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div> : <p className="py-12 text-center text-[11px] text-app-text-secondary">데이터가 없습니다.</p>}</section>;
}

function ChannelState({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return <div className={cn("rounded-[8px] border p-3", live ? "border-[#a7dccd] bg-[#effaf6]" : "border-app-border bg-[#f7f8f8]")}><p className="text-[10px] text-app-text-secondary">{label}</p><p className={cn("mt-1 text-[13px] font-semibold", live ? "text-[#087a5b]" : "text-app-text-secondary")}>{value}</p></div>;
}

function KeywordPanel({ title, rows, empty }: { title: string; rows: KeywordHighlights["gainers"]; empty: string }) {
  return <section className={cn(CARD, "p-4")}><h3 className="text-[14px] font-semibold">{title}</h3><div className="mt-3 space-y-2">{rows.length ? rows.slice(0,6).map((row) => <div key={row.keyword} className="flex items-center justify-between gap-3 rounded-[7px] bg-[#f7f8f8] px-3 py-2.5"><span className="min-w-0 truncate text-[11px] font-medium">{row.keyword}</span><span className="shrink-0 text-[10px] text-app-text-secondary">#{row.position ?? "—"} · {row.visibilityDelta === null ? "—" : `${row.visibilityDelta > 0 ? "+" : ""}${row.visibilityDelta.toFixed(2)}`}</span></div>) : <p className="py-8 text-center text-[11px] text-app-text-secondary">{empty}</p>}</div></section>;
}

function LoadingPanel({ label }: { label: string }) {
  return <div className={cn(CARD, "mt-5 flex min-h-[360px] items-center justify-center text-[12px] text-app-text-secondary")}><ReloadIcon className="mr-2 animate-spin" />{label}</div>;
}
