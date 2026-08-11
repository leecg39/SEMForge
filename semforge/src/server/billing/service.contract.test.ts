// @TASK P2-B1-T1 - Automatic billing orchestration and append-only ledger contract
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretCrypto } from "@/lib/crypto";
import { createBillingKeyVault } from "@/server/billing/domain";
import {
  type BillingAccount,
  type BillingLedgerEntry,
  type BillingStore,
  type PaymentAttempt,
  BillingServiceError,
  createBillingService,
} from "@/server/billing/service";
import {
  TossApiError,
  TossTransportError,
  type TossBillingClient,
  type TossPayment,
} from "@/server/billing/toss-client";

const NOW = new Date("2026-08-11T03:00:00.000Z");
const WORKSPACE_ID = "0198f06a-1b42-7000-8000-000000000001";
const USER_ID = "0198f06a-1b42-7000-8000-000000000002";
const CUSTOMER_ID = "0198f06a-1b42-7000-8000-000000000003";
const SUBSCRIPTION_ID = "0198f06a-1b42-7000-8000-000000000004";
const METHOD_ID = "0198f06a-1b42-7000-8000-000000000005";
const CUSTOMER_KEY = "customer_0198f06a";

function tossPayment(orderId: string, status = "DONE"): TossPayment {
  return {
    paymentKey: "payment-key-secret",
    orderId,
    status,
    totalAmount: 49_000,
    requestedAt: "2026-08-11T12:00:00+09:00",
    approvedAt: status === "DONE" ? "2026-08-11T12:00:01+09:00" : null,
    method: "카드",
    card: { issuerCode: "11", number: "12345678****1234" },
  };
}

function initialAccount(): BillingAccount {
  return {
    customer: {
      id: CUSTOMER_ID,
      workspaceId: WORKSPACE_ID,
      tossCustomerKey: CUSTOMER_KEY,
    },
    subscription: {
      id: SUBSCRIPTION_ID,
      workspaceId: WORKSPACE_ID,
      billingCustomerId: CUSTOMER_ID,
      paymentMethodId: null,
      status: "account_created",
      amountKrw: 49_000,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      canceledAt: null,
    },
    paymentMethod: null,
    latestPayment: null,
  };
}

function cloneAccount(account: BillingAccount): BillingAccount {
  return structuredClone(account);
}

class MemoryBillingStore implements BillingStore {
  account = initialAccount();
  attempts: PaymentAttempt[] = [];
  ledger: BillingLedgerEntry[] = [];
  claimedEvents = new Map<string, "processing" | "processed">();
  settleFailuresRemaining = 0;

  async getAccount(workspaceId: string): Promise<BillingAccount | null> {
    return workspaceId === this.account.subscription.workspaceId
      ? cloneAccount(this.account)
      : null;
  }

  async savePaymentMethod(input: Parameters<BillingStore["savePaymentMethod"]>[0]) {
    assert.equal(input.expectedCustomerKey, this.account.customer.tossCustomerKey);
    const created = this.account.paymentMethod?.id !== input.paymentMethod.id;
    if (created) {
      this.account = {
        ...this.account,
        paymentMethod: structuredClone(input.paymentMethod),
        subscription: {
          ...this.account.subscription,
          paymentMethodId: input.paymentMethod.id,
          status:
            this.account.subscription.status === "account_created"
              ? "billing_authorized"
              : this.account.subscription.status,
        },
      };
      this.ledger.push(structuredClone(input.ledger));
    }
    return { account: cloneAccount(this.account), created };
  }

  async reserveCharge(input: Parameters<BillingStore["reserveCharge"]>[0]) {
    const found = this.attempts.find((attempt) => attempt.orderId === input.attempt.orderId);
    if (found) {
      return { account: cloneAccount(this.account), attempt: structuredClone(found), created: false };
    }
    this.attempts.push(structuredClone(input.attempt));
    this.account = {
      ...this.account,
      latestPayment: structuredClone(input.attempt),
      subscription: { ...this.account.subscription, status: "charge_pending" },
    };
    this.ledger.push(structuredClone(input.ledger));
    return {
      account: cloneAccount(this.account),
      attempt: structuredClone(input.attempt),
      created: true,
    };
  }

  async settleCharge(input: Parameters<BillingStore["settleCharge"]>[0]) {
    if (this.settleFailuresRemaining > 0) {
      this.settleFailuresRemaining -= 1;
      throw new Error("simulated local commit failure");
    }
    const index = this.attempts.findIndex((attempt) => attempt.orderId === input.orderId);
    assert.notEqual(index, -1);
    const current = this.attempts[index]!;
    if (current.status === input.status) {
      return { account: cloneAccount(this.account), changed: false };
    }
    const settled: PaymentAttempt = {
      ...current,
      status: input.status,
      tossPaymentKey: input.tossPaymentKey,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      paidAt: input.paidAt,
    };
    this.attempts[index] = settled;
    const subscription =
      input.status === "paid"
        ? {
            ...this.account.subscription,
            status: "active" as const,
            currentPeriodStart: settled.billingPeriodStart,
            currentPeriodEnd: settled.billingPeriodEnd,
            graceEndsAt: null,
          }
        : input.status === "failed"
          ? {
              ...this.account.subscription,
              status: "past_due" as const,
              graceEndsAt: input.graceEndsAt,
            }
          : this.account.subscription;
    this.account = { ...this.account, latestPayment: settled, subscription };
    this.ledger.push(structuredClone(input.ledger));
    return { account: cloneAccount(this.account), changed: true };
  }

  async scheduleCancellation(input: Parameters<BillingStore["scheduleCancellation"]>[0]) {
    if (this.account.subscription.status !== "cancel_at_period_end") {
      this.account = {
        ...this.account,
        subscription: { ...this.account.subscription, status: "cancel_at_period_end" },
      };
      this.ledger.push(structuredClone(input.ledger));
      return { account: cloneAccount(this.account), changed: true };
    }
    return { account: cloneAccount(this.account), changed: false };
  }

  async claimProviderEvent(input: Parameters<BillingStore["claimProviderEvent"]>[0]) {
    const existing = this.claimedEvents.get(input.providerEventId);
    if (existing === "processed") return "processed" as const;
    this.claimedEvents.set(input.providerEventId, "processing");
    return existing ? ("retry" as const) : ("claimed" as const);
  }

  async completeProviderEvent(input: Parameters<BillingStore["completeProviderEvent"]>[0]) {
    this.claimedEvents.set(input.providerEventId, "processed");
  }

  async findPaymentByOrderId(orderId: string) {
    const payment = this.attempts.find((attempt) => attempt.orderId === orderId);
    return payment ? structuredClone(payment) : null;
  }

  async findPaymentByIdempotencyKey(workspaceId: string, idempotencyKey: string) {
    if (workspaceId !== this.account.subscription.workspaceId) return null;
    const payment = this.attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
    return payment ? structuredClone(payment) : null;
  }

  async disablePaymentMethod() {
    return { account: cloneAccount(this.account), changed: false };
  }
}

function createTossStub(overrides: Partial<TossBillingClient> = {}): TossBillingClient {
  return {
    async issueBillingKey() {
      return {
        customerKey: CUSTOMER_KEY,
        authenticatedAt: "2026-08-11T12:00:00+09:00",
        method: "카드",
        billingKey: "billing-key-secret",
        card: { issuerCode: "11", number: "12345678****1234" },
      };
    },
    async chargeBillingKey(input) {
      return tossPayment(input.orderId);
    },
    async queryPaymentByOrderId() {
      return null;
    },
    async queryPaymentByPaymentKey() {
      return null;
    },
    async deleteBillingKey() {},
    ...overrides,
  };
}

function serviceFixture(store = new MemoryBillingStore(), toss = createTossStub()) {
  const crypto = createSecretCrypto({
    currentKeyId: "billing-test-key",
    currentSecret: "billing-test-secret-material-at-least-32-bytes",
  });
  return {
    store,
    service: createBillingService({
      store,
      toss,
      billingKeyVault: createBillingKeyVault(crypto),
      now: () => new Date(NOW),
      newPaymentMethodId: () => METHOD_ID,
    }),
  };
}

test("checkout identity는 인증된 workspace의 서버 고정 customerKey만 반환한다", async () => {
  const { service } = serviceFixture();

  assert.deepEqual(await service.getCheckoutIdentity({ workspaceId: WORKSPACE_ID }), {
    customerKey: CUSTOMER_KEY,
    subscriptionStatus: "account_created",
  });
  await assert.rejects(
    service.getCheckoutIdentity({ workspaceId: "0198f06a-1b42-7000-8000-000000000099" }),
    (error: unknown) =>
      error instanceof BillingServiceError && error.code === "NOT_FOUND",
  );
});

test("빌링 인증 직후 49,000원 첫 결제가 성공해야만 active가 된다", async () => {
  const { service, store } = serviceFixture();

  const result = await service.completeAuthorization({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "auth-key-secret",
    customerKey: CUSTOMER_KEY,
    requestId: "request-1",
    idempotencyKey: "callback-idempotency-1",
  });

  assert.equal(result.account.subscription.status, "active");
  assert.equal(result.account.subscription.amountKrw, 49_000);
  assert.match(store.account.paymentMethod?.billingKeyEncrypted ?? "", /^enc:v1:/);
  assert.equal(store.account.paymentMethod?.billingKeyEncrypted.includes("billing-key-secret"), false);
  assert.deepEqual(
    store.ledger.map((entry) => entry.type),
    ["payment_method.authorized", "charge.requested", "charge.succeeded"],
  );
  assert.equal(store.attempts[0]?.amountKrw, 49_000);
});

test("승인 응답 후 로컬 commit이 한 번 실패하면 orderId Query API로 대사한다", async () => {
  const store = new MemoryBillingStore();
  store.settleFailuresRemaining = 1;
  let queriedOrderId = "";
  const toss = createTossStub({
    async queryPaymentByOrderId(orderId) {
      queriedOrderId = orderId;
      return tossPayment(orderId);
    },
  });
  const { service } = serviceFixture(store, toss);

  const result = await service.completeAuthorization({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "auth-key-secret",
    customerKey: CUSTOMER_KEY,
    requestId: "request-commit-failure",
    idempotencyKey: "callback-idempotency-commit-failure",
  });

  assert.equal(queriedOrderId, store.attempts[0]?.orderId);
  assert.equal(result.account.subscription.status, "active");
  assert.equal(store.ledger.filter((entry) => entry.type === "charge.succeeded").length, 1);
});

test("타임아웃 후에는 재청구하지 않고 Query API의 DONE으로 회복한다", async () => {
  let chargeCalls = 0;
  let queryCalls = 0;
  const toss = createTossStub({
    async chargeBillingKey() {
      chargeCalls += 1;
      throw new TossTransportError("timeout", "timeout", true);
    },
    async queryPaymentByOrderId(orderId) {
      queryCalls += 1;
      return tossPayment(orderId);
    },
  });
  const { service } = serviceFixture(new MemoryBillingStore(), toss);

  const result = await service.completeAuthorization({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "auth-key-secret",
    customerKey: CUSTOMER_KEY,
    requestId: "request-timeout",
    idempotencyKey: "callback-idempotency-timeout",
  });

  assert.equal(chargeCalls, 1);
  assert.equal(queryCalls, 1);
  assert.equal(result.account.subscription.status, "active");
});

test("명시적 결제 실패는 past_due와 7일 grace를 남긴다", async () => {
  const toss = createTossStub({
    async chargeBillingKey() {
      throw new TossApiError(400, "REJECT_CARD_COMPANY", "card rejected", false);
    },
  });
  const { service, store } = serviceFixture(new MemoryBillingStore(), toss);

  const result = await service.completeAuthorization({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "auth-key-secret",
    customerKey: CUSTOMER_KEY,
    requestId: "request-failed",
    idempotencyKey: "callback-idempotency-failed",
  });

  assert.equal(result.account.subscription.status, "past_due");
  assert.equal(result.account.subscription.graceEndsAt?.toISOString(), "2026-08-18T03:00:00.000Z");
  assert.equal(store.attempts[0]?.failureCode, "REJECT_CARD_COMPANY");
  assert.deepEqual(store.ledger.map((entry) => entry.type), [
    "payment_method.authorized",
    "charge.requested",
    "charge.failed",
  ]);
});

test("같은 callback replay는 같은 멱등키를 쓰고 중복 청구하지 않는다", async () => {
  const issueKeys: string[] = [];
  let chargeCalls = 0;
  const toss = createTossStub({
    async issueBillingKey(input) {
      issueKeys.push(input.idempotencyKey);
      return {
        customerKey: CUSTOMER_KEY,
        authenticatedAt: "2026-08-11T12:00:00+09:00",
        method: "카드",
        billingKey: "billing-key-secret",
        card: { issuerCode: "11", number: "12345678****1234" },
      };
    },
    async chargeBillingKey(input) {
      chargeCalls += 1;
      return tossPayment(input.orderId);
    },
  });
  const { service } = serviceFixture(new MemoryBillingStore(), toss);
  const input = {
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "auth-key-secret",
    customerKey: CUSTOMER_KEY,
    requestId: "request-replay",
    idempotencyKey: "callback-idempotency-replay",
  };

  await service.completeAuthorization(input);
  await service.completeAuthorization(input);

  assert.equal(issueKeys.length, 2);
  assert.equal(issueKeys[0], issueKeys[1]);
  assert.equal(chargeCalls, 1);
});

test("결제수단 교체는 past_due의 미납 기간을 즉시 다음 시도로 재청구한다", async () => {
  const store = new MemoryBillingStore();
  store.account = {
    ...store.account,
    subscription: {
      ...store.account.subscription,
      status: "past_due",
      graceEndsAt: new Date("2026-08-18T03:00:00.000Z"),
    },
  };
  store.attempts.push({
    id: "0198f06a-1b42-7000-8000-000000000006",
    workspaceId: WORKSPACE_ID,
    subscriptionId: SUBSCRIPTION_ID,
    orderId: "sf_previous_failed_order",
    idempotencyKey: "previous-idempotency",
    tossPaymentKey: null,
    status: "failed",
    amountKrw: 49_000,
    billingPeriodStart: new Date(NOW),
    billingPeriodEnd: new Date("2026-09-11T03:00:00.000Z"),
    attempt: 1,
    failureCode: "REJECT_CARD_COMPANY",
    failureMessage: "card rejected",
    paidAt: null,
  });
  store.account = { ...store.account, latestPayment: store.attempts[0]! };
  const chargeAttempts: number[] = [];
  const toss = createTossStub({
    async chargeBillingKey(input) {
      chargeAttempts.push(store.attempts.at(-1)?.attempt ?? -1);
      return tossPayment(input.orderId);
    },
  });
  const { service } = serviceFixture(store, toss);

  const result = await service.completeAuthorization({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "replacement-auth-key",
    customerKey: CUSTOMER_KEY,
    requestId: "request-replacement",
    idempotencyKey: "callback-idempotency-replacement",
  });

  assert.deepEqual(chargeAttempts, [2]);
  assert.equal(result.account.subscription.status, "active");
  assert.equal(store.attempts.length, 2);
});

test("웹훅 replay와 역순 이벤트는 모두 Query API 현재 상태로 수렴한다", async () => {
  const store = new MemoryBillingStore();
  const toss = createTossStub({
    async chargeBillingKey() {
      throw new TossTransportError("timeout", "timeout", true);
    },
    async queryPaymentByOrderId(orderId) {
      return tossPayment(orderId, "DONE");
    },
  });
  const { service } = serviceFixture(store, toss);
  await service.completeAuthorization({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    authKey: "auth-key-secret",
    customerKey: CUSTOMER_KEY,
    requestId: "request-webhook-seed",
    idempotencyKey: "callback-idempotency-webhook-seed",
  });
  const orderId = store.attempts[0]!.orderId;
  const event = {
    eventType: "PAYMENT_STATUS_CHANGED" as const,
    createdAt: "2026-08-11T12:01:00.000000+09:00",
    data: { orderId, paymentKey: "payment-key-secret", status: "ABORTED" },
  };

  const first = await service.handleWebhook({
    transmissionId: "transmission-1",
    event,
    receivedAt: new Date("2026-08-11T03:01:00.000Z"),
  });
  const replay = await service.handleWebhook({
    transmissionId: "transmission-1",
    event,
    receivedAt: new Date("2026-08-11T03:02:00.000Z"),
  });
  const olderDifferentDelivery = await service.handleWebhook({
    transmissionId: "transmission-older",
    event: { ...event, createdAt: "2026-08-11T11:59:00.000000+09:00" },
    receivedAt: new Date("2026-08-11T03:03:00.000Z"),
  });

  assert.equal(first.outcome, "processed");
  assert.equal(replay.outcome, "duplicate");
  assert.equal(olderDifferentDelivery.outcome, "processed");
  assert.equal(store.account.subscription.status, "active");
  assert.equal(store.ledger.filter((entry) => entry.type === "charge.succeeded").length, 1);
});

test("취소는 현재 결제기간 끝으로 예약하고 일할환불을 만들지 않는다", async () => {
  const store = new MemoryBillingStore();
  store.account = {
    ...store.account,
    subscription: {
      ...store.account.subscription,
      status: "active",
      currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    },
  };
  const { service } = serviceFixture(store);

  const result = await service.cancelAtPeriodEnd({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    requestId: "request-cancel",
  });

  assert.equal(result.account.subscription.status, "cancel_at_period_end");
  assert.equal(result.effectiveAt.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(result.policy.proratedRefund, false);
  assert.equal(result.policy.statutoryExceptionsApply, true);
  assert.equal(store.ledger.some((entry) => entry.type === "payment.refunded"), false);
});
