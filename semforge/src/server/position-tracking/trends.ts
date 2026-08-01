/**
 * 포지션 추적 이력의 파생 지표 계산.
 *
 * 데이터 저장소에 접근하지 않으며 전달받은 관측 배열만 읽는다. 순위가 null 이면
 * 100위 밖 미노출을 뜻하고, 관측 자체가 없는 상태와 숫자 0을 서로 바꾸지 않는다.
 */

export interface RankObservation {
  keyword: string;
  position: number | null;
  capturedAt: Date;
}

export interface RankWindowComparison {
  improved: number;
  declined: number;
  unchanged: number;
  added: number;
  lost: number;
}

export type DeltaDirection = "up" | "down" | "flat";

export interface DeltaResult {
  absolute: number | null;
  percent: number | null;
  direction: DeltaDirection | null;
}

export type KeywordBucketKey = "top3" | "top10" | "top20" | "top100";

export interface KeywordBucketSummary {
  key: KeywordBucketKey;
  min: 1;
  max: 3 | 10 | 20 | 100;
  /** 최신 시점에 이 범위 안에 있는 키워드 수. 이력이 없으면 null. */
  count: number | null;
  /** 직전 시점에는 범위 밖이었지만 최신 시점에는 범위 안인 키워드 수. */
  added: number | null;
  /** 직전 시점에는 범위 안이었지만 최신 시점에는 범위 밖인 키워드 수. */
  lost: number | null;
}

const KEYWORD_BUCKETS: readonly Pick<KeywordBucketSummary, "key" | "min" | "max">[] = [
  { key: "top3", min: 1, max: 3 },
  { key: "top10", min: 1, max: 10 },
  { key: "top20", min: 1, max: 20 },
  { key: "top100", min: 1, max: 100 },
];

function positionsByKeyword(
  observations: readonly RankObservation[]
): Map<string, number | null> {
  return new Map(observations.map((observation) => [observation.keyword, observation.position]));
}

/** 두 순위 스냅샷에서 키워드별 상태 변화를 센다. */
export function compareRankWindows(
  previous: readonly RankObservation[],
  current: readonly RankObservation[]
): RankWindowComparison {
  const previousByKeyword = positionsByKeyword(previous);
  const currentByKeyword = positionsByKeyword(current);
  const keywords = new Set([...previousByKeyword.keys(), ...currentByKeyword.keys()]);
  const result: RankWindowComparison = {
    improved: 0,
    declined: 0,
    unchanged: 0,
    added: 0,
    lost: 0,
  };

  for (const keyword of keywords) {
    const previousPosition = previousByKeyword.get(keyword) ?? null;
    const currentPosition = currentByKeyword.get(keyword) ?? null;

    if (previousPosition === null && currentPosition !== null) {
      result.added += 1;
    } else if (previousPosition !== null && currentPosition === null) {
      result.lost += 1;
    } else if (previousPosition === null || currentPosition === null) {
      result.unchanged += 1;
    } else if (currentPosition < previousPosition) {
      result.improved += 1;
    } else if (currentPosition > previousPosition) {
      result.declined += 1;
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}

/**
 * 전체 관측 기간을 같은 길이의 구간으로 나누고 각 구간의 노출 순위 평균을 만든다.
 * 숫자 순위가 하나도 없는 구간은 0이 아니라 null이다. 단일 시점은 최신값이므로
 * 스파크라인의 마지막 칸에 배치한다.
 */
export function buildSparkline(
  observations: readonly RankObservation[],
  bucketCount: number
): (number | null)[] {
  if (!Number.isInteger(bucketCount) || bucketCount < 1) {
    throw new RangeError("스파크라인 구간 수는 1 이상의 정수여야 합니다.");
  }

  const result = new Array<number | null>(bucketCount).fill(null);
  if (observations.length === 0) return result;

  const timestamps = observations.map((observation) => observation.capturedAt.getTime());
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  const sums = new Array<number>(bucketCount).fill(0);
  const counts = new Array<number>(bucketCount).fill(0);

  for (const observation of observations) {
    if (observation.position === null) continue;

    const timestamp = observation.capturedAt.getTime();
    const bucketIndex =
      firstTimestamp === lastTimestamp
        ? bucketCount - 1
        : Math.min(
            bucketCount - 1,
            Math.floor(
              ((timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * bucketCount
            )
          );
    sums[bucketIndex] += observation.position;
    counts[bucketIndex] += 1;
  }

  for (let index = 0; index < bucketCount; index += 1) {
    if (counts[index] > 0) result[index] = sums[index] / counts[index];
  }
  return result;
}

/** 두 값의 부호 있는 절대 변화량과 변화율을 계산한다. */
export function calculateDelta(
  previousValue: number | null,
  currentValue: number | null
): DeltaResult {
  if (previousValue === null || currentValue === null) {
    return { absolute: null, percent: null, direction: null };
  }

  const absolute = currentValue - previousValue;
  return {
    absolute,
    percent: previousValue === 0 ? null : (absolute / previousValue) * 100,
    direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat",
  };
}

function isInBucket(position: number | null | undefined, max: number): boolean {
  return position !== null && position !== undefined && position >= 1 && position <= max;
}

/**
 * 최신 시점의 상위 N위 누적 키워드 수와 직전 시점 대비 진입·이탈 수를 만든다.
 * 시점이 하나뿐이면 변화는 판정할 수 없으므로 added/lost를 null로 둔다.
 */
export function summarizeKeywordBuckets(
  observations: readonly RankObservation[]
): KeywordBucketSummary[] {
  if (observations.length === 0) {
    return KEYWORD_BUCKETS.map((bucket) => ({
      ...bucket,
      count: null,
      added: null,
      lost: null,
    }));
  }

  const timestamps = [...new Set(observations.map((observation) => observation.capturedAt.getTime()))]
    .sort((a, b) => b - a);
  const currentTimestamp = timestamps[0];
  const previousTimestamp = timestamps[1];
  const current = positionsByKeyword(
    observations.filter((observation) => observation.capturedAt.getTime() === currentTimestamp)
  );
  const previous =
    previousTimestamp === undefined
      ? null
      : positionsByKeyword(
          observations.filter((observation) => observation.capturedAt.getTime() === previousTimestamp)
        );

  return KEYWORD_BUCKETS.map((bucket) => {
    const count = [...current.values()].filter((position) => isInBucket(position, bucket.max)).length;
    if (previous === null) {
      return { ...bucket, count, added: null, lost: null };
    }

    const keywords = new Set([...previous.keys(), ...current.keys()]);
    let added = 0;
    let lost = 0;
    for (const keyword of keywords) {
      const wasInBucket = isInBucket(previous.get(keyword), bucket.max);
      const isCurrentlyInBucket = isInBucket(current.get(keyword), bucket.max);
      if (!wasInBucket && isCurrentlyInBucket) added += 1;
      if (wasInBucket && !isCurrentlyInBucket) lost += 1;
    }
    return { ...bucket, count, added, lost };
  });
}
