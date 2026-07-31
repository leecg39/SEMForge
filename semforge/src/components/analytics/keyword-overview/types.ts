/**
 * Keyword Overview 클라이언트 공유 타입.
 * 서버 리포트(src/server/talordata/overview.ts, insights.ts)의 직렬화 형태와
 * 1:1 로 맞춘다.
 */

export interface KeywordOverviewResult {
  position: number;
  title: string;
  link: string;
  domain: string;
  displayLink: string | null;
  description: string | null;
  authorityScore: number;
  backlinks: number;
  referringDomains: number;
  previousPosition: number | null;
}

export interface IntentEvidence {
  rule: "keyword-pattern" | "serp-feature";
  match: string;
}

export interface KeywordDifficultyReport {
  score: number | null;
  top10Count: number;
  top10WithProfile: number;
  sufficientEvidence: boolean;
  model: "clone-kd-v1";
}

export interface KeywordOverviewReport {
  keyword: string;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: "google" | "bing";
  keywordMetricId: string;
  capturedAt: string;
  fromCache: boolean;
  volume: number;
  volumeMonthsUsed: number;
  intent: string | null;
  intentEvidence: IntentEvidence[];
  intentModel: "clone-intent-v1";
  cpcCents: number | null;
  difficulty: number;
  kd: KeywordDifficultyReport;
  features: string[];
  results: KeywordOverviewResult[];
  captures: Array<{ capturedAt: string; results: number }>;
  rank: { position: number; url: string } | null;
}

/** /api/keywords/insights/ 의 trend_timeseries payload 항목. */
export interface TrendSeriesPoint {
  label: string;
  periodStart: string;
  value: number;
}

export type TrendInsightOutcome =
  | {
      status: "ok";
      payload: TrendSeriesPoint[];
      capturedAt: string;
      fromCache: boolean;
      source: string;
    }
  | { status: "error"; error: string };

export interface KeywordInsightsResponse {
  keyword: string;
  countryCode: string;
  insights: { trend_timeseries?: TrendInsightOutcome };
}

/**
 * 추세 위젯 상태 기계 (§5-3 무한로딩 방지 설계).
 * idle → loading → ready | empty | error 로만 전이하며, loading 에 머무는
 * 경로가 없다. empty(데이터 없음)는 error 와 구분되는 1급 상태다.
 */
export type TrendState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      points: TrendSeriesPoint[];
      fromCache: boolean;
      capturedAt: string;
    }
  | { status: "empty"; fromCache: boolean }
  | { status: "error"; message: string };

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error?: { code?: string; message?: string };
}
