import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  keywordMetrics,
  positionTrackingCampaigns,
  serpSnapshots,
  trackedKeywords,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import {
  buildPageRankings,
  detectCannibalization,
  extractFeaturedSnippets,
  type CannibalizationInsight,
  type FeaturedSnippetInsights,
  type PageInsightSerpRow,
  type PageRanking,
} from "@/server/position-tracking/page-insights";
import { providerError, providerLive, type ProviderResult } from "@/server/providers/types";

/** 저장된 SERP 스냅샷에서 페이지 단위 인사이트를 조회한다. */

const SOURCE = "talordata";
const SNAPSHOT_SOURCE = "talordata";
const MAX_CAMPAIGN_ID_LENGTH = 200;

type CampaignRow = typeof positionTrackingCampaigns.$inferSelect;

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function inferCountryCode(location: string | null | undefined): string {
  if (!location) return "KR";
  return /korea|seoul|대한|서울/i.test(location) ? "KR" : "US";
}

function snapshotEngine(campaign: CampaignRow): "google" | "bing" {
  if (campaign.searchEngine === "google" || campaign.searchEngine === "bing") {
    return campaign.searchEngine;
  }
  throw new ApiError(
    "VALIDATION_ERROR",
    "ChatGPT 엔진 캠페인은 SERP 페이지 인사이트를 제공할 수 없습니다.",
  );
}

function validateCampaignId(campaignId: string): void {
  if (
    campaignId.length === 0 ||
    campaignId.length > MAX_CAMPAIGN_ID_LENGTH ||
    campaignId.trim() !== campaignId
  ) {
    throw new ApiError("VALIDATION_ERROR", "캠페인 식별자를 확인해 주세요.", {
      fields: {
        campaignId: `공백 없이 1~${MAX_CAMPAIGN_ID_LENGTH}자로 입력해 주세요.`,
      },
    });
  }
}

/** 현재 워크스페이스의 삭제되지 않은 캠페인만 허용한다. */
async function requireCampaign(auth: AuthContext, campaignId: string): Promise<CampaignRow> {
  validateCampaignId(campaignId);
  const [campaign] = await db
    .select()
    .from(positionTrackingCampaigns)
    .where(
      and(
        eq(positionTrackingCampaigns.id, campaignId),
        eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
        isNull(positionTrackingCampaigns.deletedAt),
      ),
    )
    .limit(1);

  if (!campaign) {
    throw new ApiError("NOT_FOUND", "포지션 추적 캠페인을 찾을 수 없습니다.");
  }
  return campaign;
}

/** 캠페인의 추적 키워드와 같은 범위에 속한 SERP 원천 행을 읽는다. */
async function loadCampaignSnapshotRows(
  auth: AuthContext,
  campaignId: string,
): Promise<{
  campaign: CampaignRow;
  rows: PageInsightSerpRow[];
  capturedAt: Date | null;
}> {
  const campaign = await requireCampaign(auth, campaignId);
  const engine = snapshotEngine(campaign);
  const keywords = await db
    .select({ keyword: trackedKeywords.keyword })
    .from(trackedKeywords)
    .where(
      and(
        eq(trackedKeywords.campaignId, campaignId),
        isNull(trackedKeywords.deletedAt),
      ),
    );

  if (keywords.length === 0) return { campaign, rows: [], capturedAt: null };

  const normalizedKeywords = [
    ...new Set(keywords.map((row) => normalizeKeyword(row.keyword))),
  ];
  const metricRows = await db
    .select({
      id: keywordMetrics.id,
      normalizedKeyword: keywordMetrics.normalizedKeyword,
    })
    .from(keywordMetrics)
    .where(
      and(
        inArray(keywordMetrics.normalizedKeyword, normalizedKeywords),
        eq(keywordMetrics.countryCode, inferCountryCode(campaign.location)),
        eq(keywordMetrics.device, campaign.device === "mobile" ? "mobile" : "desktop"),
      ),
    )
    .orderBy(desc(keywordMetrics.periodStart));

  const candidateMetricIds = [...new Set(metricRows.map((row) => row.id))];
  if (candidateMetricIds.length === 0) {
    return { campaign, rows: [], capturedAt: null };
  }

  const latestRows = await db
    .select({
      keywordMetricId: serpSnapshots.keywordMetricId,
      capturedAt: max(serpSnapshots.capturedAt),
    })
    .from(serpSnapshots)
    .where(
      and(
        inArray(serpSnapshots.keywordMetricId, candidateMetricIds),
        eq(serpSnapshots.searchEngine, engine),
        eq(serpSnapshots.source, SNAPSHOT_SOURCE),
      ),
    )
    .groupBy(serpSnapshots.keywordMetricId);

  const latestByMetric = new Map(
    latestRows
      .filter(
        (row): row is { keywordMetricId: string; capturedAt: Date } =>
          row.capturedAt !== null,
      )
      .map((row) => [row.keywordMetricId, row] as const),
  );

  // 메트릭 자체는 과거 시드에서 만들어졌더라도 실제 TalorData 수집이 같은 행을
  // 재사용할 수 있다. 따라서 메트릭 source가 아니라 실제 스냅샷의 source로
  // 진위를 판정하고, 키워드마다 실측 스냅샷이 있는 최신 기간을 선택한다.
  const metricByKeyword = new Map<string, string>();
  for (const row of metricRows) {
    if (!metricByKeyword.has(row.normalizedKeyword) && latestByMetric.has(row.id)) {
      metricByKeyword.set(row.normalizedKeyword, row.id);
    }
  }
  const availableLatestRows = [...new Set(metricByKeyword.values())]
    .map((metricId) => latestByMetric.get(metricId))
    .filter(
      (row): row is { keywordMetricId: string; capturedAt: Date } =>
        row !== undefined,
    );
  if (availableLatestRows.length === 0) {
    return { campaign, rows: [], capturedAt: null };
  }

  // 키워드마다 수집 시각이 다를 수 있으므로 (metric, capturedAt) 쌍을 정확히
  // 일치시킨다. 단순한 두 IN 조건은 다른 키워드의 과거 시각을 섞을 수 있다.
  const batches = await Promise.all(
    availableLatestRows.map((latest) =>
      db
        .select({
          keyword_metric_id: serpSnapshots.keywordMetricId,
          search_engine: serpSnapshots.searchEngine,
          domain: serpSnapshots.domain,
          url: serpSnapshots.url,
          position: serpSnapshots.position,
          is_ad: serpSnapshots.isAd,
          title: serpSnapshots.title,
          description: serpSnapshots.description,
          serp_features: serpSnapshots.serpFeatures,
          source: serpSnapshots.source,
          captured_at: serpSnapshots.capturedAt,
        })
        .from(serpSnapshots)
        .where(
          and(
            eq(serpSnapshots.keywordMetricId, latest.keywordMetricId),
            eq(serpSnapshots.searchEngine, engine),
            eq(serpSnapshots.source, SNAPSHOT_SOURCE),
            eq(serpSnapshots.capturedAt, latest.capturedAt),
          ),
        )
        .orderBy(asc(serpSnapshots.position), asc(serpSnapshots.url)),
    ),
  );
  const storedRows = batches.flat();

  const rows: PageInsightSerpRow[] = storedRows.map((row) => ({
    ...row,
    // SQLite 원천값은 0/1 이므로 순수 계산 모듈에는 명시적인 boolean 을 넘긴다.
    is_ad: Boolean(row.is_ad),
  }));
  const capturedAt = availableLatestRows.reduce<Date | null>(
    (latest, row) => (!latest || row.capturedAt > latest ? row.capturedAt : latest),
    null,
  );
  return { campaign, rows, capturedAt };
}

async function loadInsight<T>(
  auth: AuthContext,
  campaignId: string,
  failureMessage: string,
  calculate: (rows: readonly PageInsightSerpRow[], domain: string) => T,
): Promise<ProviderResult<T>> {
  try {
    const { campaign, rows, capturedAt } = await loadCampaignSnapshotRows(auth, campaignId);
    const result = providerLive(SOURCE, calculate(rows, campaign.domain));
    return capturedAt ? { ...result, fetchedAt: capturedAt.toISOString() } : result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[position-tracking] page insights query failed", error);
    return providerError(SOURCE, `${failureMessage}. 잠시 후 다시 시도해 주세요.`);
  }
}

export function loadPageRankings(
  auth: AuthContext,
  campaignId: string,
): Promise<ProviderResult<PageRanking[]>> {
  return loadInsight(auth, campaignId, "페이지 순위를 집계하지 못했습니다", buildPageRankings);
}

export function loadCannibalization(
  auth: AuthContext,
  campaignId: string,
): Promise<ProviderResult<CannibalizationInsight[]>> {
  return loadInsight(
    auth,
    campaignId,
    "키워드 카니발리제이션을 집계하지 못했습니다",
    detectCannibalization,
  );
}

export function loadFeaturedSnippets(
  auth: AuthContext,
  campaignId: string,
): Promise<ProviderResult<FeaturedSnippetInsights>> {
  return loadInsight(
    auth,
    campaignId,
    "추천 스니펫을 집계하지 못했습니다",
    extractFeaturedSnippets,
  );
}
