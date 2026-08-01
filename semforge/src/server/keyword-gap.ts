import {
  buildKeywordGap,
  type GapTarget,
  type KeywordGapReport,
} from "@/lib/analytics/keyword-gap";
import type { AnalyticsDevice } from "@/lib/analytics/types";
import { getAnalyticsDataset } from "@/server/analytics";

/**
 * 키워드 갭 리포트 빌더 — 저장소 경계.
 * getAnalyticsDataset 이 라이브 소스만 돌려주므로(demo 제외), 여기서 만들어진
 * 리포트는 전부 실측 스냅샷 기준이다. 외부 API 호출은 발생하지 않는다.
 */
export async function getKeywordGap(query: {
  targets: GapTarget[];
  countryCode: string;
  device: AnalyticsDevice;
}): Promise<KeywordGapReport> {
  const dataset = await getAnalyticsDataset({
    countryCode: query.countryCode,
    device: query.device,
  });
  const report = buildKeywordGap(dataset, query);
  report.provenance = "live";
  return report;
}
