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
 * 분석 저장소 경계.
 * 원시 세션/사용자 해시는 이 함수 밖으로 반환하지 않고 파생 보고서만 노출한다.
 */
export async function getDomainAnalytics(query: {
  domain: string;
  countryCode: string;
  device: AnalyticsDevice;
}) {
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

  const dataset: AnalyticsRawDataset = {
    keywords,
    serp,
    clickstream,
    links,
  };
  return buildDomainAnalytics(dataset, query);
}
