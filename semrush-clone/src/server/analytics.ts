import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clickstreamEvents,
  keywordMetrics,
  linkGraphEdges,
  serpSnapshots,
} from "@/db/schema";
import { buildDomainAnalytics } from "@/lib/analytics/metrics";
import type { AnalyticsDevice, AnalyticsRawDataset } from "@/lib/analytics/types";

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
        ),
      ),
    db.select().from(serpSnapshots),
    db
      .select()
      .from(clickstreamEvents)
      .where(
        and(
          eq(clickstreamEvents.countryCode, query.countryCode.toUpperCase()),
          eq(clickstreamEvents.device, query.device),
        ),
      ),
    db.select().from(linkGraphEdges),
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

  // 이 도메인의 SERP 입력이 실시간 수집(talordata)인지 데모 시드인지 표기한다.
  const target = query.domain.toLowerCase();
  const domainRows = dataset.serp.filter((row) => {
    const rowDomain = row.domain.toLowerCase();
    return rowDomain === target || rowDomain.endsWith(`.${target}`);
  });
  const live = domainRows.some((row) => row.source === "talordata");
  const demo = domainRows.some((row) => row.source !== "talordata");
  report.provenance = live && demo ? "mixed" : live ? "live" : "demo";
  return report;
}
