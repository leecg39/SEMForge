import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BILLING_MANAGE_MIN_ROLE,
  PLAN_LABELS,
  describePaymentIntegration,
  resolveBillingState,
} from "@/lib/billing";

test("네 가지 워크스페이스 플랜에 모두 한국어 라벨이 있다", () => {
  assert.deepEqual(Object.keys(PLAN_LABELS).sort(), ["business", "free", "guru", "pro"]);
  for (const label of Object.values(PLAN_LABELS)) {
    assert.ok(label.length > 0);
  }
});

test("free 만 무료이고 나머지는 유료 플랜으로 판정한다", () => {
  assert.equal(resolveBillingState({ plan: "free", role: "owner", memberCount: 1 }).isPaidPlan, false);
  for (const plan of ["pro", "guru", "business"] as const) {
    assert.equal(
      resolveBillingState({ plan, role: "owner", memberCount: 1 }).isPaidPlan,
      true,
      `${plan} 은 유료여야 한다`
    );
  }
});

test("구독 관리는 관리자 이상만 가능하다", () => {
  assert.equal(BILLING_MANAGE_MIN_ROLE, "admin");
  for (const role of ["viewer", "editor"] as const) {
    assert.equal(
      resolveBillingState({ plan: "pro", role, memberCount: 3 }).canManageBilling,
      false,
      `${role} 는 구독을 관리할 수 없어야 한다`
    );
  }
  for (const role of ["admin", "owner"] as const) {
    assert.equal(resolveBillingState({ plan: "pro", role, memberCount: 3 }).canManageBilling, true);
  }
});

test("업그레이드 후보는 현재보다 상위 플랜만 제시한다", () => {
  assert.deepEqual(
    resolveBillingState({ plan: "free", role: "owner", memberCount: 1 }).upgradeCandidates,
    ["pro", "guru", "business"]
  );
  assert.deepEqual(
    resolveBillingState({ plan: "guru", role: "owner", memberCount: 1 }).upgradeCandidates,
    ["business"]
  );
  // 최상위 플랜에서는 업그레이드를 권하지 않는다.
  assert.deepEqual(
    resolveBillingState({ plan: "business", role: "owner", memberCount: 1 }).upgradeCandidates,
    []
  );
});

test("좌석 한도는 코드에 정의가 없으므로 지어내지 않고 null 로 둔다", () => {
  // 플랜별 한도 정의(PLAN_LIMITS 등)가 저장소에 존재하지 않는다.
  // 임의의 숫자를 채우면 사용자가 잘못된 한도를 믿게 되므로 판정 불가로 남긴다.
  const state = resolveBillingState({ plan: "pro", role: "owner", memberCount: 4 });
  assert.equal(state.seats.used, 4);
  assert.equal(state.seats.limit, null);
});

test("결제 연동은 항상 unavailable 이며 사유를 반드시 제공한다", () => {
  const payment = describePaymentIntegration();
  assert.equal(payment.status, "unavailable");
  assert.ok(payment.reason.trim().length > 0);
  assert.equal(resolveBillingState({ plan: "pro", role: "owner", memberCount: 1 }).payment.status, "unavailable");
});

test("결제 제공사가 없으므로 결제수단·인보이스는 지원 동작에 포함하지 않는다", () => {
  // 허위 기능 노출 방지용 회귀 테스트.
  const { supportedActions, unsupportedActions } = describePaymentIntegration();
  const joinedSupported = supportedActions.join(" ");
  for (const forbidden of ["결제수단", "인보이스", "청구서", "자동 갱신"]) {
    assert.ok(
      !joinedSupported.includes(forbidden),
      `지원 동작에 ${forbidden} 이 들어가면 안 된다: ${joinedSupported}`
    );
  }
  assert.ok(unsupportedActions.length > 0, "미지원 동작을 명시해야 한다");
});

test("잘못된 좌석 수는 조용히 넘기지 않고 거부한다", () => {
  assert.throws(() => resolveBillingState({ plan: "pro", role: "owner", memberCount: -1 }), /좌석/);
  assert.throws(
    () => resolveBillingState({ plan: "pro", role: "owner", memberCount: 1.5 }),
    /좌석/
  );
});
