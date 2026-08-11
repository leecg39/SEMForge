// @TASK P2-B1-T1 - Toss automatic billing orchestration and BillingStore port
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
// @TEST src/server/billing/service.contract.test.ts
import { createHash } from "node:crypto";

import { newUuid } from "@/lib/ids";
import {
  BILLING_AMOUNT_KRW,
  BILLING_ORDER_NAME,
  type BillingKeyVault,
  type SubscriptionStatus,
  addBillingMonth,
  assertSubscriptionTransition,
  deriveChargeIdentity,
  graceEndForPeriod,
  retryAtForAttempt,
  subscriptionCancellationPolicy,
} from "@/server/billing/domain";
import {
  TossApiError,
  TossTransportError,
  type TossBillingClient,
  type TossPayment,
} from "@/server/billing/toss-client";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded";

export interface BillingCustomerRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly tossCustomerKey: string;
}

export interface PaymentMethodRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly billingCustomerId: string;
  readonly billingKeyEncrypted: string;
  readonly billingKeyFingerprint: string;
  readonly cardBrand: string | null;
  readonly cardLast4: string | null;
  readonly active: boolean;
  readonly replacedAt: Date | null;
}

export interface SubscriptionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly billingCustomerId: string;
  readonly paymentMethodId: string | null;
  readonly status: SubscriptionStatus;
  readonly amountKrw: number;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly graceEndsAt: Date | null;
  readonly canceledAt: Date | null;
}

export interface PaymentAttempt {
  readonly id: string;
  readonly workspaceId: string;
  readonly subscriptionId: string;
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly tossPaymentKey: string | null;
  readonly status: PaymentStatus;
  readonly amountKrw: number;
  readonly billingPeriodStart: Date;
  readonly billingPeriodEnd: Date;
  readonly attempt: number;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly paidAt: Date | null;
}

export interface BillingAccount {
  readonly customer: BillingCustomerRecord;
  readonly subscription: SubscriptionRecord;
  readonly paymentMethod: PaymentMethodRecord | null;
  readonly latestPayment: PaymentAttempt | null;
}

export type BillingLedgerEventType =
  | "payment_method.authorized"
  | "charge.requested"
  | "charge.succeeded"
  | "charge.failed"
  | "charge.canceled"
  | "payment.refunded"
  | "subscription.cancel_scheduled"
  | "subscription.canceled";

/**
 * The ledger is write-once. Implementations may project current payment and
 * subscription state separately, but must only INSERT these entries and must
 * atomically append one when a state mutation below actually changes state.
 */
export interface BillingLedgerEntry {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: BillingLedgerEventType;
  readonly entityId: string;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
  readonly occurredAt: Date;
  readonly amountKrw?: number;
  readonly orderId?: string;
  readonly paymentStatus?: PaymentStatus;
  readonly providerCode?: string;
}

export interface BillingStore {
  getAccount(workspaceId: string): Promise<BillingAccount | null>;
  savePaymentMethod(input: {
    readonly workspaceId: string;
    readonly expectedCustomerKey: string;
    readonly paymentMethod: PaymentMethodRecord;
    readonly ledger: BillingLedgerEntry;
  }): Promise<{ readonly account: BillingAccount; readonly created: boolean }>;
  reserveCharge(input: {
    readonly workspaceId: string;
    readonly attempt: PaymentAttempt;
    readonly ledger: BillingLedgerEntry;
  }): Promise<{
    readonly account: BillingAccount;
    readonly attempt: PaymentAttempt;
    readonly created: boolean;
  }>;
  settleCharge(input: {
    readonly workspaceId: string;
    readonly orderId: string;
    readonly status: PaymentStatus;
    readonly tossPaymentKey: string | null;
    readonly failureCode: string | null;
    readonly failureMessage: string | null;
    readonly paidAt: Date | null;
    readonly graceEndsAt: Date | null;
    readonly ledger: BillingLedgerEntry;
  }): Promise<{ readonly account: BillingAccount; readonly changed: boolean }>;
  scheduleCancellation(input: {
    readonly workspaceId: string;
    readonly effectiveAt: Date;
    readonly ledger: BillingLedgerEntry;
  }): Promise<{ readonly account: BillingAccount; readonly changed: boolean }>;
  claimProviderEvent(input: {
    readonly provider: "toss";
    readonly providerEventId: string;
    readonly workspaceId: string;
    readonly eventType: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly receivedAt: Date;
  }): Promise<"claimed" | "retry" | "processed">;
  completeProviderEvent(input: {
    readonly provider: "toss";
    readonly providerEventId: string;
    readonly processedAt: Date;
  }): Promise<void>;
  findPaymentByOrderId(orderId: string): Promise<PaymentAttempt | null>;
  findPaymentByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | null>;
  disablePaymentMethod(input: {
    readonly workspaceId: string;
    readonly paymentMethodId: string;
  }): Promise<{ readonly account: BillingAccount; readonly changed: boolean }>;
  /** Requires the follow-up HMAC lookup column; raw/plain hashes are forbidden. */
  findAccountByBillingKey?(billingKey: string): Promise<BillingAccount | null>;
}

export type BillingServiceErrorCode =
  | "NOT_FOUND"
  | "CUSTOMER_KEY_MISMATCH"
  | "INVALID_STATE"
  | "BILLING_KEY_UNAVAILABLE"
  | "RECONCILIATION_PENDING"
  | "INVARIANT_VIOLATION"
  | "RETRY_NOT_DUE"
  | "RETRY_EXHAUSTED";

export class BillingServiceError extends Error {
  constructor(
    readonly code: BillingServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BillingServiceError";
  }
}

export interface PaymentStatusChangedWebhook {
  readonly eventType: "PAYMENT_STATUS_CHANGED";
  readonly createdAt: string;
  readonly data: {
    readonly orderId: string;
    readonly paymentKey: string;
    readonly status: string;
  };
}

export interface BillingDeletedWebhook {
  readonly eventType: "BILLING_DELETED";
  readonly createdAt: string;
  readonly billingKey: string;
  readonly reason?: string | null;
}

export type TossBillingWebhook = PaymentStatusChangedWebhook | BillingDeletedWebhook;

export type BillingChargeOutcome = "paid" | "failed" | "pending";

export interface BillingChargeResult {
  readonly outcome: BillingChargeOutcome;
  readonly account: BillingAccount;
}

export interface BillingService {
  getCheckoutIdentity(input: { readonly workspaceId: string }): Promise<{
    readonly customerKey: string;
    readonly subscriptionStatus: SubscriptionStatus;
  }>;
  getSummary(input: { readonly workspaceId: string }): Promise<{
    readonly status: SubscriptionStatus;
    readonly amountKrw: number;
    readonly currentPeriodStart: Date | null;
    readonly currentPeriodEnd: Date | null;
    readonly graceEndsAt: Date | null;
    readonly cancelAtPeriodEnd: boolean;
    readonly nextRetryAt: Date | null;
    readonly policy: typeof subscriptionCancellationPolicy;
  }>;
  completeAuthorization(input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly authKey: string;
    readonly customerKey: string;
    readonly requestId: string;
    readonly idempotencyKey: string;
  }): Promise<BillingChargeResult>;
  retryPastDue(input: {
    readonly workspaceId: string;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly idempotencyKey: string;
    readonly force?: boolean;
  }): Promise<BillingChargeResult>;
  cancelAtPeriodEnd(input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly requestId: string;
  }): Promise<{
    readonly account: BillingAccount;
    readonly effectiveAt: Date;
    readonly policy: typeof subscriptionCancellationPolicy;
  }>;
  handleWebhook(input: {
    readonly transmissionId: string;
    readonly event: TossBillingWebhook;
    readonly receivedAt: Date;
  }): Promise<{
    readonly outcome: "processed" | "duplicate" | "ignored";
    readonly reason?: string;
  }>;
}

export interface BillingServiceOptions {
  readonly store: BillingStore;
  readonly toss: TossBillingClient;
  readonly billingKeyVault: BillingKeyVault;
  readonly now?: () => Date;
  readonly billingKeyFingerprint?: (billingKey: string) => string;
  readonly newPaymentMethodId?: () => string;
  readonly newPaymentAttemptId?: () => string;
  readonly newLedgerId?: () => string;
}

function stableDigest(...parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("base64url");
}

function stableUuid(...parts: readonly string[]): string {
  const bytes = createHash("sha256").update(parts.join("\u0000")).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cardLast4(maskedNumber: string | null): string | null {
  if (!maskedNumber) return null;
  const digits = maskedNumber.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function parseProviderDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function chargeOutcomeFor(status: PaymentStatus): BillingChargeOutcome {
  if (status === "paid") return "paid";
  if (status === "pending" || status === "authorized") return "pending";
  return "failed";
}

function providerSettlement(
  attempt: PaymentAttempt,
  payment: TossPayment,
  fallbackTime: Date,
): {
  status: PaymentStatus;
  tossPaymentKey: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  graceEndsAt: Date | null;
  ledgerType: BillingLedgerEventType;
} {
  if (payment.orderId !== attempt.orderId || payment.totalAmount !== attempt.amountKrw) {
    throw new BillingServiceError(
      "INVARIANT_VIOLATION",
      "Toss 대사 응답의 주문번호 또는 금액이 로컬 원장과 다릅니다.",
    );
  }
  switch (payment.status) {
    case "DONE":
      return {
        status: "paid",
        tossPaymentKey: payment.paymentKey,
        failureCode: null,
        failureMessage: null,
        paidAt: parseProviderDate(payment.approvedAt, fallbackTime),
        graceEndsAt: null,
        ledgerType: "charge.succeeded",
      };
    case "ABORTED":
    case "EXPIRED":
      return {
        status: "failed",
        tossPaymentKey: payment.paymentKey,
        failureCode: `TOSS_${payment.status}`,
        failureMessage: "Toss 결제가 완료되지 않았습니다.",
        paidAt: null,
        graceEndsAt: graceEndForPeriod(attempt.billingPeriodStart),
        ledgerType: "charge.failed",
      };
    case "CANCELED":
      return {
        status: "canceled",
        tossPaymentKey: payment.paymentKey,
        failureCode: "TOSS_CANCELED",
        failureMessage: "Toss 결제가 취소됐습니다.",
        paidAt: null,
        graceEndsAt: graceEndForPeriod(attempt.billingPeriodStart),
        ledgerType: "charge.canceled",
      };
    case "PARTIAL_CANCELED":
      return {
        status: "refunded",
        tossPaymentKey: payment.paymentKey,
        failureCode: "TOSS_PARTIAL_CANCELED",
        failureMessage: "법정 예외 또는 수동 조정으로 결제가 부분 취소됐습니다.",
        paidAt: null,
        graceEndsAt: graceEndForPeriod(attempt.billingPeriodStart),
        ledgerType: "payment.refunded",
      };
    default:
      return {
        status: "pending",
        tossPaymentKey: payment.paymentKey,
        failureCode: null,
        failureMessage: null,
        paidAt: null,
        graceEndsAt: null,
        ledgerType: "charge.requested",
      };
  }
}

export function createBillingService(options: BillingServiceOptions): BillingService {
  const now = options.now ?? (() => new Date());
  const newPaymentAttemptId = options.newPaymentAttemptId ?? newUuid;
  const newLedgerId = options.newLedgerId ?? newUuid;

  function ledger(input: {
    workspaceId: string;
    type: BillingLedgerEventType;
    entityId: string;
    actorUserId: string | null;
    requestId: string | null;
    occurredAt: Date;
    amountKrw?: number;
    orderId?: string;
    paymentStatus?: PaymentStatus;
    providerCode?: string;
  }): BillingLedgerEntry {
    return { id: newLedgerId(), ...input };
  }

  async function requiredAccount(workspaceId: string): Promise<BillingAccount> {
    const account = await options.store.getAccount(workspaceId);
    if (!account) throw new BillingServiceError("NOT_FOUND", "구독 정보를 찾을 수 없습니다.");
    return account;
  }

  async function settleFromProvider(input: {
    account: BillingAccount;
    attempt: PaymentAttempt;
    payment: TossPayment;
    actorUserId: string | null;
    requestId: string | null;
    occurredAt: Date;
  }): Promise<BillingChargeResult> {
    const settlement = providerSettlement(input.attempt, input.payment, input.occurredAt);
    if (settlement.status === "paid") {
      assertSubscriptionTransition(input.account.subscription.status, "active");
    } else if (
      settlement.status === "failed" ||
      settlement.status === "canceled" ||
      settlement.status === "refunded"
    ) {
      assertSubscriptionTransition(input.account.subscription.status, "past_due");
    }
    const result = await options.store.settleCharge({
      workspaceId: input.attempt.workspaceId,
      orderId: input.attempt.orderId,
      status: settlement.status,
      tossPaymentKey: settlement.tossPaymentKey,
      failureCode: settlement.failureCode,
      failureMessage: settlement.failureMessage,
      paidAt: settlement.paidAt,
      graceEndsAt: settlement.graceEndsAt,
      ledger: ledger({
        workspaceId: input.attempt.workspaceId,
        type: settlement.ledgerType,
        entityId: input.attempt.id,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
        amountKrw: input.attempt.amountKrw,
        orderId: input.attempt.orderId,
        paymentStatus: settlement.status,
        ...(settlement.failureCode ? { providerCode: settlement.failureCode } : {}),
      }),
    });
    return { outcome: chargeOutcomeFor(settlement.status), account: result.account };
  }

  async function settleExplicitFailure(input: {
    account: BillingAccount;
    attempt: PaymentAttempt;
    error: TossApiError;
    actorUserId: string | null;
    requestId: string | null;
    occurredAt: Date;
  }): Promise<BillingChargeResult> {
    assertSubscriptionTransition(input.account.subscription.status, "past_due");
    const result = await options.store.settleCharge({
      workspaceId: input.attempt.workspaceId,
      orderId: input.attempt.orderId,
      status: "failed",
      tossPaymentKey: null,
      failureCode: input.error.code,
      // Provider messages are deliberately not persisted: they can reflect request data.
      failureMessage: "Toss 결제가 거절됐습니다.",
      paidAt: null,
      graceEndsAt: graceEndForPeriod(input.attempt.billingPeriodStart),
      ledger: ledger({
        workspaceId: input.attempt.workspaceId,
        type: "charge.failed",
        entityId: input.attempt.id,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
        amountKrw: input.attempt.amountKrw,
        orderId: input.attempt.orderId,
        paymentStatus: "failed",
        providerCode: input.error.code,
      }),
    });
    return { outcome: "failed", account: result.account };
  }

  async function queryAndReconcile(input: {
    account: BillingAccount;
    attempt: PaymentAttempt;
    actorUserId: string | null;
    requestId: string | null;
    occurredAt: Date;
  }): Promise<BillingChargeResult> {
    let queried: TossPayment | null;
    try {
      queried = await options.toss.queryPaymentByOrderId(input.attempt.orderId);
    } catch {
      return { outcome: "pending", account: input.account };
    }
    if (!queried) return { outcome: "pending", account: input.account };
    return settleFromProvider({ ...input, payment: queried });
  }

  async function charge(input: {
    account: BillingAccount;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    attemptNumber: number;
    externalIdempotencyKey?: string;
    actorUserId: string | null;
    requestId: string | null;
    occurredAt: Date;
  }): Promise<BillingChargeResult> {
    const method = input.account.paymentMethod;
    if (!method || !method.active) {
      throw new BillingServiceError("BILLING_KEY_UNAVAILABLE", "사용 가능한 결제수단이 없습니다.");
    }
    const identity = deriveChargeIdentity({
      subscriptionId: input.account.subscription.id,
      billingPeriodStart: input.billingPeriodStart,
      attempt: input.attemptNumber,
    });
    const idempotencyKey = input.externalIdempotencyKey ?? identity.idempotencyKey;
    const attempt: PaymentAttempt = {
      id: newPaymentAttemptId(),
      workspaceId: input.account.subscription.workspaceId,
      subscriptionId: input.account.subscription.id,
      orderId: identity.orderId,
      idempotencyKey,
      tossPaymentKey: null,
      status: "pending",
      amountKrw: BILLING_AMOUNT_KRW,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      attempt: input.attemptNumber,
      failureCode: null,
      failureMessage: null,
      paidAt: null,
    };
    assertSubscriptionTransition(input.account.subscription.status, "charge_pending");
    const reservation = await options.store.reserveCharge({
      workspaceId: attempt.workspaceId,
      attempt,
      ledger: ledger({
        workspaceId: attempt.workspaceId,
        type: "charge.requested",
        entityId: attempt.id,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
        amountKrw: attempt.amountKrw,
        orderId: attempt.orderId,
        paymentStatus: "pending",
      }),
    });
    if (!reservation.created) {
      if (reservation.attempt.status === "paid") {
        return { outcome: "paid", account: reservation.account };
      }
      if (
        reservation.attempt.status === "failed" ||
        reservation.attempt.status === "canceled" ||
        reservation.attempt.status === "refunded"
      ) {
        return { outcome: "failed", account: reservation.account };
      }
      return queryAndReconcile({
        account: reservation.account,
        attempt: reservation.attempt,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
      });
    }

    const billingKey = options.billingKeyVault.decrypt(
      method.billingKeyEncrypted,
      method.workspaceId,
      method.id,
    );
    if (!billingKey) {
      return settleExplicitFailure({
        account: reservation.account,
        attempt: reservation.attempt,
        error: new TossApiError(
          500,
          "BILLING_KEY_DECRYPTION_FAILED",
          "빌링키를 복호화할 수 없습니다.",
          false,
          false,
        ),
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
      });
    }

    let providerPayment: TossPayment;
    try {
      providerPayment = await options.toss.chargeBillingKey({
        billingKey,
        customerKey: reservation.account.customer.tossCustomerKey,
        amount: BILLING_AMOUNT_KRW,
        orderId: reservation.attempt.orderId,
        orderName: BILLING_ORDER_NAME,
        idempotencyKey: reservation.attempt.idempotencyKey,
      });
    } catch (error) {
      if (
        (error instanceof TossTransportError && error.ambiguous) ||
        (error instanceof TossApiError && error.ambiguous)
      ) {
        return queryAndReconcile({
          account: reservation.account,
          attempt: reservation.attempt,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
        });
      }
      if (error instanceof TossApiError) {
        return settleExplicitFailure({
          account: reservation.account,
          attempt: reservation.attempt,
          error,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          occurredAt: input.occurredAt,
        });
      }
      throw error;
    }

    try {
      return await settleFromProvider({
        account: reservation.account,
        attempt: reservation.attempt,
        payment: providerPayment,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
      });
    } catch (commitError) {
      // The provider may have charged successfully. Never call charge again here.
      let queried: TossPayment | null;
      try {
        queried = await options.toss.queryPaymentByOrderId(reservation.attempt.orderId);
      } catch (queryError) {
        throw new BillingServiceError(
          "RECONCILIATION_PENDING",
          "결제 성공 여부를 Query API로 대사해야 합니다.",
          { cause: queryError },
        );
      }
      if (!queried) {
        throw new BillingServiceError(
          "RECONCILIATION_PENDING",
          "결제 성공 여부를 Query API로 대사해야 합니다.",
          { cause: commitError },
        );
      }
      return settleFromProvider({
        account: reservation.account,
        attempt: reservation.attempt,
        payment: queried,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt: input.occurredAt,
      });
    }
  }

  async function retryPastDue(input: {
    workspaceId: string;
    actorUserId: string | null;
    requestId: string | null;
    idempotencyKey: string;
    force?: boolean;
  }): Promise<BillingChargeResult> {
    if (!input.idempotencyKey || input.idempotencyKey !== input.idempotencyKey.trim()) {
      throw new BillingServiceError("INVALID_STATE", "Idempotency-Key가 필요합니다.");
    }
    const occurredAt = now();
    const replay = await options.store.findPaymentByIdempotencyKey(
      input.workspaceId,
      input.idempotencyKey,
    );
    if (replay) {
      const replayAccount = await requiredAccount(input.workspaceId);
      if (replay.status === "paid") return { outcome: "paid", account: replayAccount };
      if (
        replay.status === "failed" ||
        replay.status === "canceled" ||
        replay.status === "refunded"
      ) {
        return { outcome: "failed", account: replayAccount };
      }
      return queryAndReconcile({
        account: replayAccount,
        attempt: replay,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt,
      });
    }
    const account = await requiredAccount(input.workspaceId);
    const latest = account.latestPayment;
    if (account.subscription.status !== "past_due" || !latest) {
      throw new BillingServiceError("INVALID_STATE", "재결제할 미납 구독이 아닙니다.");
    }
    if (
      account.subscription.graceEndsAt !== null &&
      occurredAt >= account.subscription.graceEndsAt
    ) {
      throw new BillingServiceError("RETRY_EXHAUSTED", "7일 grace가 종료됐습니다.");
    }
    const nextAttempt = latest.attempt + 1;
    const scheduledAt = retryAtForAttempt(latest.billingPeriodStart, nextAttempt);
    if (!scheduledAt) {
      throw new BillingServiceError("RETRY_EXHAUSTED", "자동 재시도를 모두 사용했습니다.");
    }
    if (!input.force && occurredAt < scheduledAt) {
      throw new BillingServiceError("RETRY_NOT_DUE", "아직 재결제 시각이 아닙니다.");
    }
    return charge({
      account,
      billingPeriodStart: latest.billingPeriodStart,
      billingPeriodEnd: latest.billingPeriodEnd,
      attemptNumber: nextAttempt,
      externalIdempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      occurredAt,
    });
  }

  return {
    async getCheckoutIdentity(input) {
      const account = await requiredAccount(input.workspaceId);
      return {
        customerKey: account.customer.tossCustomerKey,
        subscriptionStatus: account.subscription.status,
      };
    },

    async getSummary(input) {
      const account = await requiredAccount(input.workspaceId);
      const latest = account.latestPayment;
      const nextRetryAt =
        account.subscription.status === "past_due" && latest
          ? retryAtForAttempt(latest.billingPeriodStart, latest.attempt + 1)
          : null;
      return {
        status: account.subscription.status,
        amountKrw: BILLING_AMOUNT_KRW,
        currentPeriodStart: account.subscription.currentPeriodStart,
        currentPeriodEnd: account.subscription.currentPeriodEnd,
        graceEndsAt: account.subscription.graceEndsAt,
        cancelAtPeriodEnd: account.subscription.status === "cancel_at_period_end",
        nextRetryAt,
        policy: subscriptionCancellationPolicy,
      };
    },

    async completeAuthorization(input) {
      if (!input.idempotencyKey) {
        throw new BillingServiceError("INVALID_STATE", "Idempotency-Key가 필요합니다.");
      }
      const occurredAt = now();
      const existing = await requiredAccount(input.workspaceId);
      if (existing.customer.tossCustomerKey !== input.customerKey) {
        throw new BillingServiceError(
          "CUSTOMER_KEY_MISMATCH",
          "빌링 고객 정보가 현재 workspace와 일치하지 않습니다.",
        );
      }
      if (existing.subscription.status === "canceled") {
        throw new BillingServiceError("INVALID_STATE", "취소된 구독은 새로 신청해야 합니다.");
      }
      const issueIdempotencyKey = `semforge-billing-issue-v1_${stableDigest(
        input.workspaceId,
        input.customerKey,
        input.authKey,
      )}`;
      const authorization = await options.toss.issueBillingKey({
        authKey: input.authKey,
        customerKey: input.customerKey,
        idempotencyKey: issueIdempotencyKey,
      });
      if (authorization.customerKey !== existing.customer.tossCustomerKey) {
        throw new BillingServiceError(
          "CUSTOMER_KEY_MISMATCH",
          "Toss 빌링키의 고객 정보가 workspace와 일치하지 않습니다.",
        );
      }
      const paymentMethodId =
        options.newPaymentMethodId?.() ??
        stableUuid("semforge-billing-method-v1", input.workspaceId, input.authKey);
      const paymentMethod: PaymentMethodRecord = {
        id: paymentMethodId,
        workspaceId: input.workspaceId,
        billingCustomerId: existing.customer.id,
        billingKeyEncrypted: options.billingKeyVault.encrypt(
          authorization.billingKey,
          input.workspaceId,
          paymentMethodId,
        ),
        billingKeyFingerprint:
          options.billingKeyFingerprint?.(authorization.billingKey) ??
          stableDigest("semforge-billing-key-fingerprint-test-v1", authorization.billingKey),
        cardBrand: authorization.card?.issuerCode ?? null,
        cardLast4: cardLast4(authorization.card?.number ?? null),
        active: true,
        replacedAt: null,
      };
      if (existing.subscription.status === "account_created") {
        assertSubscriptionTransition("account_created", "billing_authorized");
      }
      const saved = await options.store.savePaymentMethod({
        workspaceId: input.workspaceId,
        expectedCustomerKey: input.customerKey,
        paymentMethod,
        ledger: ledger({
          workspaceId: input.workspaceId,
          type: "payment_method.authorized",
          entityId: paymentMethodId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          occurredAt,
        }),
      });

      if (
        saved.account.subscription.status === "active" ||
        saved.account.subscription.status === "cancel_at_period_end"
      ) {
        return { outcome: "paid", account: saved.account };
      }
      if (saved.account.subscription.status === "past_due") {
        if (!saved.created) return { outcome: "failed", account: saved.account };
        return retryPastDue({
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          idempotencyKey: input.idempotencyKey,
          force: true,
        });
      }
      if (
        saved.account.subscription.status === "charge_pending" &&
        saved.account.latestPayment
      ) {
        return queryAndReconcile({
          account: saved.account,
          attempt: saved.account.latestPayment,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          occurredAt,
        });
      }
      if (saved.account.subscription.status !== "billing_authorized") {
        throw new BillingServiceError(
          "INVALID_STATE",
          `첫 결제를 시작할 수 없는 상태: ${saved.account.subscription.status}`,
        );
      }
      return charge({
        account: saved.account,
        billingPeriodStart: occurredAt,
        billingPeriodEnd: addBillingMonth(occurredAt),
        attemptNumber: 1,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        occurredAt,
      });
    },

    retryPastDue,

    async cancelAtPeriodEnd(input) {
      const occurredAt = now();
      const account = await requiredAccount(input.workspaceId);
      if (account.subscription.status === "cancel_at_period_end") {
        if (!account.subscription.currentPeriodEnd) {
          throw new BillingServiceError("INVARIANT_VIOLATION", "취소 효력일이 없습니다.");
        }
        return {
          account,
          effectiveAt: account.subscription.currentPeriodEnd,
          policy: subscriptionCancellationPolicy,
        };
      }
      if (account.subscription.status !== "active" || !account.subscription.currentPeriodEnd) {
        throw new BillingServiceError("INVALID_STATE", "활성 구독만 기간 말 취소할 수 있습니다.");
      }
      assertSubscriptionTransition("active", "cancel_at_period_end");
      const result = await options.store.scheduleCancellation({
        workspaceId: input.workspaceId,
        effectiveAt: account.subscription.currentPeriodEnd,
        ledger: ledger({
          workspaceId: input.workspaceId,
          type: "subscription.cancel_scheduled",
          entityId: account.subscription.id,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          occurredAt,
        }),
      });
      return {
        account: result.account,
        effectiveAt: account.subscription.currentPeriodEnd,
        policy: subscriptionCancellationPolicy,
      };
    },

    async handleWebhook(input) {
      if (input.event.eventType === "BILLING_DELETED") {
        if (!options.store.findAccountByBillingKey) {
          return { outcome: "ignored", reason: "billing_key_lookup_not_integrated" };
        }
        const account = await options.store.findAccountByBillingKey(input.event.billingKey);
        if (!account) return { outcome: "ignored", reason: "unknown_billing_key" };
        const claim = await options.store.claimProviderEvent({
          provider: "toss",
          providerEventId: input.transmissionId,
          workspaceId: account.subscription.workspaceId,
          eventType: input.event.eventType,
          // Never persist the raw billing key or reason.
          payload: { createdAt: input.event.createdAt },
          receivedAt: input.receivedAt,
        });
        if (claim === "processed") return { outcome: "duplicate" };
        if (account.paymentMethod?.active) {
          await options.store.disablePaymentMethod({
            workspaceId: account.subscription.workspaceId,
            paymentMethodId: account.paymentMethod.id,
          });
        }
        await options.store.completeProviderEvent({
          provider: "toss",
          providerEventId: input.transmissionId,
          processedAt: now(),
        });
        return { outcome: "processed" };
      }

      const attempt = await options.store.findPaymentByOrderId(input.event.data.orderId);
      if (!attempt) return { outcome: "ignored", reason: "unknown_order" };
      const queriedByPaymentKey = await options.toss.queryPaymentByPaymentKey(
        input.event.data.paymentKey,
      );
      if (
        queriedByPaymentKey &&
        (queriedByPaymentKey.orderId !== attempt.orderId ||
          queriedByPaymentKey.paymentKey !== input.event.data.paymentKey)
      ) {
        return { outcome: "ignored", reason: "payment_fingerprint_mismatch" };
      }
      const queriedByOrderId = queriedByPaymentKey
        ? null
        : await options.toss.queryPaymentByOrderId(attempt.orderId);
      if (
        queriedByOrderId &&
        (queriedByOrderId.orderId !== attempt.orderId ||
          queriedByOrderId.paymentKey !== input.event.data.paymentKey)
      ) {
        return { outcome: "ignored", reason: "payment_fingerprint_mismatch" };
      }
      const providerPayment = queriedByPaymentKey ?? queriedByOrderId;
      if (!providerPayment) {
        return { outcome: "ignored", reason: "provider_payment_unverified" };
      }
      const claim = await options.store.claimProviderEvent({
        provider: "toss",
        providerEventId: input.transmissionId,
        workspaceId: attempt.workspaceId,
        eventType: input.event.eventType,
        // Payment key and raw body are excluded from stored dedupe metadata.
        payload: {
          orderId: input.event.data.orderId,
          status: input.event.data.status,
          createdAt: input.event.createdAt,
        },
        receivedAt: input.receivedAt,
      });
      if (claim === "processed") return { outcome: "duplicate" };
      const account = await requiredAccount(attempt.workspaceId);
      await settleFromProvider({
        account,
        attempt,
        payment: providerPayment,
        actorUserId: null,
        requestId: input.transmissionId,
        occurredAt: input.receivedAt,
      });
      await options.store.completeProviderEvent({
        provider: "toss",
        providerEventId: input.transmissionId,
        processedAt: now(),
      });
      return { outcome: "processed" };
    },
  };
}
