"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TrendChart } from "@/components/app/app-primitives";
import { DiscoveredCompetitorsPanel } from "@/components/position-tracking/DiscoveredCompetitorsPanel";
import { GscNotice } from "@/components/position-tracking/GscNotice";
import { OverviewKpiCards } from "@/components/position-tracking/OverviewKpiCards";
import { RankDistributionPanel } from "@/components/position-tracking/RankDistributionPanel";
import { ScheduleControl } from "@/components/position-tracking/ScheduleControl";
import {
  normalizeGscKeyword,
  useGscKeywordMetrics,
} from "@/components/position-tracking/use-gsc-keyword-metrics";
import { useLocale } from "@/i18n/LocaleProvider";
import { api, ClientApiError } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { SeriesPoint } from "@/types/app";

export interface CampaignSummary {
  id: string;
  name: string;
  domain: string;
  location: string;
  device: string;
  searchEngine: string;
  status: string;
  visibility: number | null;
}

interface CompetitorPosition {
  competitorId: string;
  domain: string;
  position: number | null;
  url: string | null;
}

interface TrackedKeywordRow {
  id: string;
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  volume: number | null;
  difficulty: number | null;
  updatedAt: string;
  serpFeatures: string[];
  serpCapturedAt: string | null;
  competitorPositions: CompetitorPosition[];
}

interface CompetitorRow {
  id: string;
  domain: string;
  createdAt: string;
}

interface VisibilityPoint {
  capturedAt: string;
  visibility: number;
  rankedCount: number;
  keywordCount: number;
}

interface CollectReport {
  campaignName: string;
  domain: string;
  collected: number;
  failed: number;
  visibility: number;
  capturedAt: string;
  outcomes: {
    keyword: string;
    position: number | null;
    previousPosition: number | null;
    features?: string[];
    competitorPositions?: CompetitorPosition[];
    error?: string;
  }[];
}

const MAX_COMPETITORS = 5;

const COPY = {
  ko: {
    eyebrow: "SEO · 실시간 SERP",
    title: "포지션 추적",
    description:
      "추적 키워드의 Google/Bing 순위를 TalorData 실시간 SERP 로 수집합니다. 수집 결과는 원천 스토어(serp_snapshots)에도 적재되어 도메인 분석 지표에 반영됩니다.",
    campaign: "캠페인",
    collect: "지금 순위 수집",
    collecting: "수집 중…",
    collectDone: "수집 완료",
    keywords: "추적 키워드",
    visibility: "가시성",
    device: "기기",
    engine: "검색 엔진",
    location: "위치",
    keyword: "키워드",
    serpFeatures: "SERP 피처",
    position: "순위",
    previous: "이전",
    change: "변동",
    volume: "검색량",
    difficulty: "KD",
    updated: "갱신",
    notFound: "순위권 밖",
    noCampaigns: "포지션 추적 캠페인이 없습니다. 캠페인을 만들고 키워드를 추가하면 여기서 실시간 순위를 수집할 수 있습니다.",
    noKeywords: "이 캠페인에 추적 키워드가 없습니다. 아래에서 키워드를 추가하면 순위를 수집할 수 있습니다.",
    loadError: "추적 키워드를 불러오지 못했습니다.",
    collectError: "순위 수집에 실패했습니다.",
    collectNeedsKeyword: "먼저 추적 키워드를 추가하세요.",
    keywordPlaceholder: "추적할 키워드 입력 (예: 경영컨설팅)",
    addKeyword: "키워드 추가",
    addingKeyword: "추가 중…",
    keywordError: "키워드를 추가하지 못했습니다.",
    keywordsHint: "이 캠페인의 도메인 순위를 확인할 검색어입니다. 수집은 한 번에 최대 20개까지 처리합니다.",
    resultSummary: (collected: number, failed: number, total: number) =>
      `${total}개 키워드 중 ${collected}개 수집 완료${failed > 0 ? `, ${failed}개 실패` : ""}`,
    newEntry: "신규 진입",
    dropped: "순위권 이탈",
    visibilityTrend: "가시성 추이",
    noVisibilityHistory: "아직 수집 이력이 없습니다. '지금 순위 수집'을 실행하면 가시성 추이가 기록됩니다.",
    competitors: "경쟁사",
    competitorsHint: `같은 키워드 SERP 에서 경쟁사 순위를 함께 비교합니다 (최대 ${MAX_COMPETITORS}개). 추가 수집 비용은 없습니다.`,
    competitorPlaceholder: "경쟁사 도메인 입력 (예: example.com)",
    addCompetitor: "추가",
    addingCompetitor: "추가 중…",
    removeCompetitor: "삭제",
    competitorError: "경쟁사를 추가하지 못했습니다.",
    noCompetitors: "추적 중인 경쟁사가 없습니다.",
    tabOverview: "개요",
    tabDistribution: "순위 분포",
    tabDiscovery: "경쟁자 발견",
    serpGroupLabel: "실시간 SERP · TalorData",
    gscGroupLabel: "GSC 실측 · 최근 28일",
    gscClicks: "클릭",
    gscImpressions: "노출",
    gscCtr: "CTR",
    gscPosition: "게재순위",
    gscSourceBadge: "GSC",
  },
  en: {
    eyebrow: "SEO · Live SERP",
    title: "Position Tracking",
    description:
      "Collect live Google/Bing positions for tracked keywords via TalorData SERP. Snapshots are also stored in the source store and feed domain analytics.",
    campaign: "Campaign",
    collect: "Collect positions now",
    collecting: "Collecting…",
    collectDone: "Collection finished",
    keywords: "Tracked keywords",
    visibility: "Visibility",
    device: "Device",
    engine: "Search engine",
    location: "Location",
    keyword: "Keyword",
    serpFeatures: "SERP features",
    position: "Position",
    previous: "Previous",
    change: "Change",
    volume: "Volume",
    difficulty: "KD",
    updated: "Updated",
    notFound: "Not ranked",
    noCampaigns: "No position tracking campaigns yet. Create a campaign and add keywords to collect live positions here.",
    noKeywords: "This campaign has no tracked keywords. Add one below to start collecting positions.",
    loadError: "Tracked keywords could not be loaded.",
    collectError: "Position collection failed.",
    collectNeedsKeyword: "Add a tracked keyword first.",
    keywordPlaceholder: "Keyword to track (e.g. management consulting)",
    addKeyword: "Add keyword",
    addingKeyword: "Adding…",
    keywordError: "Keyword could not be added.",
    keywordsHint: "Search terms used to check this campaign domain. Up to 20 keywords are collected per run.",
    resultSummary: (collected: number, failed: number, total: number) =>
      `${collected}/${total} keywords collected${failed > 0 ? `, ${failed} failed` : ""}`,
    newEntry: "New entry",
    dropped: "Dropped out",
    visibilityTrend: "Visibility trend",
    noVisibilityHistory: "No collection history yet. Run “Collect positions now” to record the visibility trend.",
    competitors: "Competitors",
    competitorsHint: `Compare competitor positions on the same keyword SERPs (up to ${MAX_COMPETITORS}). No extra collection cost.`,
    competitorPlaceholder: "Competitor domain (e.g. example.com)",
    addCompetitor: "Add",
    addingCompetitor: "Adding…",
    removeCompetitor: "Remove",
    competitorError: "Competitor could not be added.",
    noCompetitors: "No competitors tracked yet.",
    tabOverview: "Overview",
    tabDistribution: "Rank distribution",
    tabDiscovery: "Competitor discovery",
    serpGroupLabel: "Live SERP · TalorData",
    gscGroupLabel: "GSC actuals · last 28 days",
    gscClicks: "Clicks",
    gscImpressions: "Impr.",
    gscCtr: "CTR",
    gscPosition: "Avg. pos.",
    gscSourceBadge: "GSC",
  },
} as const;

/** 수집기(client.ts)가 정규화한 피처 이름의 화면 라벨. */
const FEATURE_LABELS: Record<string, { ko: string; en: string }> = {
  ai_overview: { ko: "AI 개요", en: "AI Overview" },
  local_pack: { ko: "로컬 팩", en: "Local pack" },
  knowledge_panel: { ko: "지식 패널", en: "Knowledge panel" },
  answer_box: { ko: "추천 스니펫", en: "Featured snippet" },
  people_also_ask: { ko: "관련 질문", en: "People also ask" },
  people_are_saying: { ko: "사람들의 의견", en: "People are saying" },
  related_searches: { ko: "연관 검색어", en: "Related searches" },
  refine_this_search: { ko: "검색어 세분화", en: "Refine search" },
  shopping: { ko: "쇼핑", en: "Shopping" },
  videos: { ko: "동영상", en: "Videos" },
  images: { ko: "이미지", en: "Images" },
  top_stories: { ko: "주요 뉴스", en: "Top stories" },
};

function FeatureBadges({ features, locale }: { features: string[]; locale: "ko" | "en" }) {
  if (features.length === 0) {
    return <span className="text-app-text-secondary">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {features.map((feature) => {
        const label = FEATURE_LABELS[feature]?.[locale] ?? feature;
        const isAi = feature === "ai_overview";
        return (
          <span
            key={feature}
            className={cn(
              "rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium",
              isAi ? "bg-[#f0e8fd] text-[#6d28d9]" : "bg-[#eef2f7] text-[#475166]"
            )}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

/** GSC 실측 컬럼의 출처 배지 — TalorData 수집 순위와 혼동하지 않도록 컬럼마다 표기한다. */
function GscSourceBadge({ label }: { label: string }) {
  return (
    <span className="ml-1 rounded-[3px] bg-[#e8f0fe] px-1 py-px align-middle text-[10px] font-semibold text-[#1a56db]">
      {label}
    </span>
  );
}

type DashboardTab = "overview" | "distribution" | "discovery";

function ChangeBadge({
  position,
  previousPosition,
  copy,
}: {
  position: number | null;
  previousPosition: number | null;
  copy: (typeof COPY)[keyof typeof COPY];
}) {
  if (position === null && previousPosition === null) {
    return <span className="text-app-text-secondary">—</span>;
  }
  if (position !== null && previousPosition === null) {
    return (
      <span className="rounded-[4px] bg-[#e6f5f0] px-1.5 py-0.5 text-[12px] font-medium text-[#0a6b57]">
        {copy.newEntry}
      </span>
    );
  }
  if (position === null) {
    return (
      <span className="rounded-[4px] bg-[#fdecef] px-1.5 py-0.5 text-[12px] font-medium text-[#a4002a]">
        {copy.dropped}
      </span>
    );
  }
  const delta = previousPosition! - position;
  if (delta === 0) return <span className="text-app-text-secondary">0</span>;
  const improved = delta > 0;
  return (
    <span
      className={cn(
        "font-semibold",
        improved ? "text-[#0a6b57]" : "text-[#a4002a]"
      )}
    >
      {improved ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

export function PositionTrackingDashboard({
  campaigns,
  canCollect,
}: {
  campaigns: CampaignSummary[];
  canCollect: boolean;
}) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [selectedId, setSelectedId] = useState(campaigns[0]?.id ?? "");
  const [keywords, setKeywords] = useState<TrackedKeywordRow[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [visibilityHistory, setVisibilityHistory] = useState<VisibilityPoint[]>([]);
  // 로딩 상태는 "요청한 캠페인 != 마지막 반영 캠페인"으로 파생한다 (effect 내 동기 setState 방지).
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = selectedId !== loadedId;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [report, setReport] = useState<CollectReport | null>(null);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  // 수집 완료/경쟁사 추가 후 탭 패널들이 다시 집계되도록 증가시키는 키.
  const [refreshKey, setRefreshKey] = useState(0);

  const campaign = useMemo(
    () => campaigns.find((item) => item.id === selectedId) ?? null,
    [campaigns, selectedId]
  );

  const gsc = useGscKeywordMetrics(campaign?.domain ?? null);
  const gscReady = gsc.state?.kind === "ready" ? gsc.state : null;

  const loadKeywords = useCallback(async (campaignId: string) => {
    try {
      const response = await api.get<TrackedKeywordRow[]>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/keywords/`
      );
      setKeywords(response.data);
      setLoadError(null);
    } catch (caught) {
      setLoadError(
        caught instanceof ClientApiError ? caught.message : COPY.ko.loadError
      );
      setKeywords([]);
    }
  }, []);

  const loadCompetitors = useCallback(async (campaignId: string) => {
    try {
      const response = await api.get<CompetitorRow[]>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/competitors/`
      );
      setCompetitors(response.data);
    } catch {
      setCompetitors([]);
    }
  }, []);

  const loadVisibility = useCallback(async (campaignId: string) => {
    try {
      const response = await api.get<VisibilityPoint[]>(
        `/api/position-tracking/${encodeURIComponent(campaignId)}/visibility/`
      );
      setVisibilityHistory(response.data);
    } catch {
      setVisibilityHistory([]);
    }
  }, []);

  const loadAll = useCallback(
    async (campaignId: string) => {
      await Promise.all([
        loadKeywords(campaignId),
        loadCompetitors(campaignId),
        loadVisibility(campaignId),
      ]);
      setLoadedId(campaignId);
    },
    [loadKeywords, loadCompetitors, loadVisibility]
  );

  useEffect(() => {
    // loadAll() 의 모든 setState 는 첫 await 이후에 실행되므로 동기 연쇄 렌더가 없다.
    // 린트 규칙은 정적 분석으로 이를 구분하지 못한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedId) void loadAll(selectedId);
  }, [selectedId, loadAll]);

  const collect = async () => {
    if (!selectedId || collecting) return;
    setCollecting(true);
    setCollectError(null);
    setReport(null);
    try {
      const response = await api.post<CollectReport>("/api/serp/collect-campaign/", {
        campaignId: selectedId,
      });
      setReport(response.data);
      setRefreshKey((key) => key + 1);
      await Promise.all([loadKeywords(selectedId), loadVisibility(selectedId)]);
    } catch (caught) {
      setCollectError(
        caught instanceof ClientApiError ? caught.message : COPY.ko.collectError
      );
    } finally {
      setCollecting(false);
    }
  };

  const addKeyword = async () => {
    const keyword = keywordInput.trim();
    if (!selectedId || !keyword || addingKeyword) return;
    setAddingKeyword(true);
    setKeywordError(null);
    try {
      await api.post(
        `/api/position-tracking/${encodeURIComponent(selectedId)}/keywords/`,
        { keyword }
      );
      setKeywordInput("");
      await loadKeywords(selectedId);
      setRefreshKey((key) => key + 1);
    } catch (caught) {
      setKeywordError(
        caught instanceof ClientApiError ? caught.message : COPY.ko.keywordError
      );
    } finally {
      setAddingKeyword(false);
    }
  };

  const addCompetitor = async () => {
    const domain = competitorInput.trim();
    if (!selectedId || !domain || addingCompetitor) return;
    setAddingCompetitor(true);
    setCompetitorError(null);
    try {
      await api.post(
        `/api/position-tracking/${encodeURIComponent(selectedId)}/competitors/`,
        { domain }
      );
      setCompetitorInput("");
      await Promise.all([loadCompetitors(selectedId), loadKeywords(selectedId)]);
    } catch (caught) {
      setCompetitorError(
        caught instanceof ClientApiError ? caught.message : COPY.ko.competitorError
      );
    } finally {
      setAddingCompetitor(false);
    }
  };

  const removeCompetitor = async (competitorId: string) => {
    if (!selectedId) return;
    try {
      await api.delete(
        `/api/position-tracking/${encodeURIComponent(selectedId)}/competitors/${encodeURIComponent(competitorId)}/`
      );
      await Promise.all([loadCompetitors(selectedId), loadKeywords(selectedId)]);
    } catch {
      // 삭제 실패는 목록을 다시 읽어 화면을 실제 상태로 맞춘다.
      await loadCompetitors(selectedId);
    }
  };

  const handleCompetitorAdded = useCallback(() => {
    if (!selectedId) return;
    setRefreshKey((key) => key + 1);
    void Promise.all([loadCompetitors(selectedId), loadKeywords(selectedId)]);
  }, [selectedId, loadCompetitors, loadKeywords]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );

  const visibilitySeries: SeriesPoint[] = useMemo(
    () =>
      visibilityHistory.map((point) => ({
        label: dateFormatter.format(new Date(point.capturedAt)),
        a: point.visibility,
      })),
    [visibilityHistory, dateFormatter]
  );

  if (campaigns.length === 0) {
    return (
      <div className="p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.65px] text-app-blue">
          {copy.eyebrow}
        </p>
        <h1 className="mt-1 text-[24px] font-semibold leading-[32px] text-app-text">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-[560px] rounded-[10px] border border-app-border bg-white p-6 text-[14px] leading-[22px] text-app-text-secondary">
          {copy.noCampaigns}
        </p>
      </div>
    );
  }

  const gscColumnCount = gscReady ? 4 : 0;
  const totalColumns = 8 + competitors.length + gscColumnCount;

  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "overview", label: copy.tabOverview },
    { id: "distribution", label: copy.tabDistribution },
    { id: "discovery", label: copy.tabDiscovery },
  ];

  return (
    <div className="p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.65px] text-app-blue">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 text-[24px] font-semibold leading-[32px] text-app-text">
            {copy.title}
          </h1>
          <p className="mt-1 max-w-[720px] text-[13px] leading-[20px] text-app-text-secondary">
            {copy.description}
          </p>
        </div>
        {canCollect && campaign?.status === "active" && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={collect}
              // 키워드가 없으면 서버가 VALIDATION_ERROR 를 던지므로 버튼 단계에서 막는다.
              disabled={collecting || loading || keywords.length === 0}
              title={keywords.length === 0 ? copy.collectNeedsKeyword : undefined}
              className="h-[40px] rounded-[8px] bg-app-blue px-5 text-[14px] font-medium text-white transition-colors hover:bg-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {collecting ? copy.collecting : copy.collect}
            </button>
            {!loading && keywords.length === 0 && (
              <span className="text-[12px] text-app-text-secondary">
                {copy.collectNeedsKeyword}
              </span>
            )}
          </div>
        )}
      </header>

      <section className="mt-5 rounded-[10px] border border-app-border bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1.5 block text-[12px] font-medium text-app-text-secondary">
              {copy.campaign}
            </span>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="h-[40px] w-full rounded-[8px] border border-app-border bg-white px-3 text-[14px] text-app-text"
            >
              {campaigns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.domain}
                </option>
              ))}
            </select>
          </label>
          {campaign && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <div>
                <dt className="text-[12px] text-app-text-secondary">{copy.visibility}</dt>
                <dd className="text-[20px] font-semibold text-app-text">
                  {campaign.visibility ?? "n/a"}
                  {campaign.visibility !== null && "%"}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-app-text-secondary">{copy.keywords}</dt>
                <dd className="text-[20px] font-semibold text-app-text">{keywords.length}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-app-text-secondary">{copy.engine}</dt>
                <dd className="mt-1 capitalize text-app-text">{campaign.searchEngine}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-app-text-secondary">{copy.device}</dt>
                <dd className="mt-1 capitalize text-app-text">{campaign.device}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-app-text-secondary">{copy.location}</dt>
                <dd className="mt-1 text-app-text">{campaign.location}</dd>
              </div>
            </dl>
          )}
          {campaign && (
            <div className="ml-auto">
              <ScheduleControl campaignId={campaign.id} canEdit={canCollect} />
            </div>
          )}
        </div>
      </section>

      <nav className="mt-4 flex gap-1 border-b border-app-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              activeTab === tab.id
                ? "border-app-blue font-semibold text-app-text"
                : "border-transparent text-app-text-secondary hover:text-app-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "distribution" && (
        <div className="mt-4">
          <RankDistributionPanel campaignId={selectedId} refreshKey={refreshKey} />
        </div>
      )}

      {activeTab === "discovery" && (
        <div className="mt-4">
          <DiscoveredCompetitorsPanel
            campaignId={selectedId}
            refreshKey={refreshKey}
            canCollect={canCollect}
            trackedCount={competitors.length}
            onAdded={handleCompetitorAdded}
          />
        </div>
      )}

      {activeTab === "overview" && (
      <>
      {(report || collectError) && (
        <section
          className={cn(
            "mt-4 rounded-[8px] border px-4 py-3 text-[13px]",
            collectError || (report && report.collected === 0 && report.failed > 0)
              ? "border-[#f5c2cd] bg-[#fdecef] text-[#a4002a]"
              : "border-[#bfe6d8] bg-[#e6f5f0] text-[#0a6b57]"
          )}
          role="status"
        >
          {collectError ??
            (report!.collected === 0 && report!.failed > 0
              ? `${copy.collectError} · ${report!.outcomes.find((outcome) => outcome.error)?.error ?? ""}`
              : `${copy.collectDone} · ${copy.resultSummary(
                  report!.collected,
                  report!.failed,
                  report!.outcomes.length
                )} · ${copy.visibility} ${report!.visibility}%`)}
        </section>
      )}

      <div className="mt-4">
        <OverviewKpiCards campaignId={selectedId} refreshKey={refreshKey} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        {visibilitySeries.length > 0 ? (
          <TrendChart
            title={copy.visibilityTrend}
            type="area"
            series={visibilitySeries}
            legend={[copy.visibility]}
          />
        ) : (
          <div className="rounded-[8px] border border-app-border bg-white p-4">
            <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
              {copy.visibilityTrend}
            </h3>
            <p className="mt-3 text-[13px] leading-[20px] text-app-text-secondary">
              {copy.noVisibilityHistory}
            </p>
          </div>
        )}

        <section className="rounded-[8px] border border-app-border bg-white p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
              {copy.keywords}
            </h3>
            <span className="text-[12px] text-app-text-secondary">{keywords.length}</span>
          </div>
          <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">
            {copy.keywordsHint}
          </p>
          {canCollect && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void addKeyword();
              }}
            >
              <input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder={copy.keywordPlaceholder}
                className="h-[36px] min-w-0 flex-1 rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-app-text"
              />
              <button
                type="submit"
                disabled={addingKeyword || keywordInput.trim().length === 0}
                className="h-[36px] shrink-0 rounded-[8px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addingKeyword ? copy.addingKeyword : copy.addKeyword}
              </button>
            </form>
          )}
          {keywordError && (
            <p className="mt-2 text-[12px] text-app-red" role="alert">
              {keywordError}
            </p>
          )}
        </section>

        <section className="rounded-[8px] border border-app-border bg-white p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold leading-[20px] text-app-text">
              {copy.competitors}
            </h3>
            <span className="text-[12px] text-app-text-secondary">
              {competitors.length}/{MAX_COMPETITORS}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-[18px] text-app-text-secondary">
            {copy.competitorsHint}
          </p>
          {canCollect && competitors.length < MAX_COMPETITORS && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void addCompetitor();
              }}
            >
              <input
                value={competitorInput}
                onChange={(event) => setCompetitorInput(event.target.value)}
                placeholder={copy.competitorPlaceholder}
                className="h-[36px] min-w-0 flex-1 rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-app-text"
              />
              <button
                type="submit"
                disabled={addingCompetitor || competitorInput.trim().length === 0}
                className="h-[36px] shrink-0 rounded-[8px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addingCompetitor ? copy.addingCompetitor : copy.addCompetitor}
              </button>
            </form>
          )}
          {competitorError && (
            <p className="mt-2 text-[12px] text-app-red" role="alert">
              {competitorError}
            </p>
          )}
          <ul className="mt-3 space-y-1.5">
            {competitors.length === 0 && (
              <li className="text-[13px] text-app-text-secondary">{copy.noCompetitors}</li>
            )}
            {competitors.map((competitor) => (
              <li
                key={competitor.id}
                className="flex items-center justify-between gap-2 rounded-[6px] border border-app-border px-2.5 py-1.5"
              >
                <span className="truncate text-[13px] font-medium text-app-text">
                  {competitor.domain}
                </span>
                {canCollect && (
                  <button
                    type="button"
                    onClick={() => void removeCompetitor(competitor.id)}
                    aria-label={`${copy.removeCompetitor} ${competitor.domain}`}
                    className="shrink-0 text-[12px] text-app-text-secondary transition-colors hover:text-app-red"
                  >
                    {copy.removeCompetitor}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {campaign && (
        <div className="mt-4">
          <GscNotice state={gsc.state} loading={gsc.loading} campaignDomain={campaign.domain} />
        </div>
      )}

      <section className="mt-4 overflow-x-auto rounded-[10px] border border-app-border bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            {gscReady && (
              <tr className="border-b border-app-border bg-[#f9fafb] text-[11px] uppercase tracking-[0.4px] text-app-text-secondary">
                <th colSpan={2} className="px-4 pt-2" />
                <th
                  colSpan={3 + competitors.length}
                  className="px-4 pt-2 text-right font-medium"
                >
                  {copy.serpGroupLabel}
                </th>
                <th colSpan={3} className="px-4 pt-2" />
                <th colSpan={gscColumnCount} className="px-4 pt-2 text-right font-medium">
                  {copy.gscGroupLabel}
                </th>
              </tr>
            )}
            <tr className="border-b border-app-border bg-[#f9fafb] text-[12px] text-app-text-secondary">
              <th className="px-4 py-2.5 font-medium">{copy.keyword}</th>
              <th className="px-4 py-2.5 font-medium">{copy.serpFeatures}</th>
              <th className="px-4 py-2.5 text-right font-medium">{copy.position}</th>
              <th className="px-4 py-2.5 text-right font-medium">{copy.previous}</th>
              <th className="px-4 py-2.5 text-right font-medium">{copy.change}</th>
              {competitors.map((competitor) => (
                <th
                  key={competitor.id}
                  className="max-w-[120px] truncate px-4 py-2.5 text-right font-medium"
                  title={competitor.domain}
                >
                  {competitor.domain}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">{copy.volume}</th>
              <th className="px-4 py-2.5 text-right font-medium">{copy.difficulty}</th>
              <th className="px-4 py-2.5 text-right font-medium">{copy.updated}</th>
              {gscReady && (
                <>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {copy.gscClicks}
                    <GscSourceBadge label={copy.gscSourceBadge} />
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {copy.gscImpressions}
                    <GscSourceBadge label={copy.gscSourceBadge} />
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {copy.gscCtr}
                    <GscSourceBadge label={copy.gscSourceBadge} />
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {copy.gscPosition}
                    <GscSourceBadge label={copy.gscSourceBadge} />
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {loadError && (
              <tr>
                <td colSpan={totalColumns} className="px-4 py-6 text-center text-[13px] text-app-red">
                  {loadError}
                </td>
              </tr>
            )}
            {!loadError && !loading && keywords.length === 0 && (
              <tr>
                <td colSpan={totalColumns} className="px-4 py-6 text-center text-[13px] text-app-text-secondary">
                  {copy.noKeywords}
                </td>
              </tr>
            )}
            {keywords.map((row) => {
              const gscMetric = gscReady
                ? gscReady.rows.get(normalizeGscKeyword(row.keyword))
                : undefined;
              return (
              <tr key={row.id} className="border-b border-app-border text-[13px] last:border-b-0">
                <td className="px-4 py-2.5 font-medium text-app-text">{row.keyword}</td>
                <td className="px-4 py-2.5">
                  <FeatureBadges features={row.serpFeatures} locale={locale} />
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-app-text">
                  {row.position ?? (
                    <span className="font-normal text-app-text-secondary">{copy.notFound}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-app-text-secondary">
                  {row.previousPosition ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <ChangeBadge
                    position={row.position}
                    previousPosition={row.previousPosition}
                    copy={copy}
                  />
                </td>
                {competitors.map((competitor) => {
                  const hit = row.competitorPositions.find(
                    (item) => item.competitorId === competitor.id
                  );
                  return (
                    <td key={competitor.id} className="px-4 py-2.5 text-right text-app-text">
                      {hit?.position ?? <span className="text-app-text-secondary">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right text-app-text">
                  {row.volume?.toLocaleString() ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-app-text">
                  {row.difficulty ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-app-text-secondary">
                  {dateFormatter.format(new Date(row.updatedAt))}
                </td>
                {gscReady && (
                  <>
                    <td className="px-4 py-2.5 text-right text-app-text">
                      {gscMetric ? (
                        gscMetric.clicks.toLocaleString()
                      ) : (
                        <span className="text-app-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-app-text">
                      {gscMetric ? (
                        gscMetric.impressions.toLocaleString()
                      ) : (
                        <span className="text-app-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-app-text">
                      {gscMetric ? (
                        `${(gscMetric.ctr * 100).toFixed(1)}%`
                      ) : (
                        <span className="text-app-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-app-text">
                      {gscMetric ? (
                        gscMetric.position.toFixed(1)
                      ) : (
                        <span className="text-app-text-secondary">—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      </>
      )}
    </div>
  );
}
