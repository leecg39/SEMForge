import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSparkline,
  calculateDelta,
  compareRankWindows,
  summarizeKeywordBuckets,
  type RankObservation,
} from "@/server/position-tracking/trends";

const at = (day: number) => new Date(Date.UTC(2026, 6, day));

test("순위 숫자가 작아지면 개선, 커지면 하락으로 집계한다", () => {
  const previous: RankObservation[] = [
    { keyword: "개선", position: 10, capturedAt: at(1) },
    { keyword: "하락", position: 2, capturedAt: at(1) },
    { keyword: "유지", position: 7, capturedAt: at(1) },
  ];
  const current: RankObservation[] = [
    { keyword: "개선", position: 3, capturedAt: at(2) },
    { keyword: "하락", position: 8, capturedAt: at(2) },
    { keyword: "유지", position: 7, capturedAt: at(2) },
  ];

  assert.deepEqual(compareRankWindows(previous, current), {
    improved: 1,
    declined: 1,
    unchanged: 1,
    added: 0,
    lost: 0,
  });
});

test("null 과 숫자 사이의 전환을 신규와 누락으로 구분한다", () => {
  const result = compareRankWindows(
    [
      { keyword: "진입", position: null, capturedAt: at(1) },
      { keyword: "이탈", position: 20, capturedAt: at(1) },
      { keyword: "계속 미노출", position: null, capturedAt: at(1) },
      { keyword: "삭제된 행", position: 9, capturedAt: at(1) },
    ],
    [
      { keyword: "진입", position: 6, capturedAt: at(2) },
      { keyword: "이탈", position: null, capturedAt: at(2) },
      { keyword: "계속 미노출", position: null, capturedAt: at(2) },
      { keyword: "새 행", position: 4, capturedAt: at(2) },
    ]
  );

  assert.deepEqual(result, {
    improved: 0,
    declined: 0,
    unchanged: 1,
    added: 2,
    lost: 2,
  });
});

test("비교 함수는 빈 스냅샷을 처리하고 입력을 변경하지 않는다", () => {
  const previous: RankObservation[] = [];
  const current: RankObservation[] = [];

  assert.deepEqual(compareRankWindows(previous, current), {
    improved: 0,
    declined: 0,
    unchanged: 0,
    added: 0,
    lost: 0,
  });
  assert.deepEqual(previous, []);
  assert.deepEqual(current, []);
});

test("스파크라인은 시간 구간별 노출 순위 평균과 빈 구간 null 을 반환한다", () => {
  const observations: RankObservation[] = [
    { keyword: "가", position: 10, capturedAt: at(1) },
    { keyword: "나", position: 20, capturedAt: at(1) },
    { keyword: "가", position: null, capturedAt: at(3) },
    { keyword: "가", position: 6, capturedAt: at(5) },
  ];
  const original = observations.map((row) => ({ ...row }));

  assert.deepEqual(buildSparkline(observations, 3), [15, null, 6]);
  assert.deepEqual(observations, original);
});

test("스파크라인은 빈 이력과 관측 한 건을 판정 불가 null 로 보존한다", () => {
  assert.deepEqual(buildSparkline([], 3), [null, null, null]);
  assert.deepEqual(
    buildSparkline([{ keyword: "가", position: 7, capturedAt: at(1) }], 3),
    [null, null, 7]
  );
  assert.deepEqual(
    buildSparkline([{ keyword: "가", position: null, capturedAt: at(1) }], 2),
    [null, null]
  );
});

test("델타는 절대 변화량, 변화율, 방향을 계산한다", () => {
  assert.deepEqual(calculateDelta(10, 15), {
    absolute: 5,
    percent: 50,
    direction: "up",
  });
  assert.deepEqual(calculateDelta(10, 5), {
    absolute: -5,
    percent: -50,
    direction: "down",
  });
  assert.deepEqual(calculateDelta(10, 10), {
    absolute: 0,
    percent: 0,
    direction: "flat",
  });
});

test("이전 값이 0 이거나 null 이면 변화율을 만들지 않는다", () => {
  assert.deepEqual(calculateDelta(0, 5), {
    absolute: 5,
    percent: null,
    direction: "up",
  });
  assert.deepEqual(calculateDelta(null, 5), {
    absolute: null,
    percent: null,
    direction: null,
  });
  assert.deepEqual(calculateDelta(5, null), {
    absolute: null,
    percent: null,
    direction: null,
  });
});

test("키워드 버킷은 3위, 10위, 20위, 100위 경계를 누적 집계한다", () => {
  const observations: RankObservation[] = [
    { keyword: "경계3", position: 4, capturedAt: at(1) },
    { keyword: "경계10", position: 11, capturedAt: at(1) },
    { keyword: "경계20", position: 21, capturedAt: at(1) },
    { keyword: "경계100", position: null, capturedAt: at(1) },
    { keyword: "누락", position: 2, capturedAt: at(1) },
    { keyword: "경계3", position: 3, capturedAt: at(2) },
    { keyword: "경계10", position: 10, capturedAt: at(2) },
    { keyword: "경계20", position: 20, capturedAt: at(2) },
    { keyword: "경계100", position: 100, capturedAt: at(2) },
    { keyword: "누락", position: null, capturedAt: at(2) },
  ];

  assert.deepEqual(summarizeKeywordBuckets(observations), [
    { key: "top3", min: 1, max: 3, count: 1, added: 1, lost: 1 },
    { key: "top10", min: 1, max: 10, count: 2, added: 1, lost: 1 },
    { key: "top20", min: 1, max: 20, count: 3, added: 1, lost: 1 },
    { key: "top100", min: 1, max: 100, count: 4, added: 1, lost: 1 },
  ]);
});

test("키워드 버킷은 빈 이력과 단일 시점에서 신규·누락을 추정하지 않는다", () => {
  assert.deepEqual(summarizeKeywordBuckets([]), [
    { key: "top3", min: 1, max: 3, count: null, added: null, lost: null },
    { key: "top10", min: 1, max: 10, count: null, added: null, lost: null },
    { key: "top20", min: 1, max: 20, count: null, added: null, lost: null },
    { key: "top100", min: 1, max: 100, count: null, added: null, lost: null },
  ]);

  assert.deepEqual(
    summarizeKeywordBuckets([
      { keyword: "가", position: 3, capturedAt: at(1) },
      { keyword: "나", position: null, capturedAt: at(1) },
    ]),
    [
      { key: "top3", min: 1, max: 3, count: 1, added: null, lost: null },
      { key: "top10", min: 1, max: 10, count: 1, added: null, lost: null },
      { key: "top20", min: 1, max: 20, count: 1, added: null, lost: null },
      { key: "top100", min: 1, max: 100, count: 1, added: null, lost: null },
    ]
  );
});
