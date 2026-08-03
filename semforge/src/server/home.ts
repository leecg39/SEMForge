import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiVisibilityQueries,
  aiVisibilitySnapshots,
  aiVisibilityProjects,
  aiVisibilityRuns,
  aiVisibilityObservations,
  aiVisibilityCitations,
  aiVisibilityPrompts,
  folders,
  positionTrackingCampaigns,
  siteAuditCampaigns,
} from "@/db/schema";
import { buildDomainAnalytics, normalizeDomain } from "@/lib/analytics/metrics";
import type { AnalyticsDevice } from "@/lib/analytics/types";
import type { AuthContext } from "@/lib/session";
import { getAnalyticsDataset } from "@/server/analytics";
import {
  computeAiVisibilityMetric,
  selectRunObservationSets,
  type DashboardObservation,
} from "@/server/ai-visibility/dashboard";

/**
 * 앱 홈(/home/) 전용 조회 레이어.
 *
 * 원본 ko.semrush.com/home/ 실측(PAGE_TOPOLOGY.md, 2026-07-28) 기준으로
 *   - 폴더 행 하단 지표 스트립 (AI 가시성부터 시작하는 7개 지표)
 *   - "모니터링할 도메인" 아코디언
 * 두 섹션의 데이터를 워크스페이스 스코프로 조립한다.
 *
 * 지표 출처:
 *   - Site Health  → site_audit_campaigns.siteHealth (최신 활성 캠페인)
 *   - 가시성       → position_tracking_campaigns.visibility (활성 캠페인 최댓값)
 *   - 자연검색 트래픽/자연 키워드/백링크 → 분석 파생 레이어(buildDomainAnalytics)
 *   - AI 가시성/언급 → ai_visibility_queries + 쿼리별 최신 ai_visibility_snapshots
 */

export interface FolderMetricStrip {
  folderId: string;
  domain: string;
  /** 최신 수집 쿼리 중 자사 도메인이 인용된 비율(0~100). 수집 전이면 null. */
  aiVisibility: number | null;
  /** 최신 스냅샷에서 자사 도메인이 인용된 쿼리 수. */
  mentions: number;
  /** 최신 실행이 반환한 전체 셀과 unknown 제외 측정 가능 셀. */
  aiObserved: number;
  aiMeasured: number;
  /** 홈 카드에 표시할 최신 AI 관측 시각. */
  aiUpdatedAt: string | null;
  /** 캠페인 미설정 시 null → UI는 CTA 힌트 표시 */
  siteHealth: number | null;
  visibility: number | null;
  /** 분석 데이터 없는 도메인은 null → UI는 n/a */
  organicTraffic: number | null;
  organicKeywords: number | null;
  backlinks: number | null;
  authorityScore: number | null;
}

export interface MonitoredDomainTool {
  tool: "siteAudit" | "positionTracking";
  campaignId: string;
  name: string;
  status: string;
  /** siteAudit → siteHealth, positionTracking → visibility */
  detail: number | null;
}

export interface MonitoredDomain {
  domain: string;
  folderId: string | null;
  tools: MonitoredDomainTool[];
}

const HOME_ANALYTICS_COUNTRY = "US";
const HOME_ANALYTICS_DEVICE: AnalyticsDevice = "desktop";

export function calculateAiVisibility(
  collected: number,
  cited: number,
): number | null {
  if (collected <= 0) return null;
  const boundedCited = Math.min(collected, Math.max(0, cited));
  return Math.round((boundedCited / collected) * 100);
}

export async function getFolderMetricStrips(
  auth: AuthContext,
  folderIds?: string[],
): Promise<FolderMetricStrip[]> {
  const folderConds = [
    eq(folders.workspaceId, auth.workspaceId),
    isNull(folders.deletedAt),
  ];
  if (folderIds && folderIds.length > 0) {
    folderConds.push(inArray(folders.id, folderIds));
  }
  const folderRows = await db
    .select({ id: folders.id, domain: folders.domain })
    .from(folders)
    .where(and(...folderConds));
  if (folderRows.length === 0) return [];

  const ids = folderRows.map((row) => row.id);
  const normalizedDomains = [
    ...new Set(
      folderRows.map((row) => normalizeDomain(row.domain)).filter(Boolean),
    ),
  ];

  const [dataset, auditRows, trackingRows, aiQueryRows] = await Promise.all([
    getAnalyticsDataset({
      countryCode: HOME_ANALYTICS_COUNTRY,
      device: HOME_ANALYTICS_DEVICE,
    }),
    db
      .select({
        folderId: siteAuditCampaigns.folderId,
        siteHealth: siteAuditCampaigns.siteHealth,
        updatedAt: siteAuditCampaigns.updatedAt,
      })
      .from(siteAuditCampaigns)
      .where(
        and(
          eq(siteAuditCampaigns.workspaceId, auth.workspaceId),
          isNull(siteAuditCampaigns.deletedAt),
          inArray(siteAuditCampaigns.folderId, ids),
        ),
      )
      .orderBy(desc(siteAuditCampaigns.updatedAt)),
    db
      .select({
        folderId: positionTrackingCampaigns.folderId,
        visibility: positionTrackingCampaigns.visibility,
      })
      .from(positionTrackingCampaigns)
      .where(
        and(
          eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
          isNull(positionTrackingCampaigns.deletedAt),
          eq(positionTrackingCampaigns.status, "active"),
          inArray(positionTrackingCampaigns.folderId, ids),
        ),
      ),
    normalizedDomains.length > 0
      ? db
          .select({
            id: aiVisibilityQueries.id,
            domain: aiVisibilityQueries.domain,
          })
          .from(aiVisibilityQueries)
          .where(
            and(
              eq(aiVisibilityQueries.workspaceId, auth.workspaceId),
              inArray(aiVisibilityQueries.domain, normalizedDomains),
              isNull(aiVisibilityQueries.deletedAt),
            ),
          )
      : Promise.resolve([]),
  ]);

  const aiQueryIds = aiQueryRows.map((row) => row.id);
  const latestAiRows =
    aiQueryIds.length > 0
      ? await db
          .select({
            queryId: aiVisibilitySnapshots.queryId,
            latest: max(aiVisibilitySnapshots.capturedAt),
          })
          .from(aiVisibilitySnapshots)
          .where(inArray(aiVisibilitySnapshots.queryId, aiQueryIds))
          .groupBy(aiVisibilitySnapshots.queryId)
      : [];
  const aiSnapshotRows = (
    await Promise.all(
      latestAiRows.map(async (row) => {
        if (!row.latest) return null;
        const [snapshot] = await db
          .select({
            queryId: aiVisibilitySnapshots.queryId,
            cited: aiVisibilitySnapshots.cited,
            capturedAt: aiVisibilitySnapshots.capturedAt,
          })
          .from(aiVisibilitySnapshots)
          .where(
            and(
              eq(aiVisibilitySnapshots.queryId, row.queryId),
              eq(aiVisibilitySnapshots.capturedAt, row.latest),
            ),
          )
          .orderBy(desc(aiVisibilitySnapshots.capturedAt))
          .limit(1);
        return snapshot ?? null;
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null);

  // 새 프로젝트 기반 스토어는 대시보드와 동일한 최신 셀·unknown 제외 공식을 공유한다.
  const aiProjectRows = await db
    .select({
      id: aiVisibilityProjects.id,
      folderId: aiVisibilityProjects.folderId,
    })
    .from(aiVisibilityProjects)
    .where(
      and(
        eq(aiVisibilityProjects.workspaceId, auth.workspaceId),
        inArray(aiVisibilityProjects.folderId, ids),
        isNull(aiVisibilityProjects.deletedAt),
      ),
    );
  const aiProjectIds = aiProjectRows.map((row) => row.id);
  const [newObservationRows, terminalAiRuns] =
    aiProjectIds.length > 0
      ? await Promise.all([
          db
            .select({
              id: aiVisibilityObservations.id,
              projectId: aiVisibilityObservations.projectId,
              runId: aiVisibilityObservations.runId,
              promptId: aiVisibilityObservations.promptId,
              prompt: aiVisibilityPrompts.prompt,
              topic: aiVisibilityPrompts.topic,
              provider: aiVisibilityObservations.provider,
              countryCode: aiVisibilityObservations.countryCode,
              locationKey: aiVisibilityObservations.locationKey,
              visibilityStatus: aiVisibilityObservations.visibilityStatus,
              brandMentioned: aiVisibilityObservations.brandMentioned,
              citationsAvailable: aiVisibilityObservations.citationsAvailable,
              responseText: aiVisibilityObservations.responseText,
              source: aiVisibilityObservations.source,
              fromCache: aiVisibilityObservations.fromCache,
              capturedAt: aiVisibilityObservations.capturedAt,
            })
            .from(aiVisibilityObservations)
            .innerJoin(
              aiVisibilityPrompts,
              eq(aiVisibilityPrompts.id, aiVisibilityObservations.promptId),
            )
            .where(inArray(aiVisibilityObservations.projectId, aiProjectIds)),
          db
            .select({
              id: aiVisibilityRuns.id,
              projectId: aiVisibilityRuns.projectId,
              createdAt: aiVisibilityRuns.createdAt,
              completedAt: aiVisibilityRuns.completedAt,
            })
            .from(aiVisibilityRuns)
            .where(
              and(
                inArray(aiVisibilityRuns.projectId, aiProjectIds),
                inArray(aiVisibilityRuns.status, ["completed", "partial"]),
              ),
            ),
        ])
      : [[], []];
  const newObservationIds = newObservationRows.map((row) => row.id);
  const newCitationRows =
    newObservationIds.length > 0
      ? await db
          .select()
          .from(aiVisibilityCitations)
          .where(
            inArray(aiVisibilityCitations.observationId, newObservationIds),
          )
      : [];
  const newAiStatsByFolder = new Map<
    string,
    {
      visibility: number | null;
      mentions: number;
      observed: number;
      measured: number;
      updatedAt: string | null;
    }
  >();
  for (const project of aiProjectRows) {
    const rows = newObservationRows.filter(
      (row) => row.projectId === project.id,
    );
    const runSets = selectRunObservationSets(
      rows as DashboardObservation[],
      terminalAiRuns.filter((run) => run.projectId === project.id),
    );
    const latest = runSets.latest;
    const latestIds = new Set(latest.map((row) => row.id));
    const metric = computeAiVisibilityMetric(
      latest,
      newCitationRows.filter((row) => latestIds.has(row.observationId)),
    );
    newAiStatsByFolder.set(project.folderId, {
      visibility: metric.visibility,
      mentions: metric.mentions,
      observed: metric.observed,
      measured: metric.measured,
      updatedAt:
        latest.length > 0
          ? new Date(
              Math.max(...latest.map((row) => row.capturedAt.getTime())),
            ).toISOString()
          : null,
    });
  }

  // 최신 감사 캠페인부터 보면서 첫 번째 유효 Site Health 를 채택한다.
  const siteHealthByFolder = new Map<string, number>();
  for (const row of auditRows) {
    if (!row.folderId || siteHealthByFolder.has(row.folderId)) continue;
    if (row.siteHealth !== null)
      siteHealthByFolder.set(row.folderId, row.siteHealth);
  }

  // 여러 추적 캠페인(검색엔진·기기별)이 있으면 가장 높은 가시성을 대표값으로 쓴다.
  const visibilityByFolder = new Map<string, number>();
  for (const row of trackingRows) {
    if (!row.folderId || row.visibility === null) continue;
    const current = visibilityByFolder.get(row.folderId);
    if (current === undefined || row.visibility > current) {
      visibilityByFolder.set(row.folderId, row.visibility);
    }
  }

  // 쿼리별 최신 스냅샷만 사용한다. 동일 시각 중복 행은 첫 행만 집계한다.
  const aiDomainByQuery = new Map(
    aiQueryRows.map((row) => [row.id, row.domain]),
  );
  const seenAiQueries = new Set<string>();
  const aiStatsByDomain = new Map<
    string,
    {
      observed: number;
      measured: number;
      cited: number;
      updatedAt: Date | null;
    }
  >();
  for (const row of aiSnapshotRows) {
    if (seenAiQueries.has(row.queryId)) continue;
    seenAiQueries.add(row.queryId);
    const domain = aiDomainByQuery.get(row.queryId);
    if (!domain) continue;
    const stats = aiStatsByDomain.get(domain) ?? {
      observed: 0,
      measured: 0,
      cited: 0,
      updatedAt: null,
    };
    stats.observed += 1;
    if (row.cited !== null) stats.measured += 1;
    if (row.cited === true) stats.cited += 1;
    if (!stats.updatedAt || row.capturedAt > stats.updatedAt)
      stats.updatedAt = row.capturedAt;
    aiStatsByDomain.set(domain, stats);
  }

  return folderRows.map((folder) => {
    const normalizedDomain = normalizeDomain(folder.domain);
    const aiStats = aiStatsByDomain.get(normalizedDomain);
    const projectAiStats = newAiStatsByFolder.get(folder.id);
    const report = buildDomainAnalytics(dataset, {
      domain: folder.domain,
      countryCode: HOME_ANALYTICS_COUNTRY,
      device: HOME_ANALYTICS_DEVICE,
    });
    return {
      folderId: folder.id,
      domain: folder.domain,
      aiVisibility: projectAiStats
        ? projectAiStats.visibility
        : calculateAiVisibility(aiStats?.measured ?? 0, aiStats?.cited ?? 0),
      mentions: projectAiStats
        ? projectAiStats.mentions
        : (aiStats?.cited ?? 0),
      aiObserved: projectAiStats?.observed ?? aiStats?.observed ?? 0,
      aiMeasured: projectAiStats?.measured ?? aiStats?.measured ?? 0,
      aiUpdatedAt:
        projectAiStats?.updatedAt ?? aiStats?.updatedAt?.toISOString() ?? null,
      siteHealth: siteHealthByFolder.get(folder.id) ?? null,
      visibility: visibilityByFolder.get(folder.id) ?? null,
      organicTraffic: report?.metrics.organicTrafficEstimate.value ?? null,
      organicKeywords: report?.metrics.organicKeywords ?? null,
      backlinks: report?.metrics.backlinks ?? null,
      authorityScore: report?.metrics.authorityScore.value ?? null,
    };
  });
}

export async function getMonitoredDomains(
  auth: AuthContext,
): Promise<MonitoredDomain[]> {
  const [auditRows, trackingRows, folderRows] = await Promise.all([
    db
      .select({
        id: siteAuditCampaigns.id,
        folderId: siteAuditCampaigns.folderId,
        name: siteAuditCampaigns.name,
        domain: siteAuditCampaigns.domain,
        status: siteAuditCampaigns.status,
        siteHealth: siteAuditCampaigns.siteHealth,
      })
      .from(siteAuditCampaigns)
      .where(
        and(
          eq(siteAuditCampaigns.workspaceId, auth.workspaceId),
          isNull(siteAuditCampaigns.deletedAt),
        ),
      )
      .orderBy(desc(siteAuditCampaigns.updatedAt)),
    db
      .select({
        id: positionTrackingCampaigns.id,
        folderId: positionTrackingCampaigns.folderId,
        name: positionTrackingCampaigns.name,
        domain: positionTrackingCampaigns.domain,
        status: positionTrackingCampaigns.status,
        visibility: positionTrackingCampaigns.visibility,
      })
      .from(positionTrackingCampaigns)
      .where(
        and(
          eq(positionTrackingCampaigns.workspaceId, auth.workspaceId),
          isNull(positionTrackingCampaigns.deletedAt),
          eq(positionTrackingCampaigns.status, "active"),
        ),
      ),
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(
        and(
          eq(folders.workspaceId, auth.workspaceId),
          isNull(folders.deletedAt),
        ),
      ),
  ]);

  const folderNameById = new Map(folderRows.map((row) => [row.id, row.name]));
  const byDomain = new Map<string, MonitoredDomain>();

  const bucket = (domain: string, folderId: string | null): MonitoredDomain => {
    const existing = byDomain.get(domain);
    if (existing) return existing;
    const created: MonitoredDomain = { domain, folderId, tools: [] };
    byDomain.set(domain, created);
    return created;
  };

  for (const row of auditRows) {
    bucket(row.domain, row.folderId).tools.push({
      tool: "siteAudit",
      campaignId: row.id,
      name: row.name,
      status: row.status,
      detail: row.siteHealth,
    });
  }
  for (const row of trackingRows) {
    bucket(row.domain, row.folderId).tools.push({
      tool: "positionTracking",
      campaignId: row.id,
      name: row.name,
      status: row.status,
      detail: row.visibility,
    });
  }

  return [...byDomain.values()]
    .map((entry) => ({
      ...entry,
      folderName: entry.folderId
        ? (folderNameById.get(entry.folderId) ?? null)
        : null,
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}
