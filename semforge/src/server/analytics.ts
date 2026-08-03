import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clickstreamEvents,
  folders,
  keywordMetrics,
  linkGraphEdges,
  serpSnapshots,
} from "@/db/schema";
import { buildDomainAnalytics, normalizeDomain } from "@/lib/analytics/metrics";
import type { AnalyticsDevice, AnalyticsRawDataset } from "@/lib/analytics/types";
import type { AuthContext } from "@/lib/session";

/**
 * 라이브(실측) 소스만 인정한다.
 * 데모/시드 소스(demo-*)는 리포트 계산에서 전부 제외한다 — AGENTS.md 원칙.
 * 링크 그래프는 사이트 진단 크롤러가 적재하는 실측 엣지(site-audit-crawler)만 사용한다.
 * clickstream 은 아직 라이브 수집 소스가 없으므로 빈 배열을 돌려준다
 * (패널 트래픽은 소스가 생길 때까지 미제공).
 */
const LIVE_KEYWORD_SOURCES = ["talordata-serp"];
const LIVE_SERP_SOURCES = ["talordata"];
const LIVE_LINK_SOURCES = ["site-audit-crawler"];

/**
 * 분석 원천 데이터셋 로더.
 * 동일 국가/기기 조건으로 여러 도메인 보고서를 만들 때(홈 폴더 지표 등)
 * 테이블 스캔을 한 번으로 공유할 수 있도록 분리했다.
 */
export async function getAnalyticsDataset(query: {
  countryCode: string;
  device: AnalyticsDevice;
}): Promise<AnalyticsRawDataset> {
  const [keywords, serp, clickstream, links] = await Promise.all([
    db
      .select()
      .from(keywordMetrics)
      .where(
        and(
          eq(keywordMetrics.countryCode, query.countryCode.toUpperCase()),
          eq(keywordMetrics.device, query.device),
          inArray(keywordMetrics.source, LIVE_KEYWORD_SOURCES),
        ),
      ),
    db.select().from(serpSnapshots).where(inArray(serpSnapshots.source, LIVE_SERP_SOURCES)),
    Promise.resolve([] as (typeof clickstreamEvents.$inferSelect)[]),
    db.select().from(linkGraphEdges).where(inArray(linkGraphEdges.source, LIVE_LINK_SOURCES)),
  ]);

  return { keywords, serp, clickstream, links };
}

/**
 * 분석 저장소 경계.
 * 원시 세션/사용자 해시는 이 함수 밖으로 반환하지 않고 파생 보고서만 노출한다.
 */
export async function getDomainAnalytics(query: {
  domain: string;
  countryCode: string;
  device: AnalyticsDevice;
}) {
  const dataset = await getAnalyticsDataset(query);
  const report = buildDomainAnalytics(dataset, query);
  if (!report) return report;

  // 데이터셋은 이미 라이브 소스만 포함하므로, 리포트가 만들어졌다면 실측이다.
  report.provenance = "live";
  return report;
}

/**
 * 랜딩에 보여줄 "데이터 보유 도메인" 목록.
 * 라이브 SERP 스냅샷 또는 링크 그래프에 잡힌 도메인의 합집합(정렬)을
 * 전체 테이블 스캔 없이 distinct 조회로 돌려준다.
 */
export async function getAvailableDomains(
  auth: Pick<AuthContext, "workspaceId">,
): Promise<string[]> {
  const [folderRows, serpRows, linkRows] = await Promise.all([
    db
      .select({ domain: folders.domain })
      .from(folders)
      .where(
        and(
          eq(folders.workspaceId, auth.workspaceId),
          isNull(folders.deletedAt),
        ),
      ),
    db
      .selectDistinct({ domain: serpSnapshots.domain })
      .from(serpSnapshots)
      .where(inArray(serpSnapshots.source, LIVE_SERP_SOURCES)),
    db
      .selectDistinct({ domain: linkGraphEdges.targetDomain })
      .from(linkGraphEdges)
      .where(inArray(linkGraphEdges.source, LIVE_LINK_SOURCES)),
  ]);
  const allowedDomains = new Set(
    folderRows.map((row) => normalizeDomain(row.domain)).filter(Boolean),
  );
  if (allowedDomains.size === 0) return [];
  const domains = new Set<string>();
  for (const row of serpRows) {
    const domain = normalizeDomain(row.domain);
    if (domain && allowedDomains.has(domain)) domains.add(domain);
  }
  for (const row of linkRows) {
    const domain = normalizeDomain(row.domain);
    if (domain && allowedDomains.has(domain)) domains.add(domain);
  }
  return [...domains].sort();
}
