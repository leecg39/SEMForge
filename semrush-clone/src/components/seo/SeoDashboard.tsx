"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { api } from "@/lib/client-api";
import { normalizeDomain } from "@/lib/analytics/metrics";
import { cn } from "@/lib/utils";
import type { FolderMetricStrip } from "@/server/home";

/**
 * /seo/ 대시보드.
 * ko.semrush.com/seo/ 실측 구성(도메인 선택 바 + 도구 카드 그리드 + 추천 앱)을 따르되,
 * Site Audit/Position Tracking 카드는 워크스페이스 실데이터(/api/home/folder-metrics/,
 * /api/site-audits/, /api/position-tracking/)에 연결한다.
 */

interface SiteAuditCampaignRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  siteHealth: number | null;
  lastRunAt: string | null;
}

interface TrackingCampaignRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  visibility: number | null;
}

interface AuditState {
  domain: string;
  campaign: SiteAuditCampaignRow | null;
}

interface TrackingState {
  domain: string;
  campaign: TrackingCampaignRow | null;
  keywords: number | null;
}

const COPY = {
  ko: {
    title: "SEO 대시보드",
    domainBarLabel: "분석 대상 도메인",
    domainPlaceholder: "도메인 입력 (예: example.com)",
    apply: "적용",
    loadingData: "불러오는 중…",
    loadFailed: "데이터를 불러오지 못했습니다.",
    noFoldersHint: "폴더에 웹사이트를 추가하면 캠페인 데이터가 여기에 표시됩니다.",
    myTools: "내 도구",
    opportunities: "새로운 기회",
    whatsNew: "Semrush의 새로운 소식",
    recommendedApps: "나를 위한 추천 앱",
    allApps: "모든 앱 보기",
    domainRequired: "도메인을 입력해 주세요. 예: example.com",
    keywordRequired: "키워드를 입력해 주세요. 예: seo 도구",
    newBadge: "New",
    siteAudit: {
      title: "Site Audit",
      description: (domain: string) =>
        `${domain} 프로젝트의 기술적 SEO 문제를 파악하고 해결 방법에 대한 실용적인 팁을 받아 보세요.`,
      setup: "Site Audit 설정",
      open: "Site Audit 열기",
      health: "Site Health",
      status: "상태",
      lastRun: "마지막 실행",
      never: "실행 기록 없음",
    },
    positionTracking: {
      title: "Position Tracking",
      description: (domain: string) =>
        `${domain}의 가시성을 추적할 국가, 기기, 위치를 선택하세요.`,
      setup: "포지션 추적 설정",
      open: "포지션 추적 열기",
      visibility: "가시성",
      keywords: "추적 키워드",
    },
    organicResearch: {
      title: "Organic Research",
      description: (domain: string) => `${domain}에 대해 알아야 할 모든 정보를 알아보세요.`,
      inputLabel: "도메인",
      button: "자세히 보기",
    },
    keywordGap: {
      title: "Keyword Gap",
      description: (domain: string) => `${domain}을(를) 경쟁사와 비교하세요.`,
      inputLabel: "경쟁사 도메인",
      placeholder: "경쟁사 도메인 입력",
      button: "비교하기",
    },
    backlinks: {
      title: "Backlinks",
      description: (domain: string) => `${domain}의 백링크를 확인하세요.`,
      inputLabel: "도메인",
      button: "자세히 보기",
    },
    keywordMagic: {
      title: "Keyword Magic Tool",
      description: "수백만 개의 키워드 아이디어 얻기",
      inputLabel: "시드 키워드",
      placeholder: "키워드 입력",
      button: "검색",
    },
    strategyBuilder: {
      title: "Keyword Strategy Builder",
      description: "주제와 페이지에 대한 키워드 전략을 개발하세요.",
      inputLabel: "시드 키워드",
      placeholder: "키워드 입력",
      button: "키워드 전략 만들기",
    },
    swa: {
      title: "SEO Writing Assistant",
      description: "독창성과 가독성을 갖춘 SEO 최적화 콘텐츠를 만들어 보세요.",
      button: "내 텍스트 분석",
    },
    rank: {
      title: "RANK",
      description: "여러 국가와 검색 엔진에 대해 5,000개의 키워드를 추적하세요.",
      button: "지금 사용해 보기",
    },
    sensor: {
      title: "Sensor",
      description: "시장과 경쟁사에 대한 흥미로운 인사이트를 얻으세요.",
      button: "지금 사용해 보기",
    },
    auditStatus: {
      idle: "대기 중",
      queued: "대기",
      running: "실행 중",
      completed: "완료",
      failed: "실패",
    } as Record<string, string>,
    trackingStatus: {
      active: "활성",
      paused: "일시중지",
    } as Record<string, string>,
    free: "무료",
  },
  en: {
    title: "SEO Dashboard",
    domainBarLabel: "Domain being analyzed",
    domainPlaceholder: "Enter a domain, e.g. example.com",
    apply: "Apply",
    loadingData: "Loading…",
    loadFailed: "Could not load the data.",
    noFoldersHint: "Add a website to a folder to see campaign data here.",
    myTools: "My tools",
    opportunities: "New opportunities",
    whatsNew: "What's new at Semrush",
    recommendedApps: "Recommended apps for you",
    allApps: "View all apps",
    domainRequired: "Enter a domain, e.g. example.com",
    keywordRequired: "Enter a keyword, e.g. seo tools",
    newBadge: "New",
    siteAudit: {
      title: "Site Audit",
      description: (domain: string) =>
        `Find technical SEO issues on ${domain} and get practical tips on how to fix them.`,
      setup: "Set up Site Audit",
      open: "Open Site Audit",
      health: "Site Health",
      status: "Status",
      lastRun: "Last run",
      never: "Never run",
    },
    positionTracking: {
      title: "Position Tracking",
      description: (domain: string) =>
        `Choose the country, device, and location to track visibility for ${domain}.`,
      setup: "Set up tracking",
      open: "Open Position Tracking",
      visibility: "Visibility",
      keywords: "Tracked keywords",
    },
    organicResearch: {
      title: "Organic Research",
      description: (domain: string) => `Find out everything you need to know about ${domain}.`,
      inputLabel: "Domain",
      button: "View details",
    },
    keywordGap: {
      title: "Keyword Gap",
      description: (domain: string) => `Compare ${domain} with competitors.`,
      inputLabel: "Competitor domain",
      placeholder: "Enter a competitor domain",
      button: "Compare",
    },
    backlinks: {
      title: "Backlinks",
      description: (domain: string) => `Check the backlinks of ${domain}.`,
      inputLabel: "Domain",
      button: "View details",
    },
    keywordMagic: {
      title: "Keyword Magic Tool",
      description: "Get millions of keyword ideas",
      inputLabel: "Seed keyword",
      placeholder: "Enter a keyword",
      button: "Search",
    },
    strategyBuilder: {
      title: "Keyword Strategy Builder",
      description: "Develop a keyword strategy for your topics and pages.",
      inputLabel: "Seed keyword",
      placeholder: "Enter a keyword",
      button: "Create keyword strategy",
    },
    swa: {
      title: "SEO Writing Assistant",
      description: "Create SEO-optimized content with originality and readability.",
      button: "Analyze my text",
    },
    rank: {
      title: "RANK",
      description: "Track 5,000 keywords across multiple countries and search engines.",
      button: "Try it now",
    },
    sensor: {
      title: "Sensor",
      description: "Get interesting insights about the market and competitors.",
      button: "Try it now",
    },
    auditStatus: {
      idle: "Idle",
      queued: "Queued",
      running: "Running",
      completed: "Completed",
      failed: "Failed",
    } as Record<string, string>,
    trackingStatus: {
      active: "Active",
      paused: "Paused",
    } as Record<string, string>,
    free: "Free",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

const AUDIT_STATUS_TONE: Record<string, string> = {
  idle: "bg-[#eef0f2] text-a2-text-muted",
  queued: "bg-[#fdf3e0] text-[#8a5a00]",
  running: "bg-[#eaf3ff] text-app-blue",
  completed: "bg-[#e6f5f0] text-[#0a6b57]",
  failed: "bg-[#fdecef] text-[#a4002a]",
};

const TRACKING_STATUS_TONE: Record<string, string> = {
  active: "bg-[#e6f5f0] text-[#0a6b57]",
  paused: "bg-[#eef0f2] text-a2-text-muted",
};

const RECOMMENDED_APPS: {
  slug: string;
  color: string;
  rating: number;
  price: { ko: string; en: string };
  name: string;
  blurb: { ko: string; en: string };
}[] = [
  {
    slug: "ai-visibility-index",
    color: "#8649e1",
    rating: 4.6,
    price: { ko: "무료", en: "Free" },
    name: "AI Visibility Index",
    blurb: {
      ko: "AI 검색 결과에서 경쟁사와 브랜드 가시성을 비교 추적합니다.",
      en: "Benchmark your brand's visibility in AI search against competitors.",
    },
  },
  {
    slug: "seo-checker",
    color: "#008ff8",
    rating: 4.5,
    price: { ko: "무료", en: "Free" },
    name: "SEO Checker",
    blurb: {
      ko: "사이트의 SEO 성능을 측정하고 개선 팁을 받아 보세요.",
      en: "Measure your site's SEO performance and get improvement tips.",
    },
  },
  {
    slug: "seo-audit-improve-seo",
    color: "#00a87d",
    rating: 4.4,
    price: { ko: "무료", en: "Free" },
    name: "SEO Audit — Improve SEO",
    blurb: {
      ko: "페이지를 감사하고 검색 순위를 높일 기회를 찾습니다.",
      en: "Audit your pages and find opportunities to rank higher.",
    },
  },
  {
    slug: "media-monitoring-app",
    color: "#ff642d",
    rating: 4.3,
    price: { ko: "무료", en: "Free" },
    name: "Media Monitoring App",
    blurb: {
      ko: "웹과 소셜 미디어에서 브랜드 언급을 실시간으로 추적합니다.",
      en: "Track brand mentions across the web and social media in real time.",
    },
  },
  {
    slug: "on-page-seo-checker",
    color: "#235fe2",
    rating: 4.5,
    price: { ko: "무료", en: "Free" },
    name: "On Page SEO Checker",
    blurb: {
      ko: "페이지별 SEO 아이디어와 최적화 체크리스트를 확인합니다.",
      en: "Get page-level SEO ideas and an optimization checklist.",
    },
  },
  {
    slug: "content-marketplace",
    color: "#009f81",
    rating: 4.2,
    price: { ko: "콘텐츠당 $40~", en: "From $40/piece" },
    name: "Content Marketplace",
    blurb: {
      ko: "전문 작가에게 SEO 콘텐츠를 주문하세요.",
      en: "Order SEO content from professional writers.",
    },
  },
];

/* ---------------------------- 아이콘 ---------------------------- */

function ToolIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: color }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

const ICONS = {
  audit: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
      <path d="m8.6 11 1.7 1.7 3-3.4" />
    </>
  ),
  tracking: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  organic: (
    <>
      <path d="M4 16.5l4.5-5 3.5 3 6-7" />
      <path d="M14.5 7.5H18V11" />
    </>
  ),
  gap: (
    <>
      <rect x="4" y="10" width="4.5" height="10" rx="1" />
      <rect x="15.5" y="4" width="4.5" height="16" rx="1" />
    </>
  ),
  backlinks: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7.4l2.3-2.3a4 4 0 0 0-5.6-5.6l-1.2 1.1" />
      <path d="M14 10a4 4 0 0 0-5.7-.4L6 11.9a4 4 0 0 0 5.6 5.6l1.2-1.1" />
    </>
  ),
  magic: (
    <>
      <path d="m5 19 10.5-10.5" />
      <path d="m14 4 .9 2.1L17 7l-2.1.9L14 10l-.9-2.1L11 7l2.1-.9L14 4Z" />
      <path d="m19 11 .6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6L19 11Z" />
    </>
  ),
  strategy: (
    <>
      <path d="m12 3 8.5 4.2L12 11.5 3.5 7.2 12 3Z" />
      <path d="m3.5 11.5 8.5 4.3 8.5-4.3" />
      <path d="m3.5 15.8 8.5 4.2 8.5-4.2" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z" />
      <path d="m13.5 8.5 3 3" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="9" r="4.5" />
      <path d="m9 13-2.2 7 4-2.3h2.4l4 2.3L17 13" />
    </>
  ),
  pulse: <path d="M3 12h4l2.2-6 4 12 2.2-6H21" />,
};

/* --------------------------- 공통 부품 --------------------------- */

function ToolCard({
  icon,
  title,
  badge,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-[12px] bg-a2-card p-[20px] shadow-[var(--a2-card-shadow)]">
      <div className="flex items-center gap-[10px]">
        {icon}
        <h3 className="text-[15px] font-semibold leading-[20px] text-a2-text">{title}</h3>
        {badge && (
          <span className="rounded-[4px] bg-[#e6f5f0] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-[#0a6b57]">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2.5 flex-1 text-[13px] leading-[19px] text-a2-text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const primaryButtonClass =
  "inline-flex h-[36px] items-center justify-center rounded-[8px] bg-app-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-app-blue-dark";

const outlineLinkClass =
  "inline-flex h-[36px] items-center justify-center rounded-[8px] border border-[var(--a2-btn-border)] bg-a2-btn-bg px-4 text-[13px] font-medium text-a2-text transition-colors hover:bg-[rgba(0,22,16,0.06)]";

/** 입력 + 버튼으로 구성된 이동형 카드의 폼. 입력값을 쿼리로 붙여 대상 페이지로 이동한다. */
function InputNavForm({
  formKey,
  inputLabel,
  placeholder,
  presetValue,
  buttonLabel,
  emptyMessage,
  buildHref,
  domainMode,
}: {
  formKey: string;
  inputLabel: string;
  placeholder?: string;
  presetValue?: string;
  buttonLabel: string;
  emptyMessage: string;
  buildHref: (value: string) => string;
  /** true 이면 도메인 정규화 + 점 포함 검증을 적용한다. */
  domainMode?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(presetValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputId = `seo-nav-${formKey}`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(emptyMessage);
      return;
    }
    const finalValue = domainMode ? normalizeDomain(trimmed) : trimmed;
    if (domainMode && !finalValue.includes(".")) {
      setError(emptyMessage);
      return;
    }
    setError(null);
    router.push(buildHref(finalValue));
  };

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={inputId} className="mb-1.5 block text-[12px] font-medium text-a2-text-muted">
        {inputLabel}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className="h-[36px] min-w-0 flex-1 rounded-[8px] border border-app-border bg-white px-3 text-[13px] text-a2-text placeholder:text-a2-text-faint focus:border-app-blue focus:outline-none"
        />
        <button type="submit" className={cn(primaryButtonClass, "shrink-0")}>
          {buttonLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] text-app-red">
          {error}
        </p>
      )}
    </form>
  );
}

function StatBlock({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.4px] text-a2-text-faint">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-[20px] font-semibold leading-[26px] text-a2-text", tone)}>
        {value}
      </dd>
    </div>
  );
}

function healthTone(value: number): string {
  if (value >= 80) return "text-[#0a6b57]";
  if (value >= 50) return "text-[#b45309]";
  return "text-[#a4002a]";
}

/* ---------------------------- 메인 ---------------------------- */

export function SeoDashboard({ initialDomain }: { initialDomain?: string }) {
  const { locale } = useLocale();
  const copy: Copy = COPY[locale];

  const [strips, setStrips] = useState<FolderMetricStrip[] | null>(null);
  const [stripsFailed, setStripsFailed] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(initialDomain ?? "");
  const [customDomain, setCustomDomain] = useState("");
  const [customDomainError, setCustomDomainError] = useState<string | null>(null);
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [trackingState, setTrackingState] = useState<TrackingState | null>(null);

  // 폴더별 지표 스트립: 대시보드의 도메인 목록 + 카드 데이터의 기준 소스.
  useEffect(() => {
    let cancelled = false;
    api
      .get<FolderMetricStrip[]>("/api/home/folder-metrics/")
      .then((response) => {
        if (!cancelled) setStrips(response.data);
      })
      .catch(() => {
        if (!cancelled) setStripsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 쿼리 파라미터 도메인이 없으면 워크스페이스 첫 폴더 도메인을 기본값으로 쓴다 (파생값, 별도 상태 없음).
  const effectiveDomain =
    selectedDomain || (strips && strips.length > 0 ? strips[0].domain : "");

  const domainOptions = useMemo(() => {
    const domains = (strips ?? []).map((strip) => strip.domain);
    if (effectiveDomain && !domains.includes(effectiveDomain)) {
      return [effectiveDomain, ...domains];
    }
    return domains;
  }, [strips, effectiveDomain]);

  // 선택 도메인이 바뀌면 URL 도 동기화해 공유/새로고침 시 같은 상태가 유지되게 한다.
  useEffect(() => {
    if (!effectiveDomain) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?domain=${encodeURIComponent(effectiveDomain)}`
    );
  }, [effectiveDomain]);

  // Site Audit 카드: 도메인 검색으로 최신 감사 캠페인을 가져온다.
  // (folderId 필터만 쓰면 폴더에 연결되지 않은 캠페인을 놓치므로 q 검색 후 도메인 일치 항목을 고른다.)
  useEffect(() => {
    if (!effectiveDomain) return;
    let cancelled = false;
    api
      .get<SiteAuditCampaignRow[]>(
        `/api/site-audits/?q=${encodeURIComponent(effectiveDomain)}&sort=updatedAt:desc&pageSize=10`
      )
      .then((response) => {
        if (cancelled) return;
        const campaign =
          response.data.find((row) => row.domain === effectiveDomain) ?? null;
        setAuditState({ domain: effectiveDomain, campaign });
      })
      .catch(() => {
        if (!cancelled) setAuditState({ domain: effectiveDomain, campaign: null });
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveDomain]);

  // Position Tracking 카드: 도메인 검색으로 최신 추적 캠페인 + 추적 키워드 수를 가져온다.
  useEffect(() => {
    if (!effectiveDomain) return;
    let cancelled = false;
    api
      .get<TrackingCampaignRow[]>(
        `/api/position-tracking/?q=${encodeURIComponent(effectiveDomain)}&sort=updatedAt:desc&pageSize=10`
      )
      .then(async (response) => {
        const campaign =
          response.data.find((row) => row.domain === effectiveDomain) ?? null;
        if (cancelled) return;
        if (!campaign) {
          setTrackingState({ domain: effectiveDomain, campaign: null, keywords: null });
          return;
        }
        try {
          const keywords = await api.get<unknown[]>(
            `/api/position-tracking/${encodeURIComponent(campaign.id)}/keywords/`
          );
          if (!cancelled) {
            setTrackingState({ domain: effectiveDomain, campaign, keywords: keywords.data.length });
          }
        } catch {
          if (!cancelled) {
            setTrackingState({ domain: effectiveDomain, campaign, keywords: null });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setTrackingState({ domain: effectiveDomain, campaign: null, keywords: null });
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveDomain]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [locale]
  );
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );

  const displayDomain = effectiveDomain || "—";
  const auditReady = effectiveDomain !== "" && auditState?.domain === effectiveDomain;
  const trackingReady = effectiveDomain !== "" && trackingState?.domain === effectiveDomain;
  // 워크스페이스 지표를 아직 불러오는 중이면 데이터 카드도 로딩 상태를 유지한다.
  const stripsLoading = strips === null && !stripsFailed;

  const applyCustomDomain = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeDomain(customDomain);
    if (!normalized.includes(".")) {
      setCustomDomainError(copy.domainRequired);
      return;
    }
    setCustomDomainError(null);
    setSelectedDomain(normalized);
  };

  const withDomain = (base: string, extra?: Record<string, string>) => (value: string) => {
    const params = new URLSearchParams({ domain: value, ...extra });
    return `${base}?${params.toString()}`;
  };
  const withKeyword = (base: string) => (value: string) =>
    `${base}?keyword=${encodeURIComponent(value)}`;

  return (
    <div className="p-6">
      {/* 헤더: 제목 + 날짜 */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[24px] font-semibold leading-[32px] text-a2-text">{copy.title}</h1>
        <p className="text-[13px] text-a2-text-muted">{dateFormatter.format(new Date())}</p>
      </header>

      {/* 도메인 선택 바 */}
      <section
        aria-label={copy.domainBarLabel}
        className="mt-4 flex flex-wrap items-center gap-3 rounded-[12px] bg-a2-card px-[20px] py-[14px] shadow-[var(--a2-card-shadow)]"
      >
        <span
          aria-hidden="true"
          className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-[#eaf3ff] text-app-blue"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.5 12h17" />
            <path d="M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5Z" />
          </svg>
        </span>
        <span className="text-[13px] font-medium text-a2-text-muted">{copy.domainBarLabel}</span>
        {domainOptions.length > 0 ? (
          <select
            value={effectiveDomain}
            onChange={(event) => setSelectedDomain(event.target.value)}
            className="h-[36px] min-w-[220px] rounded-[8px] border border-app-border bg-white px-3 text-[14px] font-medium text-a2-text focus:border-app-blue focus:outline-none"
          >
            {domainOptions.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        ) : (
          <form onSubmit={applyCustomDomain} noValidate className="flex min-w-[260px] flex-1 gap-2">
            <input
              type="text"
              value={customDomain}
              onChange={(event) => {
                setCustomDomain(event.target.value);
                if (customDomainError) setCustomDomainError(null);
              }}
              placeholder={copy.domainPlaceholder}
              aria-label={copy.domainBarLabel}
              aria-invalid={Boolean(customDomainError)}
              className="h-[36px] min-w-0 flex-1 rounded-[8px] border border-app-border bg-white px-3 text-[14px] text-a2-text placeholder:text-a2-text-faint focus:border-app-blue focus:outline-none"
            />
            <button type="submit" className={cn(primaryButtonClass, "shrink-0")}>
              {copy.apply}
            </button>
          </form>
        )}
        {customDomainError && (
          <p role="alert" className="w-full text-[12px] text-app-red">
            {customDomainError}
          </p>
        )}
        {stripsFailed && <p className="text-[12px] text-app-red">{copy.loadFailed}</p>}
      </section>

      {/* 내 도구 */}
      <h2 className="mt-8 text-[16px] font-semibold leading-[22px] text-a2-text">{copy.myTools}</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Site Audit */}
        <ToolCard
          icon={<ToolIcon color="#ff642d">{ICONS.audit}</ToolIcon>}
          title={copy.siteAudit.title}
          description={copy.siteAudit.description(displayDomain)}
        >
          {stripsLoading || (effectiveDomain !== "" && !auditReady) ? (
            <p className="text-[13px] text-a2-text-faint">{copy.loadingData}</p>
          ) : auditState?.campaign ? (
            <div>
              <dl className="flex flex-wrap items-start gap-x-8 gap-y-3">
                <StatBlock
                  label={copy.siteAudit.health}
                  value={
                    auditState.campaign.siteHealth !== null ? (
                      auditState.campaign.siteHealth
                    ) : (
                      <span className="text-a2-text-faint">n/a</span>
                    )
                  }
                  tone={
                    auditState.campaign.siteHealth !== null
                      ? healthTone(auditState.campaign.siteHealth)
                      : undefined
                  }
                />
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.4px] text-a2-text-faint">
                    {copy.siteAudit.status}
                  </dt>
                  <dd className="mt-1">
                    <span
                      className={cn(
                        "rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium",
                        AUDIT_STATUS_TONE[auditState.campaign.status] ??
                          "bg-[#eef0f2] text-a2-text-muted"
                      )}
                    >
                      {copy.auditStatus[auditState.campaign.status] ?? auditState.campaign.status}
                    </span>
                  </dd>
                </div>
                <StatBlock
                  label={copy.siteAudit.lastRun}
                  value={
                    auditState.campaign.lastRunAt ? (
                      <span className="text-[14px] font-medium leading-[26px]">
                        {dateTimeFormatter.format(new Date(auditState.campaign.lastRunAt))}
                      </span>
                    ) : (
                      <span className="text-[13px] font-normal text-a2-text-faint">
                        {copy.siteAudit.never}
                      </span>
                    )
                  }
                />
              </dl>
              <Link href="/app/site-audits/" className={cn(outlineLinkClass, "mt-4")}>
                {copy.siteAudit.open}
              </Link>
            </div>
          ) : (
            <Link href="/app/site-audits/" className={primaryButtonClass}>
              {copy.siteAudit.setup}
            </Link>
          )}
        </ToolCard>

        {/* Position Tracking */}
        <ToolCard
          icon={<ToolIcon color="#008ff8">{ICONS.tracking}</ToolIcon>}
          title={copy.positionTracking.title}
          description={copy.positionTracking.description(displayDomain)}
        >
          {stripsLoading || (effectiveDomain !== "" && !trackingReady) ? (
            <p className="text-[13px] text-a2-text-faint">{copy.loadingData}</p>
          ) : trackingState?.campaign ? (
            <div>
              <dl className="flex flex-wrap items-start gap-x-8 gap-y-3">
                <StatBlock
                  label={copy.positionTracking.visibility}
                  value={
                    trackingState.campaign.visibility !== null ? (
                      `${trackingState.campaign.visibility}%`
                    ) : (
                      <span className="text-a2-text-faint">n/a</span>
                    )
                  }
                />
                <StatBlock
                  label={copy.positionTracking.keywords}
                  value={
                    trackingState.keywords !== null ? (
                      trackingState.keywords.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")
                    ) : (
                      <span className="text-a2-text-faint">—</span>
                    )
                  }
                />
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.4px] text-a2-text-faint">
                    {copy.siteAudit.status}
                  </dt>
                  <dd className="mt-1">
                    <span
                      className={cn(
                        "rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium",
                        TRACKING_STATUS_TONE[trackingState.campaign.status] ??
                          "bg-[#eef0f2] text-a2-text-muted"
                      )}
                    >
                      {copy.trackingStatus[trackingState.campaign.status] ??
                        trackingState.campaign.status}
                    </span>
                  </dd>
                </div>
              </dl>
              <Link href="/position-tracking/" className={cn(outlineLinkClass, "mt-4")}>
                {copy.positionTracking.open}
              </Link>
            </div>
          ) : (
            <Link href="/app/position-tracking/" className={primaryButtonClass}>
              {copy.positionTracking.setup}
            </Link>
          )}
        </ToolCard>

        {/* Organic Research */}
        <ToolCard
          icon={<ToolIcon color="#00a87d">{ICONS.organic}</ToolIcon>}
          title={copy.organicResearch.title}
          description={copy.organicResearch.description(displayDomain)}
        >
          <InputNavForm
            key={`organic:${effectiveDomain}`}
            formKey="organic"
            inputLabel={copy.organicResearch.inputLabel}
            presetValue={effectiveDomain}
            buttonLabel={copy.organicResearch.button}
            emptyMessage={copy.domainRequired}
            domainMode
            buildHref={withDomain("/analytics/overview/")}
          />
        </ToolCard>

        {/* Keyword Gap */}
        <ToolCard
          icon={<ToolIcon color="#8649e1">{ICONS.gap}</ToolIcon>}
          title={copy.keywordGap.title}
          description={copy.keywordGap.description(displayDomain)}
        >
          <InputNavForm
            formKey="keyword-gap"
            inputLabel={copy.keywordGap.inputLabel}
            placeholder={copy.keywordGap.placeholder}
            buttonLabel={copy.keywordGap.button}
            emptyMessage={copy.domainRequired}
            domainMode
            buildHref={(competitor) => {
              const params = new URLSearchParams();
              if (effectiveDomain) params.set("domain", effectiveDomain);
              params.set("competitor", competitor);
              return `/analytics/comparedomains/?${params.toString()}`;
            }}
          />
        </ToolCard>

        {/* Backlinks */}
        <ToolCard
          icon={<ToolIcon color="#235fe2">{ICONS.backlinks}</ToolIcon>}
          title={copy.backlinks.title}
          description={copy.backlinks.description(displayDomain)}
        >
          <InputNavForm
            key={`backlinks:${effectiveDomain}`}
            formKey="backlinks"
            inputLabel={copy.backlinks.inputLabel}
            presetValue={effectiveDomain}
            buttonLabel={copy.backlinks.button}
            emptyMessage={copy.domainRequired}
            domainMode
            buildHref={withDomain("/analytics/backlinks/overview/")}
          />
        </ToolCard>
      </div>

      {/* 새로운 기회 */}
      <h2 className="mt-8 text-[16px] font-semibold leading-[22px] text-a2-text">
        {copy.opportunities}
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ToolCard
          icon={<ToolIcon color="#ff642d">{ICONS.magic}</ToolIcon>}
          title={copy.keywordMagic.title}
          description={copy.keywordMagic.description}
        >
          <InputNavForm
            formKey="keyword-magic"
            inputLabel={copy.keywordMagic.inputLabel}
            placeholder={copy.keywordMagic.placeholder}
            buttonLabel={copy.keywordMagic.button}
            emptyMessage={copy.keywordRequired}
            buildHref={withKeyword("/analytics/keywordmagic/")}
          />
        </ToolCard>

        <ToolCard
          icon={<ToolIcon color="#009f81">{ICONS.strategy}</ToolIcon>}
          title={copy.strategyBuilder.title}
          description={copy.strategyBuilder.description}
        >
          <InputNavForm
            formKey="strategy-builder"
            inputLabel={copy.strategyBuilder.inputLabel}
            placeholder={copy.strategyBuilder.placeholder}
            buttonLabel={copy.strategyBuilder.button}
            emptyMessage={copy.keywordRequired}
            buildHref={withKeyword("/analytics/keywordmanager/")}
          />
        </ToolCard>

        <ToolCard
          icon={<ToolIcon color="#8649e1">{ICONS.pen}</ToolIcon>}
          title={copy.swa.title}
          description={copy.swa.description}
        >
          <Link href="/swa/" className={primaryButtonClass}>
            {copy.swa.button}
          </Link>
        </ToolCard>
      </div>

      {/* Semrush의 새로운 소식 */}
      <h2 className="mt-8 text-[16px] font-semibold leading-[22px] text-a2-text">
        {copy.whatsNew}
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ToolCard
          icon={<ToolIcon color="#d1002f">{ICONS.medal}</ToolIcon>}
          title={copy.rank.title}
          badge={copy.newBadge}
          description={copy.rank.description}
        >
          <Link href="/analytics/ranks/rank/" className={primaryButtonClass}>
            {copy.rank.button}
          </Link>
        </ToolCard>

        <ToolCard
          icon={<ToolIcon color="#008ff8">{ICONS.pulse}</ToolIcon>}
          title={copy.sensor.title}
          description={copy.sensor.description}
        >
          <Link href="/sensor/" className={primaryButtonClass}>
            {copy.sensor.button}
          </Link>
        </ToolCard>
      </div>

      {/* 나를 위한 추천 앱 */}
      <div className="mt-8 flex items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold leading-[22px] text-a2-text">
          {copy.recommendedApps}
        </h2>
        <Link href="/apps/" className="text-[13px] font-medium text-app-blue hover:underline">
          {copy.allApps}
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {RECOMMENDED_APPS.map((app) => (
          <Link
            key={app.slug}
            href={`/apps/${app.slug}/`}
            className="flex items-start gap-3 rounded-[12px] bg-a2-card p-[16px] shadow-[var(--a2-card-shadow)] transition-shadow hover:shadow-[var(--aurea-shadow-3,var(--a2-card-shadow))]"
          >
            <span
              aria-hidden="true"
              className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] text-[16px] font-bold text-white"
              style={{ backgroundColor: app.color }}
            >
              {app.name.charAt(0)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold leading-[20px] text-a2-text">
                {app.name}
              </span>
              <span className="mt-0.5 block text-[12px] leading-[17px] text-a2-text-muted">
                {app.blurb[locale]}
              </span>
              <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-a2-text-faint">
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="#fdc23c"
                >
                  <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
                </svg>
                <span className="font-medium text-a2-text-muted">{app.rating.toFixed(1)}</span>
                <span aria-hidden="true">·</span>
                <span>{app.price[locale]}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>

      {strips !== null && strips.length === 0 && (
        <p className="mt-6 text-[13px] text-a2-text-faint">{copy.noFoldersHint}</p>
      )}
    </div>
  );
}
