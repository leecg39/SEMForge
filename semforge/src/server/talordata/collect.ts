import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  keywordMetrics,
  positionTrackingCampaigns,
  positionTrackingCompetitors,
  positionTrackingVisibilityHistory,
  serpSnapshots,
  trackedKeywords,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { classifyIntent } from "@/lib/analytics/intent";
import { ctrForPosition, normalizeDomain } from "@/lib/analytics/metrics";
import type { AnalyticsIntent } from "@/lib/analytics/types";
import { newId } from "@/lib/ids";
import type { AuthContext } from "@/lib/session";
import {
  fetchSerp,
  type AiOverviewInfo,
  type LocalResultItem,
  type SerpEngine,
  type SerpOrganicItem,
} from "@/server/talordata/client";

/**
 * TalorData 실시간 SERP 수집기.
 *
 * 수집 결과는 원천 스토어 규약(docs/data-architecture.md)을 따른다.
 *   - keyword_metrics : 검색량은 외부 소스가 없으면 0 으로 두고 source 로 구분
 *   - serp_snapshots  : 동일 시점 순위 행을 append-only 로 보존 (source="talordata")
 *   - tracked_keywords: 캠페인 도메인의 순위를 position/previousPosition 에 반영
 */

const MAX_KEYWORDS_PER_RUN = 20;
/** 도메인 분석 실시간 수집은 크레딧 보호를 위해 소수 키워드만 사용한다. */
const MAX_DOMAIN_SEED_KEYWORDS = 5;
/**
 * SERP 스냅샷 신선도(TTL). 같은 키워드+국가+기기+엔진의 라이브 스냅샷이
 * 이 시간 안에 있으면 외부 API 를 호출하지 않고 스냅샷을 재사용한다.
 * Semrush 도 순위 데이터는 일 단위로 갱신하므로 24시간이 기본값이다.
 */
export const SERP_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

function currentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

async function upsertKeywordMetric(input: {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  volume?: number | null;
  /** clone-intent-v1 분류 결과. 신규 행에만 기록한다 (기존 행은 관측치 보존). */
  intent?: AnalyticsIntent;
}): Promise<string> {
  const normalized = normalizeKeyword(input.keyword);
  const periodStart = currentMonthStart();
  const [existing] = await db
    .select({ id: keywordMetrics.id, volume: keywordMetrics.volume })
    .from(keywordMetrics)
    .where(
      and(
        eq(keywordMetrics.normalizedKeyword, normalized),
        eq(keywordMetrics.countryCode, input.countryCode),
        eq(keywordMetrics.device, input.device),
        eq(keywordMetrics.periodStart, periodStart)
      )
    )
    .limit(1);

  if (existing) {
    // 시드/이전 수집에서 검색량이 0 이었고 이번에 값을 알게 된 경우에만 채운다.
    if (existing.volume === 0 && input.volume && input.volume > 0) {
      await db
        .update(keywordMetrics)
        .set({ volume: input.volume, updatedAt: new Date() })
        .where(eq(keywordMetrics.id, existing.id));
    }
    return existing.id;
  }

  const id = newId("kwd");
  await db.insert(keywordMetrics).values({
    id,
    keyword: input.keyword.trim(),
    normalizedKeyword: normalized,
    countryCode: input.countryCode,
    device: input.device,
    periodStart,
    volume: Math.max(0, input.volume ?? 0),
    intent: input.intent ?? "informational",
    source: "talordata-serp",
  });
  return id;
}

export interface KeywordSerpCollection {
  keywordMetricId: string;
  capturedAt: Date;
  results: SerpOrganicItem[];
  features: string[];
  /**
   * AIO 출현/인용 정보. 캐시 재사용 시에는 스냅샷에 인용 소스가 저장되지
   * 않아 출현 여부(features)만 복원되고 인용은 판정 불가로 둔다.
   */
  aiOverview?: AiOverviewInfo;
  /**
   * 로컬팩 업체 목록. 캐시 재사용 시에는 스냅샷에 업체 목록이 저장되지
   * 않아 빈 배열이며, 팩 출현 여부는 features 의 local_pack 으로만 복원된다.
   */
  localResults?: LocalResultItem[];
  /** true 면 TTL 이내의 기존 스냅샷을 재사용했다 (외부 API 미호출). */
  fromCache: boolean;
}

/** TTL 이내의 최신 라이브(talordata) 스냅샷을 SERP 결과 형태로 복원한다. */
async function findFreshSnapshot(input: {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: SerpEngine;
  maxAgeMs: number;
}): Promise<Omit<KeywordSerpCollection, "fromCache"> | null> {
  const normalized = normalizeKeyword(input.keyword);
  // 신규 수집은 현재 월(periodStart) metric 에만 적재되므로, 캐시 판정도 같은
  // 월 스코프로 제한한다. 월말 24시간 안쪽에서 이전 월 스냅샷을 캐시로 돌려주면
  // 현재 월 metric 에는 라이브 데이터가 없는 상태가 되어 Keyword Overview 와
  // Domain Analytics 가 서로 다른 SERP 를 보여주는 문제를 막는다.
  const metricRows = await db
    .select({ id: keywordMetrics.id })
    .from(keywordMetrics)
    .where(
      and(
        eq(keywordMetrics.normalizedKeyword, normalized),
        eq(keywordMetrics.countryCode, input.countryCode),
        eq(keywordMetrics.device, input.device),
        eq(keywordMetrics.periodStart, currentMonthStart())
      )
    );
  if (metricRows.length === 0) return null;

  const [latest] = await db
    .select({
      keywordMetricId: serpSnapshots.keywordMetricId,
      capturedAt: serpSnapshots.capturedAt,
    })
    .from(serpSnapshots)
    .where(
      and(
        inArray(
          serpSnapshots.keywordMetricId,
          metricRows.map((row) => row.id)
        ),
        eq(serpSnapshots.searchEngine, input.engine),
        // 시드/데모 스냅샷에 캐시 히트가 되면 라이브 수집이 영영 일어나지 않으므로
        // 라이브 소스만 신선도 판정에 사용한다.
        eq(serpSnapshots.source, "talordata")
      )
    )
    .orderBy(desc(serpSnapshots.capturedAt))
    .limit(1);
  if (!latest) return null;
  if (Date.now() - latest.capturedAt.getTime() > input.maxAgeMs) return null;

  const rows = await db
    .select()
    .from(serpSnapshots)
    .where(
      and(
        eq(serpSnapshots.keywordMetricId, latest.keywordMetricId),
        eq(serpSnapshots.searchEngine, input.engine),
        eq(serpSnapshots.capturedAt, latest.capturedAt),
        eq(serpSnapshots.source, "talordata")
      )
    )
    .orderBy(asc(serpSnapshots.position));
  if (rows.length === 0) return null;

  const cachedFeatures = parseSerpFeatures(rows[0].serpFeatures);
  return {
    keywordMetricId: latest.keywordMetricId,
    capturedAt: latest.capturedAt,
    results: rows
      .filter((row) => !row.isAd)
      .map((row) => ({
        position: row.position,
        title: row.title ?? "",
        link: row.url,
        domain: row.domain,
        displayLink: null,
        description: row.description,
      })),
    features: cachedFeatures,
    aiOverview: {
      present: cachedFeatures.includes("ai_overview"),
      citationsAvailable: false,
      citations: [],
    },
    localResults: [],
  };
}

/**
 * 단일 키워드의 실시간 SERP 를 수집해 원천 스토어에 적재한다.
 *
 * 크레딧 보호: 같은 조건의 라이브 스냅샷이 maxAgeMs(기본 24시간) 이내에 있으면
 * API 를 호출하지 않고 스냅샷을 그대로 반환한다. forceRefresh 로 강제 재수집한다.
 */
export async function collectKeywordSerp(input: {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine?: "google" | "bing";
  num?: number;
  volume?: number | null;
  forceRefresh?: boolean;
  maxAgeMs?: number;
}): Promise<KeywordSerpCollection> {
  const engine = input.engine ?? "google";

  if (!input.forceRefresh) {
    const cached = await findFreshSnapshot({
      keyword: input.keyword,
      countryCode: input.countryCode,
      device: input.device,
      engine,
      maxAgeMs: input.maxAgeMs ?? SERP_SNAPSHOT_TTL_MS,
    });
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const serp = await fetchSerp({
    q: input.keyword,
    engine,
    num: input.num ?? 10,
    gl: input.countryCode.toLowerCase(),
    hl: input.countryCode.toUpperCase() === "KR" ? "ko" : "en",
    device: input.device,
  });

  // SERP 피처까지 반영해 의도를 분류하고 신규 metric 행에 기록한다 (clone-intent-v1).
  const keywordMetricId = await upsertKeywordMetric({
    ...input,
    intent: classifyIntent({ keyword: input.keyword, serpFeatures: serp.features }).intent,
  });
  if (serp.organic.length > 0) {
    // 동시 수집이나 동일 밀리초의 재수집은 (metric, engine, capturedAt,
    // position, isAd) 유니크 제약과 충돌할 수 있다 — 스냅샷은 append-only
    // 관측치이므로 충돌 행은 조용히 건너뛰고 수집을 실패시키지 않는다.
    await db
      .insert(serpSnapshots)
      .values(
        serp.organic.map((item) => ({
          id: newId("srp"),
          keywordMetricId,
          searchEngine: serp.engine,
          domain: item.domain || item.link,
          url: item.link,
          position: item.position,
          isAd: false,
          title: item.title || null,
          description: item.description,
          serpFeatures: JSON.stringify(serp.features),
          source: "talordata",
          capturedAt: serp.capturedAt,
        }))
      )
      .onConflictDoNothing();
  }

  return {
    keywordMetricId,
    capturedAt: serp.capturedAt,
    results: serp.organic,
    features: serp.features,
    aiOverview: serp.aiOverview,
    localResults: serp.localResults,
    fromCache: false,
  };
}

function findDomainPosition(
  results: SerpOrganicItem[],
  targetDomain: string
): { position: number; url: string } | null {
  const target = normalizeDomain(targetDomain);
  if (!target) return null;
  for (const item of results) {
    if (item.domain === target || item.domain.endsWith(`.${target}`)) {
      return { position: item.position, url: item.link };
    }
  }
  return null;
}

function inferCountryCode(location: string | null | undefined): string {
  if (!location) return "KR";
  return /korea|seoul|대한|서울/i.test(location) ? "KR" : "US";
}

/** 같은 SERP 스냅샷에서 계산한 경쟁사 순위 (추가 API 비용 없음). */
export interface CompetitorPosition {
  competitorId: string;
  domain: string;
  position: number | null;
  url: string | null;
}

export interface CampaignCollectOutcome {
  keyword: string;
  trackedKeywordId: string;
  position: number | null;
  previousPosition: number | null;
  url: string | null;
  /** 이 키워드 SERP 에서 감지된 피처 (ai_overview, local_pack 등) */
  features?: string[];
  competitorPositions?: CompetitorPosition[];
  error?: string;
}

export interface CampaignCollectReport {
  campaignId: string;
  campaignName: string;
  domain: string;
  engine: string;
  collected: number;
  failed: number;
  /** 수집 결과로 계산한 간이 가시성 지수 (0~100). */
  visibility: number;
  outcomes: CampaignCollectOutcome[];
  capturedAt: string;
}

/** 캠페인의 추적 키워드 전체를 순회하며 실시간 순위를 수집·반영한다. */
export async function collectCampaignRankings(
  auth: AuthContext,
  campaignId: string
): Promise<CampaignCollectReport> {
  const [campaign] = await db
    .select()
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  if (campaign.searchEngine === "chatgpt") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "ChatGPT 엔진은 SERP API 로 수집할 수 없습니다. Google/Bing 캠페인에서 수집하세요."
    );
  }

  const keywords = await db
    .select()
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt)
      )
    )
    .orderBy(desc(trackedKeywords.createdAt))
    .limit(MAX_KEYWORDS_PER_RUN);
  if (keywords.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "수집할 추적 키워드가 없습니다.");
  }

  const countryCode = inferCountryCode(campaign.location);
  const device = campaign.device === "mobile" ? "mobile" : "desktop";
  const competitors = await listActiveCompetitors(campaignId);
  const outcomes: CampaignCollectOutcome[] = [];
  let capturedAt = new Date();

  for (const keyword of keywords) {
    try {
      const collection = await collectKeywordSerp({
        keyword: keyword.keyword,
        countryCode,
        device,
        engine: campaign.searchEngine,
        volume: keyword.volume,
      });
      capturedAt = collection.capturedAt;
      const found = findDomainPosition(collection.results, campaign.domain);
      const previousPosition = keyword.position;

      await db
        .update(trackedKeywords)
        .set({
          previousPosition,
          position: found?.position ?? null,
          updatedAt: new Date(),
          updatedBy: auth.userId,
        })
        .where(eq(trackedKeywords.id, keyword.id));

      outcomes.push({
        keyword: keyword.keyword,
        trackedKeywordId: keyword.id,
        position: found?.position ?? null,
        previousPosition,
        url: found?.url ?? null,
        features: collection.features,
        competitorPositions: competitors.map((competitor) => {
          const hit = findDomainPosition(collection.results, competitor.domain);
          return {
            competitorId: competitor.id,
            domain: competitor.domain,
            position: hit?.position ?? null,
            url: hit?.url ?? null,
          };
        }),
      });
    } catch (error) {
      outcomes.push({
        keyword: keyword.keyword,
        trackedKeywordId: keyword.id,
        position: keyword.position,
        previousPosition: keyword.previousPosition,
        url: null,
        error: error instanceof ApiError ? error.message : "수집에 실패했습니다.",
      });
      // 사용량 한도 같은 공급사 오류는 나머지 키워드도 실패하므로 중단한다.
      if (error instanceof ApiError && (error.code === "RATE_LIMITED" || error.code === "INTERNAL")) {
        break;
      }
    }
  }

  // 간이 가시성: 전체 키워드가 1위일 때 100 에 가깝게 ΣCTR(position) 을 정규화한다.
  const ctrSum = outcomes.reduce(
    (sum, outcome) => sum + (outcome.position ? ctrForPosition(outcome.position) : 0),
    0
  );
  const visibility = Math.round(
    Math.min(100, (ctrSum / (keywords.length * ctrForPosition(1))) * 100)
  );

  const collectedCount = outcomes.filter((outcome) => !outcome.error).length;

  // 전 키워드 수집 실패 시에는 기존 가시성과 이력을 보존한다.
  if (collectedCount > 0) {
    await db
      .update(positionTrackingCampaigns)
      .set({ visibility, updatedAt: new Date(), updatedBy: auth.userId })
      .where(eq(positionTrackingCampaigns.id, campaignId));

    // 가시성 추이 차트를 위해 수집 실행마다 이력을 남긴다.
    await db.insert(positionTrackingVisibilityHistory).values({
      id: newId("pvh"),
      campaignId,
      visibility,
      rankedCount: outcomes.filter((outcome) => !outcome.error && outcome.position !== null)
        .length,
      keywordCount: keywords.length,
      source: "talordata",
      capturedAt,
    });
  }

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    domain: campaign.domain,
    engine: campaign.searchEngine,
    collected: outcomes.filter((outcome) => !outcome.error).length,
    failed: outcomes.filter((outcome) => outcome.error).length,
    visibility,
    outcomes,
    capturedAt: capturedAt.toISOString(),
  };
}

/**
 * 도메인 토큰에서 브랜드 키워드 후보를 만든다.
 * ceconsulting.co.kr → ["ceconsulting", "ce consulting"], my-shop.com → ["my-shop", "my shop", "myshop"]
 * 순위권 확인이 가장 유력한 브랜드 쿼리부터 수집하기 위한 출발점이다.
 */
export function suggestDomainKeywords(domain: string): string[] {
  const normalized = normalizeDomain(domain);
  if (!normalized) return [];
  const sld = normalized.split(".")[0] ?? "";
  const tokens = sld.split(/[-_]/).filter(Boolean);
  const suggestions = new Set<string>();
  if (sld) suggestions.add(sld);
  if (tokens.length > 1) {
    suggestions.add(tokens.join(" "));
    suggestions.add(tokens.join(""));
  }
  return [...suggestions].slice(0, MAX_DOMAIN_SEED_KEYWORDS);
}

export interface DomainSeedKeywordOutcome {
  keyword: string;
  position: number | null;
  url: string | null;
  error?: string;
}

export interface DomainSeedCollectReport {
  domain: string;
  countryCode: string;
  device: "desktop" | "mobile";
  collected: number;
  failed: number;
  /** 수집된 키워드 중 도메인이 상위권에 확인된 개수 */
  ranked: number;
  outcomes: DomainSeedKeywordOutcome[];
  capturedAt: string;
}

/**
 * 도메인 개요용 실시간 시드 수집.
 * 로컬 원천 스토어에 데이터가 없는 실제 도메인도, 브랜드/지정 키워드의 실제 SERP 를
 * 수집해 두면 buildDomainAnalytics 가 리포트를 만들 수 있다.
 */
export async function collectDomainSeedKeywords(input: {
  domain: string;
  countryCode: string;
  device: "desktop" | "mobile";
  keywords?: string[];
}): Promise<DomainSeedCollectReport> {
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }

  const keywords = (input.keywords?.length ? input.keywords : suggestDomainKeywords(domain))
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, MAX_DOMAIN_SEED_KEYWORDS);
  if (keywords.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "수집할 키워드를 입력해 주세요.", {
      fields: { keywords: "브랜드명 등 확인할 키워드를 입력해 주세요." },
    });
  }

  const outcomes: DomainSeedKeywordOutcome[] = [];
  let capturedAt = new Date();
  for (const keyword of keywords) {
    try {
      const collection = await collectKeywordSerp({
        keyword,
        countryCode: input.countryCode,
        device: input.device,
      });
      capturedAt = collection.capturedAt;
      const found = findDomainPosition(collection.results, domain);
      outcomes.push({
        keyword,
        position: found?.position ?? null,
        url: found?.url ?? null,
      });
    } catch (error) {
      outcomes.push({
        keyword,
        position: null,
        url: null,
        error: error instanceof ApiError ? error.message : "수집에 실패했습니다.",
      });
      if (error instanceof ApiError && (error.code === "RATE_LIMITED" || error.code === "INTERNAL")) {
        break;
      }
    }
  }

  return {
    domain,
    countryCode: input.countryCode,
    device: input.device,
    collected: outcomes.filter((outcome) => !outcome.error).length,
    failed: outcomes.filter((outcome) => outcome.error).length,
    ranked: outcomes.filter((outcome) => outcome.position !== null).length,
    outcomes,
    capturedAt: capturedAt.toISOString(),
  };
}

/** 캠페인 소유권 확인. 없으면 404. */
async function requireCampaign(auth: AuthContext, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt)
      )
    )
    .limit(1);
  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  return campaign;
}

/* ------------------------------------------------------------------ */
/* 경쟁사 추적 (최대 5개)                                              */
/* ------------------------------------------------------------------ */

export const MAX_COMPETITORS_PER_CAMPAIGN = 5;

async function listActiveCompetitors(campaignId: string) {
  return db
    .select()
    .from(positionTrackingCompetitors)
    .where(
      and(
        eq(positionTrackingCompetitors.campaignId, campaignId),
        isNull(positionTrackingCompetitors.deletedAt)
      )
    )
    .orderBy(asc(positionTrackingCompetitors.createdAt));
}

/** 캠페인 경쟁사 목록 (순위 추적 화면용). */
export async function listCompetitors(auth: AuthContext, campaignId: string) {
  await requireCampaign(auth, campaignId);
  return listActiveCompetitors(campaignId);
}

/** 경쟁사 추가. 캠페인당 최대 5개, 같은 도메인 중복은 409. */
export async function addCompetitor(
  auth: AuthContext,
  campaignId: string,
  input: { domain: string }
) {
  const campaign = await requireCampaign(auth, campaignId);
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new ApiError("VALIDATION_ERROR", "유효한 도메인을 입력해 주세요.", {
      fields: { domain: "예: example.com" },
    });
  }
  const ownDomain = normalizeDomain(campaign.domain);
  if (ownDomain && (domain === ownDomain || domain.endsWith(`.${ownDomain}`))) {
    throw new ApiError("VALIDATION_ERROR", "캠페인 자신의 도메인은 경쟁사로 추가할 수 없습니다.", {
      fields: { domain: "다른 도메인을 입력해 주세요." },
    });
  }

  const existing = await listActiveCompetitors(campaignId);
  if (existing.some((competitor) => competitor.domain === domain)) {
    throw new ApiError("DUPLICATE", "이미 추적 중인 경쟁사입니다.", {
      fields: { domain: "이미 추적 중인 경쟁사입니다." },
    });
  }
  if (existing.length >= MAX_COMPETITORS_PER_CAMPAIGN) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `경쟁사는 캠페인당 최대 ${MAX_COMPETITORS_PER_CAMPAIGN}개까지 추적할 수 있습니다.`,
      { fields: { domain: `최대 ${MAX_COMPETITORS_PER_CAMPAIGN}개` } }
    );
  }

  const [row] = await db
    .insert(positionTrackingCompetitors)
    .values({
      id: newId("ptc"),
      campaignId,
      domain,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return row;
}

/** 경쟁사 삭제 (소프트 삭제). */
export async function removeCompetitor(
  auth: AuthContext,
  campaignId: string,
  competitorId: string
) {
  await requireCampaign(auth, campaignId);
  const [competitor] = await db
    .select()
    .from(positionTrackingCompetitors)
    .where(
      and(
        eq(positionTrackingCompetitors.id, competitorId),
        eq(positionTrackingCompetitors.campaignId, campaignId),
        isNull(positionTrackingCompetitors.deletedAt)
      )
    )
    .limit(1);
  if (!competitor) {
    throw new ApiError("NOT_FOUND", "경쟁사를 찾을 수 없습니다.");
  }
  await db
    .update(positionTrackingCompetitors)
    .set({ deletedAt: new Date(), deletedBy: auth.userId })
    .where(eq(positionTrackingCompetitors.id, competitorId));
  return { id: competitorId, deleted: true };
}

/* ------------------------------------------------------------------ */
/* 가시성 이력                                                         */
/* ------------------------------------------------------------------ */

/** 캠페인의 가시성 추이 (수집 실행별, 오름차순). */
export async function listVisibilityHistory(auth: AuthContext, campaignId: string) {
  await requireCampaign(auth, campaignId);
  const rows = await db
    .select({
      capturedAt: positionTrackingVisibilityHistory.capturedAt,
      visibility: positionTrackingVisibilityHistory.visibility,
      rankedCount: positionTrackingVisibilityHistory.rankedCount,
      keywordCount: positionTrackingVisibilityHistory.keywordCount,
    })
    .from(positionTrackingVisibilityHistory)
    .where(eq(positionTrackingVisibilityHistory.campaignId, campaignId))
    .orderBy(desc(positionTrackingVisibilityHistory.capturedAt))
    .limit(90);
  return rows.reverse();
}

/* ------------------------------------------------------------------ */
/* 추적 키워드 + 최신 스냅샷 조인                                       */
/* ------------------------------------------------------------------ */

function parseSerpFeatures(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

interface SnapshotRowLike {
  domain: string;
  url: string;
  position: number;
}

function findSnapshotPosition(rows: SnapshotRowLike[], targetDomain: string) {
  const target = normalizeDomain(targetDomain);
  if (!target) return null;
  for (const row of rows) {
    if (row.domain === target || row.domain.endsWith(`.${target}`)) {
      return { position: row.position, url: row.url };
    }
  }
  return null;
}

export interface TrackedKeywordWithSerp {
  id: string;
  campaignId: string;
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  volume: number | null;
  difficulty: number | null;
  updatedAt: Date;
  /** 키워드 그룹 태그 (tags 컬럼의 JSON 배열) */
  tags: string[];
  /** 최신 스냅샷에서 감지된 SERP 피처 */
  serpFeatures: string[];
  /** 최신 스냅샷 수집 시각. 한 번도 수집되지 않았으면 null */
  serpCapturedAt: Date | null;
  /** 같은 스냅샷에서 계산한 경쟁사별 순위 */
  competitorPositions: CompetitorPosition[];
}

/** tags 컬럼(JSON 문자열 배열)을 안전하게 파싱한다. 손상된 값은 빈 배열. */
function parseKeywordTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * 캠페인 추적 키워드 목록.
 * 각 키워드에 최신 SERP 스냅샷의 피처와 경쟁사 순위를 붙여 반환한다.
 * 스냅샷은 수집 시 이미 적재되어 있으므로 조회 시 추가 외부 비용은 없다.
 */
export async function listTrackedKeywords(
  auth: AuthContext,
  campaignId: string
): Promise<TrackedKeywordWithSerp[]> {
  const campaign = await requireCampaign(auth, campaignId);
  const keywords = await db
    .select()
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt)
      )
    )
    .orderBy(desc(trackedKeywords.updatedAt));

  const competitors = await listActiveCompetitors(campaignId);
  if (keywords.length === 0) return [];

  // 캠페인 수집 범위(국가/기기/엔진)와 같은 조건의 키워드 메트릭을 찾는다.
  const countryCode = inferCountryCode(campaign.location);
  const device = campaign.device === "mobile" ? "mobile" : "desktop";
  const engine = campaign.searchEngine === "bing" ? "bing" : "google";
  const normalizedList = [...new Set(keywords.map((row) => normalizeKeyword(row.keyword)))];

  const metricRows = await db
    .select({
      id: keywordMetrics.id,
      normalizedKeyword: keywordMetrics.normalizedKeyword,
      periodStart: keywordMetrics.periodStart,
    })
    .from(keywordMetrics)
    .where(
      and(
        inArray(keywordMetrics.normalizedKeyword, normalizedList),
        eq(keywordMetrics.countryCode, countryCode),
        eq(keywordMetrics.device, device)
      )
    )
    .orderBy(desc(keywordMetrics.periodStart));

  // 정규화 키워드당 가장 최근 기간의 메트릭 하나만 사용한다.
  const metricByKeyword = new Map<string, string>();
  for (const row of metricRows) {
    if (!metricByKeyword.has(row.normalizedKeyword)) {
      metricByKeyword.set(row.normalizedKeyword, row.id);
    }
  }

  const metricIds = [...new Set(metricRows.map((row) => row.id))];
  const latestByMetric = new Map<string, Date>();
  if (metricIds.length > 0) {
    const latestRows = await db
      .select({
        keywordMetricId: serpSnapshots.keywordMetricId,
        latest: max(serpSnapshots.capturedAt),
      })
      .from(serpSnapshots)
      .where(
        and(
          inArray(serpSnapshots.keywordMetricId, metricIds),
          eq(serpSnapshots.searchEngine, engine)
        )
      )
      .groupBy(serpSnapshots.keywordMetricId);
    for (const row of latestRows) {
      if (row.latest) latestByMetric.set(row.keywordMetricId, row.latest);
    }
  }

  // 키워드 수는 수집 상한(20개)으로 제한되므로 키워드당 1회씩 최신 스냅샷을 읽는다.
  const result: TrackedKeywordWithSerp[] = [];
  for (const keyword of keywords) {
    const metricId = metricByKeyword.get(normalizeKeyword(keyword.keyword));
    const latest = metricId ? latestByMetric.get(metricId) : undefined;

    let serpFeatures: string[] = [];
    let competitorPositions: CompetitorPosition[] = competitors.map((competitor) => ({
      competitorId: competitor.id,
      domain: competitor.domain,
      position: null,
      url: null,
    }));

    if (metricId && latest) {
      const rows = await db
        .select({
          domain: serpSnapshots.domain,
          url: serpSnapshots.url,
          position: serpSnapshots.position,
          serpFeatures: serpSnapshots.serpFeatures,
        })
        .from(serpSnapshots)
        .where(
          and(
            eq(serpSnapshots.keywordMetricId, metricId),
            eq(serpSnapshots.searchEngine, engine),
            eq(serpSnapshots.capturedAt, latest)
          )
        )
        .orderBy(asc(serpSnapshots.position));

      if (rows.length > 0) {
        serpFeatures = parseSerpFeatures(rows[0].serpFeatures);
        competitorPositions = competitors.map((competitor) => {
          const hit = findSnapshotPosition(rows, competitor.domain);
          return {
            competitorId: competitor.id,
            domain: competitor.domain,
            position: hit?.position ?? null,
            url: hit?.url ?? null,
          };
        });
      }
    }

    result.push({
      id: keyword.id,
      campaignId: keyword.campaignId,
      keyword: keyword.keyword,
      position: keyword.position,
      previousPosition: keyword.previousPosition,
      volume: keyword.volume,
      difficulty: keyword.difficulty,
      updatedAt: keyword.updatedAt,
      tags: parseKeywordTags(keyword.tags),
      serpFeatures,
      serpCapturedAt: latest ?? null,
      competitorPositions,
    });
  }
  return result;
}

/** 추적 키워드 추가. 같은 캠페인에 같은 키워드가 있으면 409. */
export async function addTrackedKeyword(
  auth: AuthContext,
  campaignId: string,
  input: { keyword: string; volume?: number | undefined; difficulty?: number | undefined }
) {
  await requireCampaign(auth, campaignId);
  const [duplicate] = await db
    .select({ id: trackedKeywords.id })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        eq(trackedKeywords.keyword, input.keyword.trim()),
        isNull(trackedKeywords.deletedAt)
      )
    )
    .limit(1);
  if (duplicate) {
    throw new ApiError("DUPLICATE", "이미 추적 중인 키워드입니다.", {
      fields: { keyword: "이미 추적 중인 키워드입니다." },
    });
  }

  const [row] = await db
    .insert(trackedKeywords)
    .values({
      id: newId("tkw"),
      campaignId,
      keyword: input.keyword.trim(),
      volume: input.volume ?? null,
      difficulty: input.difficulty ?? null,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning();
  return row;
}
