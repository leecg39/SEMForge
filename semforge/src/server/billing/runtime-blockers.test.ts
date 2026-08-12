// @TASK P2-RUNTIME-FIX - Billing runtime blocker regressions
// @SPEC user-approved-plan#워커와-결제
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type BillingAccount,
  type BillingLedgerEntry,
  type BillingStore,
  type PaymentAttempt,
  createBillingService,
} from "@/server/billing/service";
import type { TossBillingClient, TossPayment } from "@/server/billing/toss-client";

const NOW = new Date("2026-08-11T03:00:00.000Z");
const WORKSPACE_ID = "0198f06a-1b42-7000-8000-200000000001";
const CUSTOMER_ID = "0198f06a-1b42-7000-8000-200000000002";
const SUBSCRIPTION_ID = "0198f06a-1b42-7000-8000-200000000003";
const METHOD_ID = "0198f06a-1b42-7000-8000-200000000004";
const USER_ID = "0198f06a-1b42-7000-8000-200000000005";

function payment(orderId: string, status = "DONE"): TossPayment {
  return {
    paymentKey: "known-payment-key",
    orderId,
    status,
    totalAmount: 49_000,
    requestedAt: "2026-08-11T12:00:00+09:00",
    approvedAt: status === "DONE" ? "2026-08-11T12:00:02+09:00" : null,
    method: "카드",
    card: null,
  };
}

function account(): BillingAccount {
  return {
    customer: {
      id: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      tossCustomerKey: "customer-runtime",
    },
    subscription: {
      id: SUBSCRIPTION_ID,
      workspaceId: WORKSPACE_ID,
      billingCustomerId: CUSTOMER_ID,
      paymentMethodId: METHOD_ID,
      status: "past_due",
      amountKrw: 49_000,
      currentPeriodStart: new Date("2026-08-11T03:00:00.000Z"),
      currentPeriodEnd: new Date("2026-09-11T03:00:00.000Z"),
      graceEndsAt: new Date("2026-08-18T03:00:00.000Z"),
      canceledAt: null,
    },
    paymentMethod: {
      id: METHOD_ID,
      workspaceId: WORKSPACE_ID,
      billingCustomerId: CUSTOMER_ID,
      billingKeyEncrypted: "enc:v1:test",
      billingKeyFingerprint: "f".repeat(64),
      cardBrand: "11",
      cardLast4: "1234",
      active: true,
      replacedAt: null,
    },
    latestPayment: {
      id: "0198f06a-1b42-7000-8000-200000000006",
      workspaceId: WORKSPACE_ID,
      subscriptionId: SUBSCRIPTION_ID,
      orderId: "sf_previous_failed",
      idempotencyKey: "previous-internal-key",
      tossPaymentKey: null,
      status: "failed",
      amountKrw: 49_000,
      billingPeriodStart: new Date("2026-08-11T03:00:00.000Z"),
      billingPeriodEnd: new Date("2026-09-11T03:00:00.000Z"),
      attempt: 1,
      failureCode: "REJECT_CARD_COMPANY",
      failureMessage: "Toss 결제가 거절됐습니다.",
      paidAt: null,
    },
  };
}

class RuntimeBillingStore implements BillingStore {
  account = account();
  attempts: PaymentAttempt[] = [structuredClone(this.account.latestPayment!)];
  ledger: BillingLedgerEntry[] = [];
  events = new Map<string, "processing" | "processed">();
  disabledPaymentMethodIds: string[] = [];

  async getAccount(workspaceId: string) {
    return workspaceId === this.account.subscription.workspaceId
      ? structuredClone(this.account)
      : null;
  }

  async savePaymentMethod(): Promise<never> {
    throw new Error("not used");
  }

  async reserveCharge(input: Parameters<BillingStore["reserveCharge"]>[0]) {
    const byIdempotency = this.attempts.find(
      (attempt) => attempt.idempotencyKey === input.attempt.idempotencyKey,
    );
    if (byIdempotency) {
      return {
        account: structuredClone(this.account),
        attempt: structuredClone(byIdempotency),
        created: false,
      };
    }
    this.attempts.push(structuredClone(input.attempt));
    this.account = {
      ...this.account,
      latestPayment: structuredClone(input.attempt),
      subscription: { ...this.account.subscription, status: "charge_pending" },
    };
    this.ledger.push(structuredClone(input.ledger));
    return {
      account: structuredClone(this.account),
      attempt: structuredClone(input.attempt),
      created: true,
    };
  }

  async settleCharge(input: Parameters<BillingStore["settleCharge"]>[0]) {
    const index = this.attempts.findIndex((attempt) => attempt.orderId === input.orderId);
    assert.notEqual(index, -1);
    const current = this.attempts[index]!;
    if (current.status === input.status) {
      return { account: structuredClone(this.account), changed: false };
    }
    const settled = {
      ...current,
      status: input.status,
      tossPaymentKey: input.tossPaymentKey,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      paidAt: input.paidAt,
    };
    this.attempts[index] = settled;
    this.account = {
      ...this.account,
      latestPayment: settled,
      subscription: {
        ...this.account.subscription,
        status: input.status === "paid" ? "active" : "past_due",
        graceEndsAt: input.graceEndsAt,
      },
    };
    this.ledger.push(structuredClone(input.ledger));
    return { account: structuredClone(this.account), changed: true };
  }

  async scheduleCancellation(): Promise<never> {
    throw new Error("not used");
  }

  async claimProviderEvent(input: Parameters<BillingStore["claimProviderEvent"]>[0]) {
    const existing = this.events.get(input.providerEventId);
    if (existing === "processed") return "processed" as const;
    this.events.set(input.providerEventId, "processing");
    return existing ? ("retry" as const) : ("claimed" as const);
  }

  async completeProviderEvent(input: Parameters<BillingStore["completeProviderEvent"]>[0]) {
    this.events.set(input.providerEventId, "processed");
  }

  async findPaymentByOrderId(orderId: string) {
    const found = this.attempts.find((attempt) => attempt.orderId === orderId);
    return found ? structuredClone(found) : null;
  }

  async findPaymentByIdempotencyKey(workspaceId: string, idempotencyKey: string) {
    if (workspaceId !== this.account.subscription.workspaceId) return null;
    const found = this.attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
    return found ? structuredClone(found) : null;
  }

  async disablePaymentMethod() {
    const method = this.account.paymentMethod;
    if (!method) return { account: structuredClone(this.account), changed: false };
    this.disabledPaymentMethodIds.push(method.id);
    this.account = {
      ...this.account,
      paymentMethod: { ...method, active: false, replacedAt: NOW },
      subscription: {
        ...this.account.subscription,
        paymentMethodId: null,
        status: "past_due",
        graceEndsAt: this.account.subscription.graceEndsAt ?? new Date("2026-08-18T03:00:00.000Z"),
      },
    };
    return { account: structuredClone(this.account), changed: true };
  }

  async findAccountByBillingKey(billingKey: string) {
    return billingKey === "billing-key-secret" ? structuredClone(this.account) : null;
  }
}

function tossStub(overrides: Partial<TossBillingClient> = {}): TossBillingClient {
  return {
    async issueBillingKey() {
      throw new Error("not used");
    },
    async chargeBillingKey(input) {
      return payment(input.orderId);
    },
    async queryPaymentByOrderId(orderId) {
      return payment(orderId);
    },
    async queryPaymentByPaymentKey(paymentKey) {
      return paymentKey === "known-payment-key" ? payment("server-known-order") : null;
    },
    async deleteBillingKey() {},
    ...overrides,
  };
}

function service(store: BillingStore, toss = tossStub()) {
  return createBillingService({
    store,
    toss,
    billingKeyVault: {
      encrypt: () => "enc:v1:test",
      decrypt: () => "billing-key-secret",
    },
    now: () => new Date(NOW),
  });
}

test("external Idempotency-Key replay for retryPastDue returns the same payment attempt and never advances to the next retry", async () => {
  const store = new RuntimeBillingStore();
  let chargeCalls = 0;
  const billing = service(
    store,
    tossStub({
      async chargeBillingKey(input) {
        chargeCalls += 1;
        return payment(input.orderId);
      },
    }),
  );
  const input = {
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    requestId: "req-retry-replay",
    force: true,
    idempotencyKey: "browser-retry-key-1",
  };

  await billing.retryPastDue(input);
  await billing.retryPastDue(input);

  assert.equal(chargeCalls, 1);
  assert.equal(store.attempts.length, 2);
  assert.equal(store.attempts[1]?.attempt, 2);
  assert.equal(store.attempts[1]?.idempotencyKey.includes("browser-retry-key-1"), true);
});

test("PAYMENT_STATUS_CHANGED is an untrusted notification: paymentKey/order fingerprint mismatch is ignored after Toss Query reconciliation", async () => {
  const store = new RuntimeBillingStore();
  const billing = service(store);

  const result = await billing.handleWebhook({
    transmissionId: "transmission-fingerprint-mismatch",
    event: {
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-08-11T12:00:05+09:00",
      data: {
        orderId: store.attempts[0]!.orderId,
        paymentKey: "known-payment-key",
        status: "DONE",
      },
    },
    receivedAt: new Date("2026-08-11T03:00:05.000Z"),
  });

  assert.equal(result.outcome, "ignored");
  assert.equal(result.reason, "payment_fingerprint_mismatch");
  assert.equal(store.account.subscription.status, "past_due");
});

test("PAYMENT_STATUS_CHANGED는 Toss Query로 검증할 수 없으면 body의 DONE만으로 정산하지 않는다", async () => {
  const store = new RuntimeBillingStore();
  const billing = service(
    store,
    tossStub({
      async queryPaymentByPaymentKey() {
        return null;
      },
      async queryPaymentByOrderId() {
        return null;
      },
    }),
  );

  const result = await billing.handleWebhook({
    transmissionId: "transmission-unverified-payment",
    event: {
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-08-11T12:00:05+09:00",
      data: {
        orderId: store.attempts[0]!.orderId,
        paymentKey: "attacker-controlled-payment-key",
        status: "DONE",
      },
    },
    receivedAt: new Date("2026-08-11T03:00:05.000Z"),
  });

  assert.deepEqual(result, {
    outcome: "ignored",
    reason: "provider_payment_unverified",
  });
  assert.equal(store.account.subscription.status, "past_due");
  assert.equal(store.ledger.some((entry) => entry.type === "charge.succeeded"), false);
});

test("BILLING_DELETED resolves tenant by billing key fingerprint and disables the server-known payment method", async () => {
  const store = new RuntimeBillingStore();
  const billing = service(store);

  const result = await billing.handleWebhook({
    transmissionId: "transmission-billing-deleted",
    event: {
      eventType: "BILLING_DELETED",
      createdAt: "2026-08-11T12:00:05+09:00",
      billingKey: "billing-key-secret",
      reason: "provider reason is not persisted",
    },
    receivedAt: new Date("2026-08-11T03:00:05.000Z"),
  });

  assert.equal(result.outcome, "processed");
  assert.deepEqual(store.disabledPaymentMethodIds, [METHOD_ID]);
  assert.equal(store.account.paymentMethod?.active, false);
  assert.equal(store.account.subscription.paymentMethodId, null);
});
