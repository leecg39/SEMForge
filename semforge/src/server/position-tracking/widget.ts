import type {
  PositionTrackingWidgetSummary,
} from "@/components/seo-dash/WidgetPositionTracking";
import type { KeywordHighlights } from "@/server/position-tracking/highlights";
import type { CampaignOverview } from "@/server/position-tracking/overview";

interface CampaignForWidget {
  id: string;
  location: string;
  device: PositionTrackingWidgetSummary["device"];
  searchEngine: PositionTrackingWidgetSummary["searchEngine"];
}

/**
 * SEO 대시보드 위젯을 포지션 추적 상세 화면과 같은 overview/highlights
 * 집계 결과로 조립한다. 위젯에서 별도 순위 공식을 만들지 않는다.
 */
export function buildPositionTrackingWidgetSummary(
  campaign: CampaignForWidget,
  overview: CampaignOverview,
  highlights: KeywordHighlights,
): PositionTrackingWidgetSummary {
  const latestPoint = overview.visibility.series.at(-1) ?? null;
  return {
    campaignId: campaign.id,
    location: campaign.location,
    device: campaign.device,
    searchEngine: campaign.searchEngine,
    visibility: overview.visibility.current,
    visibilityDiff: overview.visibility.diff,
    avgPosition: overview.avgPosition.current,
    rankedCount: overview.avgPosition.rankedCount,
    lastCollectedAt: latestPoint?.capturedAt ?? null,
    keywordCount: overview.keywordCount,
    topBuckets: overview.topBuckets.map(({ key, count }) => ({ key, count })),
    improvedCount: overview.rising + overview.newRanked,
    declinedCount: overview.falling + overview.dropped,
    keywords: highlights.top.map((row) => ({
      keyword: row.keyword,
      position: row.position,
      previousPosition: row.previousPosition,
      visibilityShare: row.visibilityShare,
    })),
    history: overview.visibility.series,
  };
}
