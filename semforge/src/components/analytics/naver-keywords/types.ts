// @TASK NAVER-P0-EXPLORER - 한국형 키워드 탐색기 클라이언트 타입
// @SPEC user-approved-plan#3-b-data-and-provenance
// @TEST src/components/analytics/naver-keywords/model.test.ts
import type { AnalyticsIntent } from "@/lib/analytics/types";
import type {
  NaverCacheStatus,
  NaverKeywordCount,
  NaverKeywordStat,
  NaverMeasurement,
  NaverSectionStatus,
} from "@/server/naver-keywords/contracts";

export type {
  NaverCacheStatus,
  NaverKeywordCount,
  NaverKeywordStat,
  NaverMeasurement,
  NaverSectionStatus,
};

export interface NaverKeywordRow extends Omit<
  NaverKeywordStat,
  "monthlyPcQueries" | "monthlyMobileQueries" | "monthlyTotalQueries" | "snapshotId"
> {
  monthlyPcQueries: NaverKeywordCount | null;
  monthlyMobileQueries: NaverKeywordCount | null;
  monthlyTotalQueries: NaverKeywordCount | null;
  snapshotId: string | null;
  intent: AnalyticsIntent;
  intentMeasurement: "inferred";
  intentModel: "clone-intent-v1";
  source: string;
  fetchedAt: string;
  expiresAt: string;
  cache: NaverCacheStatus;
}

export interface ExploreProvenance {
  status: NaverSectionStatus;
  cache: NaverCacheStatus;
  measurement: NaverMeasurement;
  source: string;
  fetchedAt: string;
  expiresAt: string;
  reason?: string;
}

export interface NaverKeywordExploreView {
  seeds: string[];
  generatedAt: string;
  total: number;
  rows: NaverKeywordRow[];
  provenance: ExploreProvenance;
}

export interface KeywordFilters {
  query: string;
  competition: "all" | "low" | "medium" | "high" | "unavailable";
  intent: "all" | AnalyticsIntent;
}

export interface KeywordListOption {
  id: string;
  name: string;
  mode?: string;
  database?: string;
  status?: string;
}

export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
}
