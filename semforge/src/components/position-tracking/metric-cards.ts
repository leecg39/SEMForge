import { buildSparkline, calculateDelta, type DeltaResult } from "@/server/position-tracking/trends";
import { estimateOrganicTraffic } from "@/lib/analytics/metrics";

/**
 * 포지션 추적 현황 탭 상단의 지표 카드.
 *
 * 원본은 가시성·예상 트래픽·평균 포지션 세 카드를 스파크라인과 증감률과 함께 보여준다.
 * 데이터가 없는 것과 값이 0 인 것을 구분하는 것이 이 모듈의 핵심이다.
 * 가시성 0% 는 "노출이 전혀 없다"는 사실 주장이고, 이력이 없는 상태와 전혀 다르다.
 */

export type MetricCardKey = "visibility" | "estimated-traffic" | "average-position";

export interface MetricCard {
  key: MetricCardKey;
  label: string;
  value: number | null;
  unit: "%" | null;
  /** 소수 자릿수. 표시 계층이 그대로 쓴다. */
  precision: number;
  delta: DeltaResult | null;
  sparkline: (number | null)[];
  status: "live" | "unavailable";
  /** unavailable 일 때만 존재한다. */
  reason?: string;
}

export interface VisibilityHistoryPoint {
  capturedAt: string;
  visibility: number;
}

export interface BuildMetricCardsInput {
  visibilityHistory: readonly VisibilityHistoryPoint[];
  /** 추적 키워드의 현재 순위와 실제 검색량. null 순위는 100위 밖(미노출)이다. */
  keywords: readonly {
    position: number | null;
    volume: number | null;
  }[];
  sparklineBuckets?: number;
}

const DEFAULT_SPARKLINE_BUCKETS = 12;

const VOLUME_MISSING_REASON =
  "검색량 데이터가 아직 수집되지 않아 예상 트래픽을 계산할 수 없습니다. 키워드 검색량이 수집되면 자동으로 채워집니다.";

/** 가시성 이력을 스파크라인 입력 형태로 바꾼다. */
function toObservations(history: readonly VisibilityHistoryPoint[]) {
  return history.map((point) => ({
    keyword: "visibility",
    position: point.visibility,
    capturedAt: new Date(point.capturedAt),
  }));
}

function averagePosition(positions: readonly (number | null)[]): number | null {
  // null 은 100위 밖이다. 평균에 섞으면 순위가 좋아 보이는 착시가 생기므로 제외한다.
  const ranked = positions.filter((position): position is number => position !== null);
  if (ranked.length === 0) return null;
  const total = ranked.reduce((sum, position) => sum + position, 0);
  return total / ranked.length;
}

export function buildMetricCards(input: BuildMetricCardsInput): MetricCard[] {
  const buckets = input.sparklineBuckets ?? DEFAULT_SPARKLINE_BUCKETS;
  const history = input.visibilityHistory;
  const latest = history.at(-1) ?? null;
  const previous = history.length >= 2 ? (history.at(-2) ?? null) : null;
  const positions = input.keywords.map((keyword) => keyword.position);
  // 0도 유효한 검색량 관측이다. null만 "아직 수집되지 않음"으로 취급한다.
  const volumeAvailable =
    input.keywords.length > 0 && input.keywords.every((keyword) => keyword.volume !== null);
  const trafficRows = input.keywords.flatMap((keyword) =>
    keyword.position !== null && keyword.volume !== null
      ? [{ position: keyword.position, volume: keyword.volume }]
      : [],
  );

  const visibility: MetricCard = {
    key: "visibility",
    label: "가시성",
    value: latest ? latest.visibility : null,
    unit: "%",
    precision: 2,
    delta: previous ? calculateDelta(previous.visibility, latest?.visibility ?? null) : null,
    sparkline: buildSparkline(toObservations(history), buckets),
    status: "live",
  };

  const estimatedTraffic: MetricCard = volumeAvailable
    ? {
        key: "estimated-traffic",
        label: "예상 트래픽",
        value: estimateOrganicTraffic(trafficRows),
        unit: null,
        precision: 0,
        delta: null,
        sparkline: new Array<number | null>(buckets).fill(null),
        status: "live",
      }
    : {
        key: "estimated-traffic",
        label: "예상 트래픽",
        value: null,
        unit: null,
        precision: 0,
        delta: null,
        sparkline: new Array<number | null>(buckets).fill(null),
        status: "unavailable",
        reason: VOLUME_MISSING_REASON,
      };

  const average: MetricCard = {
    key: "average-position",
    label: "평균 포지션",
    value: averagePosition(positions),
    unit: null,
    precision: 2,
    delta: null,
    sparkline: new Array<number | null>(buckets).fill(null),
    status: "live",
  };

  return [visibility, estimatedTraffic, average];
}
