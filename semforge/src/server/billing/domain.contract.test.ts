// @TASK P2-B1-T1 - Toss automatic billing domain contract
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretCrypto } from "@/lib/crypto";
import {
  BILLING_AMOUNT_KRW,
  SUBSCRIPTION_STATUSES,
  assertSubscriptionTransition,
  billingKeyAad,
  createBillingKeyVault,
  decideBillingAccess,
  deriveChargeIdentity,
  retryAtForAttempt,
  subscriptionCancellationPolicy,
} from "@/server/billing/domain";

test("코어 스키마와 같은 SubscriptionStatus 목록을 고정한다", () => {
  assert.deepEqual(SUBSCRIPTION_STATUSES, [
    "invited",
    "account_created",
    "billing_authorized",
    "charge_pending",
    "active",
    "past_due",
    "cancel_at_period_end",
    "canceled",
  ]);
  assert.equal(BILLING_AMOUNT_KRW, 49_000);
});

test("결제 성공 전에 active로 건너뛰지 못하는 상태 머신을 적용한다", () => {
  assert.doesNotThrow(() => assertSubscriptionTransition("account_created", "billing_authorized"));
  assert.doesNotThrow(() => assertSubscriptionTransition("billing_authorized", "charge_pending"));
  assert.doesNotThrow(() => assertSubscriptionTransition("charge_pending", "active"));
  assert.doesNotThrow(() => assertSubscriptionTransition("charge_pending", "past_due"));
  assert.doesNotThrow(() => assertSubscriptionTransition("past_due", "charge_pending"));
  assert.doesNotThrow(() => assertSubscriptionTransition("active", "cancel_at_period_end"));
  assert.doesNotThrow(() => assertSubscriptionTransition("cancel_at_period_end", "canceled"));
  assert.throws(
    () => assertSubscriptionTransition("billing_authorized", "active"),
    /billing_authorized.*active/,
  );
  assert.throws(() => assertSubscriptionTransition("canceled", "active"), /canceled.*active/);
});

test("청구기간과 시도 번호로 안정적인 orderId와 idempotency key를 만든다", () => {
  const input = {
    subscriptionId: "0198f06a-1b42-7000-8000-000000000001",
    billingPeriodStart: new Date("2026-08-11T00:00:00.000Z"),
    attempt: 1,
  } as const;
  const first = deriveChargeIdentity(input);
  const replay = deriveChargeIdentity(input);
  const retry = deriveChargeIdentity({ ...input, attempt: 2 });

  assert.deepEqual(replay, first);
  assert.match(first.orderId, /^[A-Za-z0-9_-]{6,64}$/);
  assert.ok(first.idempotencyKey.length <= 300);
  assert.notEqual(retry.orderId, first.orderId);
  assert.notEqual(retry.idempotencyKey, first.idempotencyKey);
});

test("+1/+3/+5일 재시도와 7일 grace 계약을 절대 시각으로 계산한다", () => {
  const periodStart = new Date("2026-08-11T12:34:56.000Z");
  assert.equal(retryAtForAttempt(periodStart, 2)?.toISOString(), "2026-08-12T12:34:56.000Z");
  assert.equal(retryAtForAttempt(periodStart, 3)?.toISOString(), "2026-08-14T12:34:56.000Z");
  assert.equal(retryAtForAttempt(periodStart, 4)?.toISOString(), "2026-08-16T12:34:56.000Z");
  assert.equal(retryAtForAttempt(periodStart, 5), null);
});

test("past_due grace 중에는 과거 리포트 read만 허용하고 생성·수정을 차단한다", () => {
  const subscription = {
    status: "past_due" as const,
    currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-11T00:00:00.000Z"),
    graceEndsAt: new Date("2026-08-18T00:00:00.000Z"),
  };
  const now = new Date("2026-08-13T00:00:00.000Z");

  assert.deepEqual(
    decideBillingAccess(subscription, {
      capability: "report:read",
      reportPeriodEnd: new Date("2026-07-31T23:59:59.000Z"),
      now,
    }),
    { allowed: true, mode: "past_reports_only", reason: "past_due_grace" },
  );
  assert.equal(
    decideBillingAccess(subscription, {
      capability: "report:read",
      reportPeriodEnd: new Date("2026-08-02T00:00:00.000Z"),
      now,
    }).allowed,
    false,
  );
  assert.equal(
    decideBillingAccess(subscription, { capability: "workspace:write", now }).allowed,
    false,
  );
  assert.equal(
    decideBillingAccess(subscription, {
      capability: "report:read",
      reportPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
      now: new Date("2026-08-18T00:00:00.000Z"),
    }).allowed,
    false,
  );
});

test("billing key를 workspace/record AAD에 묶은 AES-GCM envelope로만 보관한다", () => {
  const crypto = createSecretCrypto({
    currentKeyId: "billing-test-key",
    currentSecret: "billing-test-secret-material-at-least-32-bytes",
  });
  const vault = createBillingKeyVault(crypto);
  const workspaceId = "0198f06a-1b42-7000-8000-000000000001";
  const methodId = "0198f06a-1b42-7000-8000-000000000002";
  const encrypted = vault.encrypt("billing-key-secret", workspaceId, methodId);

  assert.match(encrypted, /^enc:v1:/);
  assert.equal(vault.decrypt(encrypted, workspaceId, methodId), "billing-key-secret");
  assert.equal(
    crypto.decrypt(encrypted, billingKeyAad("0198f06a-1b42-7000-8000-000000000099", methodId)),
    null,
  );
});

test("기간 말 취소는 일할 환불이 없으며 법정 예외를 명시한다", () => {
  assert.deepEqual(subscriptionCancellationPolicy, {
    timing: "period_end",
    proratedRefund: false,
    statutoryExceptionsApply: true,
    notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
  });
});
