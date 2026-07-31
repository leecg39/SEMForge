import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clickstreamEvents,
  keywordMetrics,
  linkGraphEdges,
  serpSnapshots,
} from "@/db/schema";
import { buildDomainAnalytics } from "@/lib/analytics/metrics";
import type { AnalyticsDevice, AnalyticsRawDataset } from "@/lib/analytics/types";
import { getDomainExternalAnalysis } from "@/server/domain-analysis/snapshots";

/**
 * 라이브(실측) 소스만 인정한다.
 * 데모/시드 소스(demo-*)는 리포트 계산에서 전부 제외한다 — AGENTS.md 원칙.
 * clickstream/링크 그래프는 아직 라이브 수집 소스가 없으므로 빈 배열을 돌려준다
 * (패널 트래픽·백링크·Authority Score 는 소스가 생길 때까지 미제공).
 */
const LIVE_KEYWORD_SOURCES = ["talordata-serp"];
const LIVE_SERP_SOURCES = ["talordata"];

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
    Promise.resolve([] as (typeof linkGraphEdges.$inferSelect)[]),
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
  const [dataset, external] = await Promise.all([
    getAnalyticsDataset(query),
    getDomainExternalAnalysis({
      domain: query.domain,
      countryCode: query.countryCode,
      device: query.device,
    }),
  ]);
  const report = buildDomainAnalytics(dataset, {
    ...query,
    allowEmptyDomain: external !== null,
  });
  if (!report) return report;

  if (external) report.external = external;
  // 데이터셋과 외부 스냅샷은 모두 라이브 소스만 포함한다.
  report.provenance = "live";
  return report;
}
