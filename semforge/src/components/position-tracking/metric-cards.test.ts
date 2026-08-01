import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMetricCards } from "@/components/position-tracking/metric-cards";

const history = [
  { capturedAt: "2026-07-29T00:00:00.000Z", visibility: 10 },
  { capturedAt: "2026-07-30T00:00:00.000Z", visibility: 12 },
  { capturedAt: "2026-07-31T00:00:00.000Z", visibility: 15 },
];

function cardOf(cards: ReturnType<typeof buildMetricCards>, key: string) {
  const found = cards.find((card) => card.key === key);
  assert.ok(found, `${key} 카드가 있어야 한다`);
  return found;
}

test("영상 기준 카드 3개를 순서대로 만든다", () => {
  const cards = buildMetricCards({
    visibilityHistory: history,
    keywords: [
      { position: 3, volume: null },
      { position: 8, volume: null },
    ],
  });
  assert.deepEqual(
    cards.map((card) => card.key),
    ["visibility", "estimated-traffic", "average-position"]
  );
});

test("가시성은 최신값과 직전 대비 증감을 낸다", () => {
  const card = cardOf(
    buildMetricCards({ visibilityHistory: history, keywords: [] }),
    "visibility"
  );
  assert.equal(card.value, 15);
  assert.equal(card.delta?.absolute, 3);
  assert.equal(card.status, "live");
});

test("관측이 1건뿐이면 비교 대상이 없으므로 증감은 null 이다", () => {
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: [history[0]],
      keywords: [],
    }),
    "visibility"
  );
  assert.equal(card.value, 10);
  assert.equal(card.delta, null);
});

test("이력이 없으면 값은 0 이 아니라 null 이다", () => {
  // 0% 로 표시하면 "가시성이 0" 이라는 사실 주장이 되어 버린다. 아직 모르는 것과 다르다.
  const card = cardOf(
    buildMetricCards({ visibilityHistory: [], keywords: [] }),
    "visibility"
  );
  assert.equal(card.value, null);
  assert.equal(card.delta, null);
});

test("평균 포지션은 순위가 있는 키워드만으로 계산한다", () => {
  // null 은 100위 밖이며 0 위가 아니다. 평균에 섞으면 순위가 좋아 보이는 착시가 생긴다.
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: history,
      keywords: [2, 4, null, null].map((position) => ({ position, volume: null })),
    }),
    "average-position"
  );
  assert.equal(card.value, 3);
});

test("순위에 든 키워드가 하나도 없으면 평균 포지션은 null 이다", () => {
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: history,
      keywords: [
        { position: null, volume: null },
        { position: null, volume: null },
      ],
    }),
    "average-position"
  );
  assert.equal(card.value, null);
  assert.equal(card.status, "live", "데이터 소스는 있으므로 unavailable 이 아니다");
});

test("검색량 데이터가 없으면 예상 트래픽은 unavailable 이며 사유를 갖는다", () => {
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: history,
      keywords: [{ position: 1, volume: null }],
    }),
    "estimated-traffic"
  );
  assert.equal(card.status, "unavailable");
  assert.equal(card.value, null);
  assert.ok((card.reason ?? "").trim().length > 0);
});

test("검색량이 확보되면 저장소의 CTR 모델로 예상 트래픽을 계산한다", () => {
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: history,
      keywords: [
        { position: 1, volume: 1_000 },
        { position: 2, volume: 100 },
      ],
    }),
    "estimated-traffic"
  );
  assert.equal(card.status, "live");
  assert.equal(card.value, 294);
  assert.equal(card.reason, undefined);
});

test("검색량 0은 미수집이 아니라 실제 관측값으로 처리한다", () => {
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: history,
      keywords: [{ position: 1, volume: 0 }],
    }),
    "estimated-traffic",
  );
  assert.equal(card.status, "live");
  assert.equal(card.value, 0);
});

test("일부 키워드의 검색량만 있으면 전체 예상치로 오해하지 않도록 unavailable 이다", () => {
  const card = cardOf(
    buildMetricCards({
      visibilityHistory: history,
      keywords: [
        { position: 1, volume: 1_000 },
        { position: 2, volume: null },
      ],
    }),
    "estimated-traffic",
  );
  assert.equal(card.status, "unavailable");
  assert.equal(card.value, null);
});

test("스파크라인은 요청한 구간 수만큼 나오고 관측 없는 구간은 null 이다", () => {
  const card = cardOf(
    buildMetricCards({ visibilityHistory: history, keywords: [], sparklineBuckets: 6 }),
    "visibility"
  );
  assert.equal(card.sparkline.length, 6);
  assert.ok(card.sparkline.some((point) => point !== null));
});
