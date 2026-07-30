import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  folders,
  positionTrackingCampaigns,
  siteAuditCampaigns,
} from "@/db/schema";
import { buildDomainAnalytics } from "@/lib/analytics/metrics";
import type { AnalyticsDevice } from "@/lib/analytics/types";
import type { AuthContext } from "@/lib/session";
import { getAnalyticsDataset } from "@/server/analytics";

/**
 * 앱 홈(/home/) 전용 조회 레이어.
 *
 * 원본 ko.semrush.com/home/ 실측(PAGE_TOPOLOGY.md, 2026-07-28) 기준으로
 *   - 폴더 행 하단 지표 스트립 (SEO 7개 지표)
 *   - "모니터링할 도메인" 아코디언
 * 두 섹션의 데이터를 워크스페이스 스코프로 조립한다.
 *
 * 지표 출처:
 *   - Site Health  → site_audit_campaigns.siteHealth (최신 활성 캠페인)
 *   - 가시성       → position_tracking_campaigns.visibility (활성 캠페인 최댓값)
 *   - 자연검색 트래픽/자연 키워드/백링크 → 분석 파생 레이어(buildDomainAnalytics)
 *   - AI 가시성/언급 → 클론에 원천 데이터가 없으므로 null/0 (원본 무료 계정 표기와 동일)
 */

export interface FolderMetricStrip {
  folderId: string;
  domain: string;
  /** 원천 데이터 없음 → UI는 n/a */
  aiVisibility: number | null;
  mentions: number;
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

export async function getFolderMetricStrips(
  auth: AuthContext,
  folderIds?: string[]
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

  const [dataset, auditRows, trackingRows] = await Promise.all([
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
          inArray(siteAuditCampaigns.folderId, ids)
        )
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
          inArray(positionTrackingCampaigns.folderId, ids)
        )
      ),
  ]);

  // 최신 감사 캠페인부터 보면서 첫 번째 유효 Site Health 를 채택한다.
  const siteHealthByFolder = new Map<string, number>();
  for (const row of auditRows) {
    if (!row.folderId || siteHealthByFolder.has(row.folderId)) continue;
    if (row.siteHealth !== null) siteHealthByFolder.set(row.folderId, row.siteHealth);
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

  return folderRows.map((folder) => {
    const report = buildDomainAnalytics(dataset, {
      domain: folder.domain,
      countryCode: HOME_ANALYTICS_COUNTRY,
      device: HOME_ANALYTICS_DEVICE,
    });
    return {
      folderId: folder.id,
      domain: folder.domain,
      aiVisibility: null,
      mentions: 0,
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
  auth: AuthContext
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
          isNull(siteAuditCampaigns.deletedAt)
        )
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
          eq(positionTrackingCampaigns.status, "active")
        )
      ),
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt))),
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
      folderName: entry.folderId ? folderNameById.get(entry.folderId) ?? null : null,
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}
