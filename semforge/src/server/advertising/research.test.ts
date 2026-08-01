import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePlaAvailability,
  summarizeResearchOutcomes,
} from "@/server/advertising/research-state";

const completedZero = {
  status: "completed" as const,
  adCount: 0,
  shoppingCount: 0,
  shoppingAvailability: "no_results" as const,
};

test("실제 광고 0건과 수집 실패를 서로 다른 결과로 집계한다", () => {
  const summary = summarizeResearchOutcomes([
    completedZero,
    { status: "failed", adCount: 0, shoppingCount: 0, shoppingAvailability: "unavailable" },
    { status: "completed", adCount: 2, shoppingCount: 0, shoppingAvailability: "no_results" },
  ]);
  assert.deepEqual(summary, { zeroResultKeywords: 1, failedKeywords: 1 });
});

test("PLA 지원 0건과 공급자 미지원 응답을 구분한다", () => {
  assert.equal(derivePlaAvailability("completed", [completedZero]), "no_results");
  assert.equal(
    derivePlaAvailability("failed", [
      { status: "failed", adCount: 0, shoppingCount: 0, shoppingAvailability: "unavailable" },
    ]),
    "unavailable",
  );
  assert.equal(
    derivePlaAvailability("completed", [
      { status: "completed", adCount: 0, shoppingCount: 1, shoppingAvailability: "available" },
    ]),
    "available",
  );
  assert.equal(derivePlaAvailability("running", []), "checking");
});
