"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import type { DomainAnalyticsReport, AnalyticsDevice, AnalyticsIntent } from "@/lib/analytics/types";
import type { OrganicOverviewExtras } from "@/lib/analytics/organic-overview";
import { FEATURE_LABELS } from "@/components/analytics/domain-overview/copy";
import {
  OrganicHeader,
  OrganicFilterBar,
  OrganicPageTabs,
} from "@/components/analytics/organic/OrganicHeader";
import { OrganicKpiRow, type OrganicKpiItem } from "@/components/analytics/organic/OrganicKpiRow";
import { OrganicTrendChart, type TrendPoint } from "@/components/analytics/organic/OrganicTrendChart";
import { TopKeywordsCard, type TopKeywordRow } from "@/components/analytics/organic/TopKeywordsCard";
import { IntentKeywordsCard, type IntentRow } from "@/components/analytics/organic/IntentKeywordsCard";
import {
  PositionChangesCard,
  SerpPositionChangesCard,
} from "@/components/analytics/organic/PositionChangesCards";
import { SerpTrendsChart, type SerpTrendPoint } from "@/components/analytics/organic/SerpTrendsChart";
import { SerpFeaturesGrid, type SerpFeatureItem } from "@/components/analytics/organic/SerpFeaturesGrid";
import { TopPagesCard, TopSubdomainsCard, type TopPageRow } from "@/components/analytics/organic/TopPagesCards";
import {
  CompetitorsCard,
  PositioningMapCard,
  type CompetitorRow,
  type BubbleRow,
} from "@/components/analytics/organic/CompetitorsCards";
import type { OrganicPeriod } from "@/components/analytics/organic/organic-ui";
import { OrganicLink } from "@/components/analytics/organic/organic-ui";

/**
 * Organic Research(자연검색 순위) 개요 — ko.semrush.com/analytics/organic/overview 클론.
 * 모든 수치는 축적된 실측 원천(serp_snapshots 등)에서 파생하며,
 * 소스가 없는 지표(검색량·CPC·트래픽 비용 등)는 미제공(—)으로 표시한다.
 * 레이아웃·수치 명세: docs/research/PAGE_TOPOLOGY.md, BEHAVIORS.md
 */

const PERIOD_MONTHS: Record<OrganicPeriod, number | null> = {
  "1m": 1,
  "6m": 6,
  "1y": 12,
  "2y": 24,
  all: null,
};

/** 원본 그리드의 피처 나열 순서 (BEHAVIORS/spec 기준 정렬용 우선순위) */
const FEATURE_ORDER = [
  "featured_snippet",
  "sitelinks",
  "ai_overview",
  "faq",
  "reviews",
  "news",
  "image",
  "image_pack",
  "video",
  "featured_video",
  "video_carousel",
  "people_also_ask",
  "related_questions",
  "local_pack",
  "knowledge_panel",
  "top_stories",
  "recipes",
  "jobs",
  "twitter",
  "shopping_ads",
  "ads_top",
  "related_searches",
  "instant_answer",
  "carousel",
  "events",
  "hotels_pack",
  "flights",
  "address_pack",
  "related_products",
  "popular_products",
  "refine_by",
  "questions_and_answers",
  "knowledge_card",
] as const;

const EXTRA_FEATURE_LABELS: Record<string, { en: string; ko: string }> = {
  related_questions: { en: "Related questions", ko: "관련 질문" },
  related_searches: { en: "Related searches", ko: "연관 검색" },
  instant_answer: { en: "Instant answer", ko: "빠른 답변" },
  carousel: { en: "Carousel", ko: "캐러셀" },
  events: { en: "Events", ko: "이벤트" },
  hotels_pack: { en: "Hotel pack", ko: "호텔 팩" },
  flights: { en: "Flights", ko: "항공편" },
  address_pack: { en: "Address pack", ko: "주소 팩" },
  related_products: { en: "Related products", ko: "연관 제품" },
  popular_products: { en: "Popular products", ko: "인기있는 제품" },
  refine_by: { en: "Refine by", ko: "상세 검색" },
  questions_and_answers: { en: "Questions and answers", ko: "질문과 답변" },
  knowledge_card: { en: "Knowledge card", ko: "알아두면 좋은 정보" },
  sitelinks: { en: "Sitelinks", ko: "사이트 링크" },
  faq: { en: "FAQ", ko: "FAQ" },
  reviews: { en: "Reviews", ko: "리뷰" },
  news: { en: "News", ko: "뉴스" },
  image: { en: "Images", ko: "이미지" },
  image_pack: { en: "Image pack", ko: "이미지 팩" },
  video: { en: "Videos", ko: "동영상" },
  featured_video: { en: "Featured video", ko: "추천 동영상" },
  video_carousel: { en: "Video carousel", ko: "동영상 캐러셀" },
  top_stories: { en: "Top stories", ko: "주요 뉴스" },
  recipes: { en: "Recipes", ko: "레시피" },
  jobs: { en: "Jobs", ko: "직책" },
  twitter: { en: "X", ko: "X" },
  shopping_ads: { en: "Shopping ads", ko: "쇼핑 광고" },
  ads_top: { en: "Google Ads (top)", ko: "Google Ads 상위" },
  knowledge_panel: { en: "Knowledge panel", ko: "지식 패널" },
  local_pack: { en: "Local pack", ko: "로컬 팩" },
};

const COPY = {
  en: {
    breadcrumbs: ["Home", "SEO", "Domain Overview", "Organic Research"],
    manual: "User manual",
    feedback: "Send feedback",
    titlePrefix: "Organic Research:",
    exportPdf: "Export to PDF",
    livePill: "Live collected data",
    filter: { device: "Device:", desktop: "Desktop", mobile: "Mobile", date: "Date:", currency: "Currency:" },
    tabs: ["Overview", "Positions", "Position Changes", "Competitors", "Topics", "Subdomains"],
    kpi: {
      keywords: "Keywords",
      traffic: "Traffic",
      trafficCost: "Traffic Cost",
      branded: "Branded Traffic",
      nonBranded: "Non-Branded Traffic",
      costUnavailable: "No CPC source connected — cost is not estimated.",
      deltaUnavailable: "No previous capture to compare.",
    },
    trend: {
      title: "Organic Keywords Trend",
      legend: { top3: "Top 3", p4_10: "4-10", p11_20: "11-20", p21_50: "21-50", p51_100: "51-100", serpFeatures: "SERP Features" },
      memo: "Notes",
      empty: "No collected history for this scope yet.",
    },
    periods: { "1m": "1M", "6m": "6M", "1y": "1Y", "2y": "2Y", all: "All time" } as Record<OrganicPeriod, string>,
    topKeywords: {
      title: "Top Keywords",
      segments: { all: "All positions", organic: "Organic", serp: "SERP Features" },
      headers: { keyword: "Keyword", position: "Pos.", sf: "SF", volume: "Volume", traffic: "Traffic %" },
      viewAll: (n: number) => `View all ${n.toLocaleString("en-US")} keywords`,
      empty: "No keywords match this filter.",
    },
    intents: {
      title: "Keywords by Intent",
      headers: { intent: "Intent", keywords: "Keywords", traffic: "Traffic" },
      labels: {
        informational: "Informational (I)",
        navigational: "Navigational (N)",
        commercial: "Commercial (C)",
        transactional: "Transactional (T)",
      } as Record<AnalyticsIntent, string>,
      noMore: "No more results.",
      viewAll: "View full report",
      empty: "No ranked keywords yet.",
    },
    changes: {
      title: "Top Organic Position Changes",
      serpTitle: "Top Position Changes for SERP Features",
      segments: { new: "New", lost: "Lost", improved: "Improved", declined: "Declined" },
      tableHeaders: { keyword: "Keyword", change: "Change", volume: "Volume" },
      emptyTitle: "No results found",
      emptyHint: "Try changing your filters.",
    },
    serpTrends: {
      title: "SERP Features Trend",
      features: { aiOverview: "AI Overview", featuredVideo: "Featured video", relatedQuestions: "Related questions" },
      otherSelect: "Other features",
      viewAll: "View all keywords",
    },
    featuresGrid: {
      title: "SERP Features",
      linkedTitle: "Linked to domain",
      notLinkedTitle: "Not linked to domain",
      keywordCount: (n: number) => `Keywords ${n.toLocaleString("en-US")}`,
    },
    pages: {
      title: "Top Pages",
      headers: { url: "URL", traffic: "Traffic %", keywords: "Keywords" },
      viewAll: (n: number) => `View all ${n.toLocaleString("en-US")} pages`,
      empty: "No page data yet.",
    },
    subdomains: {
      title: "Top Subdomains",
      headers: { url: "Subdomain", traffic: "Traffic %", keywords: "Keywords" },
      viewAll: (n: number) => `View all ${n.toLocaleString("en-US")} subdomains`,
      empty: "No subdomain data yet.",
    },
    competitors: {
      title: "Main Organic Competitors",
      headers: { domain: "Domain", common: "Common Keywords", level: "Com. Level" },
      viewAll: (n: number) => `View all ${n.toLocaleString("en-US")} competitors`,
      empty: "No competitors observed yet.",
    },
    map: {
      title: "Competitive Positioning Map",
      xLabel: "Number of keywords",
      yLabel: "Organic search traffic",
      empty: "Not enough data to plot competitors.",
    },
    notFound: {
      title: "No collected data for this domain yet.",
      hint: "Collect live SERP data from Domain Overview first.",
      cta: "Collect in Domain Overview →",
    },
  },
  ko: {
    breadcrumbs: ["홈페이지", "SEO", "도메인 개요", "자연검색 순위"],
    manual: "사용자 매뉴얼",
    feedback: "피드백 보내기",
    titlePrefix: "자연검색 순위:",
    exportPdf: "PDF로 내보내기",
    livePill: "실시간 수집 데이터",
    filter: { device: "장치:", desktop: "데스크톱", mobile: "모바일", date: "날짜:", currency: "통화:" },
    tabs: ["개요", "포지션", "포지션 변경", "경쟁자", "주제", "서브도메인"],
    kpi: {
      keywords: "키워드",
      traffic: "트래픽",
      trafficCost: "트래픽 비용",
      branded: "브랜드 트래픽",
      nonBranded: "비브랜드 트래픽",
      costUnavailable: "CPC 소스가 연결되지 않아 비용을 추정하지 않습니다.",
      deltaUnavailable: "비교할 이전 수집본이 없습니다.",
    },
    trend: {
      title: "자연 키워드 추세",
      legend: { top3: "상위 3개", p4_10: "4-10", p11_20: "11-20", p21_50: "21-50", p51_100: "51-100", serpFeatures: "SERP 구성 요소" },
      memo: "메모",
      empty: "이 조건의 수집 이력이 아직 없습니다.",
    },
    periods: { "1m": "1개월", "6m": "6개월", "1y": "1년", "2y": "2년", all: "항상" } as Record<OrganicPeriod, string>,
    topKeywords: {
      title: "상위 키워드",
      segments: { all: "모든 포지션", organic: "유기적", serp: "SERP 구성 요소" },
      headers: { keyword: "키워드", position: "포지션", sf: "SF", volume: "검색량", traffic: "트래픽 %" },
      viewAll: (n: number) => `키워드 ${n.toLocaleString("ko-KR")}개 모두 보기`,
      empty: "이 필터와 일치하는 키워드가 없습니다.",
    },
    intents: {
      title: "의도별 키워드",
      headers: { intent: "의도", keywords: "키워드", traffic: "트래픽" },
      labels: {
        informational: "정보제공(I)",
        navigational: "탐색(N)",
        commercial: "상업(C)",
        transactional: "거래(T)",
      } as Record<AnalyticsIntent, string>,
      noMore: "더 이상 결과가 없습니다",
      viewAll: "전체 보고서 보기",
      empty: "랭킹된 키워드가 아직 없습니다.",
    },
    changes: {
      title: "자연 검색 상위 포지션 변동",
      serpTitle: "SERP 구성 요소 상위 포지션 변동",
      segments: { new: "신규", lost: "누락", improved: "상승", declined: "하락" },
      tableHeaders: { keyword: "키워드", change: "변동", volume: "검색량" },
      emptyTitle: "결과가 없습니다",
      emptyHint: "필터를 변경해 보세요.",
    },
    serpTrends: {
      title: "SERP 구성 요소 트렌드",
      features: { aiOverview: "AI 개요", featuredVideo: "추천 동영상", relatedQuestions: "관련 질문" },
      otherSelect: "기타 구성 요소",
      viewAll: "모든 키워드 보기",
    },
    featuresGrid: {
      title: "SERP 구성 요소",
      linkedTitle: "도메인으로 연결됨",
      notLinkedTitle: "도메인으로 연결되지 않음",
      keywordCount: (n: number) => `키워드 ${n.toLocaleString("ko-KR")}개`,
    },
    pages: {
      title: "상위 페이지",
      headers: { url: "URL", traffic: "트래픽 %", keywords: "키워드" },
      viewAll: (n: number) => `페이지 ${n.toLocaleString("ko-KR")}개 모두 보기`,
      empty: "페이지 데이터가 아직 없습니다.",
    },
    subdomains: {
      title: "상위 서브도메인",
      headers: { url: "서브도메인", traffic: "트래픽 %", keywords: "키워드" },
      viewAll: (n: number) => `서브도메인 ${n.toLocaleString("ko-KR")}개 모두 보기`,
      empty: "서브도메인 데이터가 아직 없습니다.",
    },
    competitors: {
      title: "주요 자연 경쟁자",
      headers: { domain: "도메인", common: "공통 키워드", level: "경쟁 수준" },
      viewAll: (n: number) => `경쟁자 ${n.toLocaleString("ko-KR")}개 모두 보기`,
      empty: "관찰된 경쟁자가 아직 없습니다.",
    },
    map: {
      title: "경쟁 포지셔닝 지도",
      xLabel: "키워드 수",
      yLabel: "자연 검색 트래픽",
      empty: "경쟁자를 표시할 데이터가 부족합니다.",
    },
    notFound: {
      title: "이 도메인은 아직 수집된 데이터가 없습니다.",
      hint: "먼저 도메인 개요에서 실시간 SERP 를 수집하세요.",
      cta: "도메인 개요에서 수집하기 →",
    },
  },
} as const;

function formatTrafficPct(contribution: number, total: number): string {
  if (total <= 0) return "0";
  const pct = (contribution / total) * 100;
  if (pct > 0 && pct < 0.01) return "< 0.01";
  return pct.toFixed(2);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.split("/")[0] ?? url;
  }
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

interface OrganicResearchDashboardProps {
  initialReport: DomainAnalyticsReport | null;
  extras: OrganicOverviewExtras | null;
  initialDomain: string;
  initialCountry: string;
  initialDevice: AnalyticsDevice;
  dbCounts: Array<{ code: string; count: number }>;
}

export function OrganicResearchDashboard({
  initialReport,
  extras,
  initialDomain,
  initialCountry,
  initialDevice,
  dbCounts,
}: OrganicResearchDashboardProps) {
  const { locale } = useLocale();
  const copy = COPY[locale === "ko" ? "ko" : "en"];
  const router = useRouter();
  const report = initialReport;

  const [trendPeriod, setTrendPeriod] = useState<OrganicPeriod>("all");
  const [serpTrendPeriod, setSerpTrendPeriod] = useState<OrganicPeriod>("1m");

  const featureLabel = useMemo(
    () => (key: string) => {
      const entry = FEATURE_LABELS[key] ?? EXTRA_FEATURE_LABELS[key];
      return entry ? entry[locale === "ko" ? "ko" : "en"] : key.replaceAll("_", " ");
    },
    [locale],
  );

  const dateLabel = useMemo(() => {
    const iso = report?.freshness.serpCapturedAt;
    if (!iso) return "";
    const date = new Date(iso);
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }, [report?.freshness.serpCapturedAt, locale]);

  /* ---- KPI ---- */
  const kpiItems = useMemo<OrganicKpiItem[]>(() => {
    if (!report) return [];
    const trafficTotal = report.brandedSplit.totalTraffic;
    const keywordSpark = (extras?.trendPoints ?? []).map(
      (p) => p.top3 + p.p4_10 + p.p11_20 + p.p21_50 + p.p51_100,
    );
    const trafficSpark = report.trend.map((p) => p.organicTrafficEstimate);
    return [
      {
        key: "keywords",
        label: copy.kpi.keywords,
        value: report.metrics.organicKeywords.toLocaleString(locale === "ko" ? "ko-KR" : "en-US"),
        delta: null,
        spark: keywordSpark.length > 1 ? { type: "bar", points: keywordSpark } : null,
        unavailableNote: copy.kpi.deltaUnavailable,
      },
      {
        key: "traffic",
        label: copy.kpi.traffic,
        value: Math.round(report.metrics.organicTrafficEstimate.value).toLocaleString(
          locale === "ko" ? "ko-KR" : "en-US",
        ),
        delta: null,
        spark: trafficSpark.length > 1 ? { type: "line", points: trafficSpark } : null,
        unavailableNote: copy.kpi.deltaUnavailable,
      },
      {
        key: "cost",
        label: copy.kpi.trafficCost,
        value: null,
        delta: null,
        spark: null,
        unavailableNote: copy.kpi.costUnavailable,
      },
      {
        key: "branded",
        label: copy.kpi.branded,
        value: Math.round(report.brandedSplit.brandedTraffic).toLocaleString(
          locale === "ko" ? "ko-KR" : "en-US",
        ),
        delta: null,
        spark: null,
        unavailableNote: copy.kpi.deltaUnavailable,
      },
      {
        key: "nonBranded",
        label: copy.kpi.nonBranded,
        value: Math.round(trafficTotal - report.brandedSplit.brandedTraffic).toLocaleString(
          locale === "ko" ? "ko-KR" : "en-US",
        ),
        delta: null,
        spark: null,
        unavailableNote: copy.kpi.deltaUnavailable,
      },
    ];
  }, [report, extras, copy, locale]);

  /* ---- 추세 차트 ---- */
  const trendPoints = useMemo<TrendPoint[]>(() => {
    const all = extras?.trendPoints ?? [];
    const window = PERIOD_MONTHS[trendPeriod];
    const sliced = window === null ? all : all.slice(-window);
    // 원본 x축 라벨 형식: "25년 12월" / "Dec 25"
    return sliced.map((p) => {
      const [year, month] = p.period.split("-");
      const label =
        locale === "ko"
          ? `${year.slice(2)}년 ${Number(month)}월`
          : new Intl.DateTimeFormat("en-US", { month: "short" }).format(
              new Date(Number(year), Number(month) - 1, 1),
            ) + ` ${year.slice(2)}`;
      return { ...p, period: label };
    });
  }, [extras, trendPeriod, locale]);

  /* ---- 상위 키워드 ---- */
  const totalTraffic = report?.brandedSplit.totalTraffic ?? 0;
  const topKeywordRows = useMemo<TopKeywordRow[]>(() => {
    if (!report) return [];
    return report.topKeywords.map((row) => {
      const features = extras?.keywordFeatures[row.keyword.toLowerCase().trim()] ??
        extras?.keywordFeatures[row.keyword] ?? [];
      return {
        keyword: row.keyword,
        href: `/analytics/keywordoverview/?keyword=${encodeURIComponent(row.keyword)}`,
        serpHref: `https://www.google.com/search?q=${encodeURIComponent(row.keyword)}`,
        position: row.position,
        sf: features.length > 0 ? features.length : null,
        sfTitle: features.length ? features.map(featureLabel).join(", ") : undefined,
        volume: row.volume > 0 ? row.volume : null,
        trafficPct: formatTrafficPct(row.trafficContribution, totalTraffic),
        hasSerpFeatures: features.length > 0,
      };
    });
  }, [report, extras, featureLabel, totalTraffic]);

  /* ---- 의도별 ---- */
  const intentRows = useMemo<IntentRow[]>(() => {
    if (!report) return [];
    const trafficByIntent = new Map<AnalyticsIntent, number>();
    for (const row of report.topKeywords) {
      trafficByIntent.set(row.intent, (trafficByIntent.get(row.intent) ?? 0) + row.trafficContribution);
    }
    return report.intentDistribution.map((row) => ({
      intent: row.intent,
      label: copy.intents.labels[row.intent],
      sharePct: row.share,
      keywords: row.keywords,
      traffic: Math.round(trafficByIntent.get(row.intent) ?? 0),
    }));
  }, [report, copy]);

  /* ---- 포지션 변동 ---- */
  const keywordHref = (keyword: string) =>
    `/analytics/keywordoverview/?keyword=${encodeURIComponent(keyword)}`;
  const changeSegments = useMemo(() => {
    const map = (rows: NonNullable<typeof extras>["positionChanges"]["new"]) =>
      rows.map((row) => ({ keyword: row.keyword, href: keywordHref(row.keyword), from: row.from, to: row.to, volume: null }));
    return {
      new: map(extras?.positionChanges.new ?? []),
      lost: map(extras?.positionChanges.lost ?? []),
      improved: map(extras?.positionChanges.improved ?? []),
      declined: map(extras?.positionChanges.declined ?? []),
    };
  }, [extras]);
  const serpChangeSegments = useMemo(
    () => ({
      new: (extras?.serpFeatureChanges.new ?? []).map((row) => ({
        keyword: row.keyword, href: keywordHref(row.keyword), from: row.from, to: row.to, volume: null,
      })),
      lost: (extras?.serpFeatureChanges.lost ?? []).map((row) => ({
        keyword: row.keyword, href: keywordHref(row.keyword), from: row.from, to: row.to, volume: null,
      })),
    }),
    [extras],
  );

  /* ---- SERP 트렌드 (이력 없음 → 빈 축 프레임) ---- */
  const serpTrendPoints = useMemo<SerpTrendPoint[]>(() => {
    const days = serpTrendPeriod === "1m" ? 31 : serpTrendPeriod === "6m" ? 26 : 24;
    const stepDays = serpTrendPeriod === "1m" ? 1 : serpTrendPeriod === "6m" ? 7 : 30;
    const out: SerpTrendPoint[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * stepDays);
      out.push({
        period: new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
          month: locale === "ko" ? "long" : "short",
          day: "numeric",
        }).format(d),
        aiOverview: null,
        featuredVideo: null,
        relatedQuestions: null,
      });
    }
    return out;
  }, [serpTrendPeriod, locale]);

  /* ---- SERP 구성 요소 그리드 ---- */
  const featureGrid = useMemo(() => {
    const counts = extras?.featureCounts ?? {};
    const observedKeys = Object.keys(counts);
    const orderedKeys = [
      ...FEATURE_ORDER,
      ...observedKeys.filter((key) => !(FEATURE_ORDER as readonly string[]).includes(key)),
    ];
    const linked: SerpFeatureItem[] = [];
    const notLinked: SerpFeatureItem[] = [];
    for (const key of orderedKeys) {
      const count = counts[key] ?? 0;
      const item: SerpFeatureItem = { key, label: featureLabel(key), keywords: count };
      // 관찰 실측이 있는 피처는 상단 그룹(원본의 활성 항목 위치)에, 미관찰은 하단 그룹에.
      if (count > 0) linked.push(item);
      else notLinked.push(item);
    }
    return { linked, notLinked };
  }, [extras, featureLabel]);

  /* ---- 상위 페이지/서브도메인 ---- */
  const { pageRows, subdomainRows } = useMemo(() => {
    const byUrl = new Map<string, { traffic: number; keywords: number }>();
    const byHost = new Map<string, { traffic: number; keywords: number }>();
    for (const row of report?.topKeywords ?? []) {
      const urlEntry = byUrl.get(row.url) ?? { traffic: 0, keywords: 0 };
      urlEntry.traffic += row.trafficContribution;
      urlEntry.keywords += 1;
      byUrl.set(row.url, urlEntry);
      const host = hostOf(row.url);
      const hostEntry = byHost.get(host) ?? { traffic: 0, keywords: 0 };
      hostEntry.traffic += row.trafficContribution;
      hostEntry.keywords += 1;
      byHost.set(host, hostEntry);
    }
    const pages: TopPageRow[] = [...byUrl.entries()]
      .toSorted((a, b) => b[1].traffic - a[1].traffic)
      .map(([url, entry]) => ({
        display: stripProtocol(url),
        href: url,
        trafficPct: formatTrafficPct(entry.traffic, totalTraffic),
        keywords: entry.keywords,
      }));
    const subdomains: TopPageRow[] = [...byHost.entries()]
      .toSorted((a, b) => b[1].traffic - a[1].traffic)
      .map(([host, entry]) => ({
        display: host,
        href: `https://${host}`,
        trafficPct: formatTrafficPct(entry.traffic, totalTraffic),
        keywords: entry.keywords,
      }));
    return { pageRows: pages, subdomainRows: subdomains };
  }, [report, totalTraffic]);

  /* ---- 경쟁자/버블 ---- */
  const competitorRows = useMemo<CompetitorRow[]>(
    () =>
      (extras?.competitors ?? []).map((row) => ({
        domain: row.domain,
        href: `https://${row.domain}`,
        commonKeywords: row.commonKeywords,
        levelPct: row.levelPct,
      })),
    [extras],
  );
  const bubbles = useMemo<BubbleRow[]>(() => {
    const rows = extras?.bubbles ?? [];
    const maxTraffic = Math.max(1, ...rows.map((row) => row.traffic));
    return rows.map((row) => ({
      domain: row.domain,
      keywords: row.keywords,
      traffic: Math.round(row.traffic * 100) / 100,
      r: 12 + Math.sqrt(row.traffic / maxTraffic) * 36,
    }));
  }, [extras]);

  /* ---- 필터 전환 ---- */
  const navigate = (next: { db?: string; device?: AnalyticsDevice }) => {
    const params = new URLSearchParams();
    params.set("domain", initialDomain);
    params.set("db", (next.db ?? initialCountry).toLowerCase());
    params.set("device", next.device ?? initialDevice);
    router.push(`/analytics/organic/overview/?${params.toString()}`);
  };

  if (!report) {
    return (
      <div className="min-h-full bg-white px-8 py-6">
        <h1 className="text-[20px] font-semibold" style={{ color: "rgba(1,5,0,0.898)" }}>
          {copy.titlePrefix} {initialDomain}
        </h1>
        <div className="mt-8 flex min-h-[280px] max-w-[1085px] flex-col items-center justify-center gap-2 rounded-[6px] border bg-white p-8 text-center" style={{ borderColor: "rgba(0,21,16,0.07)" }}>
          <p className="text-[14px] font-semibold" style={{ color: "rgba(1,5,0,0.898)" }}>{copy.notFound.title}</p>
          <p className="text-[12px]" style={{ color: "rgba(0,3,0,0.584)" }}>{copy.notFound.hint}</p>
          <OrganicLink href={`/analytics/overview/?domain=${encodeURIComponent(initialDomain)}`} className="mt-2">
            {copy.notFound.cta}
          </OrganicLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white pb-16">
      <div className="max-w-[1149px] px-8">
        <OrganicHeader
          domain={initialDomain}
          domainHref={`https://${initialDomain}`}
          onExportPdf={() => window.print()}
          copy={{
            breadcrumbs: [...copy.breadcrumbs],
            manual: copy.manual,
            feedback: copy.feedback,
            titlePrefix: copy.titlePrefix,
            exportPdf: copy.exportPdf,
          }}
        />
        <OrganicFilterBar
          databases={dbCounts.map((row) => ({ code: row.code, label: row.code, count: row.count }))}
          activeDb={initialCountry}
          onDbChange={(code) => navigate({ db: code })}
          device={initialDevice}
          onDeviceChange={(device) => navigate({ device })}
          dateLabel={dateLabel}
          currency="USD"
          copy={copy.filter}
        />
        <OrganicPageTabs
          tabs={copy.tabs.map((label, index) => ({ key: String(index), label }))}
          active="0"
        />

        <div className="mt-4 grid grid-cols-2 gap-4">
          <OrganicKpiRow items={kpiItems} />
          <OrganicTrendChart
            points={trendPoints}
            period={trendPeriod}
            onPeriodChange={setTrendPeriod}
            copy={{ title: copy.trend.title, legend: copy.trend.legend, periods: copy.periods, memo: copy.trend.memo, empty: copy.trend.empty }}
          />
          <TopKeywordsCard
            rows={topKeywordRows.slice(0, 5)}
            totalCount={report.metrics.organicKeywords}
            viewAllHref={`/analytics/keywordoverview/`}
            copy={copy.topKeywords}
          />
          <IntentKeywordsCard
            rows={intentRows}
            viewAllHref={`/analytics/keywordoverview/`}
            copy={{ title: copy.intents.title, headers: copy.intents.headers, noMore: copy.intents.noMore, viewAll: copy.intents.viewAll, empty: copy.intents.empty }}
          />
          <PositionChangesCard
            segments={changeSegments}
            copy={{ title: copy.changes.title, segments: copy.changes.segments, tableHeaders: copy.changes.tableHeaders, emptyTitle: copy.changes.emptyTitle, emptyHint: copy.changes.emptyHint }}
          />
          <SerpPositionChangesCard
            segments={serpChangeSegments}
            copy={{ title: copy.changes.serpTitle, segments: { new: copy.changes.segments.new, lost: copy.changes.segments.lost }, tableHeaders: copy.changes.tableHeaders, emptyTitle: copy.changes.emptyTitle, emptyHint: copy.changes.emptyHint }}
          />
          <SerpTrendsChart
            points={serpTrendPoints}
            period={serpTrendPeriod}
            onPeriodChange={setSerpTrendPeriod}
            viewAllHref="/analytics/keywordoverview/"
            copy={{ title: copy.serpTrends.title, features: copy.serpTrends.features, otherSelect: copy.serpTrends.otherSelect, periods: copy.periods, viewAll: copy.serpTrends.viewAll }}
          />
          <SerpFeaturesGrid
            linked={featureGrid.linked}
            notLinked={featureGrid.notLinked}
            copy={copy.featuresGrid}
          />
          <TopPagesCard
            rows={pageRows.slice(0, 5)}
            totalCount={pageRows.length}
            viewAllHref="/analytics/keywordoverview/"
            copy={copy.pages}
          />
          <TopSubdomainsCard
            rows={subdomainRows.slice(0, 5)}
            totalCount={subdomainRows.length}
            viewAllHref="/analytics/keywordoverview/"
            copy={copy.subdomains}
          />
          <CompetitorsCard
            rows={competitorRows}
            totalCount={extras?.competitorTotal ?? 0}
            viewAllHref="/analytics/keywordoverview/"
            copy={copy.competitors}
          />
          <PositioningMapCard bubbles={bubbles} copy={copy.map} />
        </div>
      </div>
    </div>
  );
}
