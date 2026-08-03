import type { DomainAnalyticsReport } from "@/lib/analytics/types";
import type { AiVisibilityWidgetSummary } from "@/components/seo-dash/WidgetAiSearch";
import type { RefDomainMonth } from "@/components/seo-dash/WidgetBacklinks";
import type { OnPageSeoWidgetSummary } from "@/components/seo-dash/WidgetOnPageSeo";
import type {
  PositionTrackingActiveRunSummary,
  PositionTrackingWidgetSummary,
} from "@/components/seo-dash/WidgetPositionTracking";
import type { SeoDashProject } from "@/components/seo-dash/SeoDashHeader";
import type { SiteAuditWidgetSummary } from "@/components/seo-dash/WidgetSiteAudit";

/**
 * /seo/ 서버 컴포넌트가 클라이언트 대시보드에 전달하는 단일 직렬화 계약.
 * 모든 지표는 저장된 실측 소스에서 왔으며, 소스가 없으면 null/빈 배열을 유지한다.
 */
export interface SeoDashboardSnapshot {
  projects: SeoDashProject[];
  project: SeoDashProject | null;
  currentDomain: string;
  currentFolderId: string | null;
  countryCode: string;
  dateLabel: string | null;
  report: DomainAnalyticsReport | null;
  monthlyRefDomains: RefDomainMonth[];
  siteAuditSummary: SiteAuditWidgetSummary | null;
  siteAuditEmailConfigured: boolean;
  positionTrackingSummary: PositionTrackingWidgetSummary | null;
  positionTrackingActiveRun: PositionTrackingActiveRunSummary | null;
  positionTrackingDomain: string;
  aiVisibilitySummary: AiVisibilityWidgetSummary | null;
  onpageSummary: OnPageSeoWidgetSummary | null;
}
