/**
 * 외부 데이터 제공사 결과 봉투와 provenance 배지 메타.
 *
 * AGENTS.md 데이터 원칙: 수집 실패는 가짜 숫자로 채우지 않고 정직하게
 * 상태(status)와 사유(reason)로 표시한다. 출처(source)와 수집 시각(fetchedAt)은
 * 항상 함께 노출해 UI 배지가 데이터의 근거를 보여줄 수 있게 한다.
 */

export type ProviderStatus = "live" | "unavailable" | "error";

export interface ProviderResult<T> {
  /** live=실제 수집 성공, unavailable=소스 미설정(API 키 없음 등), error=호출 실패 */
  status: ProviderStatus;
  data?: T;
  /** 수집 출처 식별자. 예: "pagespeed-insights", "google-search-console" */
  source: string;
  /** ISO 8601 수집 시각 */
  fetchedAt: string;
  /** unavailable/error 일 때 사용자에게 보여줄 정직한 사유 (한국어) */
  reason?: string;
}

export function providerLive<T>(source: string, data: T): ProviderResult<T> {
  return { status: "live", data, source, fetchedAt: new Date().toISOString() };
}

export function providerUnavailable<T = never>(source: string, reason: string): ProviderResult<T> {
  return { status: "unavailable", source, reason, fetchedAt: new Date().toISOString() };
}

export function providerError<T = never>(source: string, reason: string): ProviderResult<T> {
  return { status: "error", source, reason, fetchedAt: new Date().toISOString() };
}

/**
 * UI provenance 배지가 바로 렌더할 수 있는 메타.
 * ProviderResult 를 그대로 넘기면 배지 컴포넌트가 상태별 문구/색을 고를 필요가 없다.
 */
export interface ProviderBadgeMeta {
  status: ProviderStatus;
  source: string;
  fetchedAt: string;
  /** 배지에 표시할 기본 문구 (한국어) */
  label: string;
  /** 배지 색상 톤: live=success, unavailable=muted, error=danger */
  tone: "success" | "muted" | "danger";
  /** 툴팁용 상세 사유 (unavailable/error 일 때만) */
  reason?: string;
}

const BADGE_LABEL_BY_STATUS: Record<ProviderStatus, string> = {
  live: "실시간 수집",
  unavailable: "연결 필요",
  error: "수집 실패",
};

const BADGE_TONE_BY_STATUS: Record<ProviderStatus, ProviderBadgeMeta["tone"]> = {
  live: "success",
  unavailable: "muted",
  error: "danger",
};

export function toProvenanceBadge<T>(result: ProviderResult<T>): ProviderBadgeMeta {
  return {
    status: result.status,
    source: result.source,
    fetchedAt: result.fetchedAt,
    label: BADGE_LABEL_BY_STATUS[result.status],
    tone: BADGE_TONE_BY_STATUS[result.status],
    ...(result.reason === undefined ? {} : { reason: result.reason }),
  };
}
