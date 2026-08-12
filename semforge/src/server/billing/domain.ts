// @TASK P2-B1-T1 - Toss automatic billing domain, state machine, and access policy
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
// @TEST src/server/billing/domain.contract.test.ts
import { createHash } from "node:crypto";

import type { SecretCrypto } from "@/lib/crypto";

export const BILLING_AMOUNT_KRW = 49_000;
export const BILLING_ORDER_NAME = "SEMForge 월간 구독";
export const BILLING_GRACE_DAYS = 7;

export const SUBSCRIPTION_STATUSES = [
  "invited",
  "account_created",
  "billing_authorized",
  "charge_pending",
  "active",
  "past_due",
  "cancel_at_period_end",
  "canceled",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const subscriptionTransitions = {
  invited: ["account_created"],
  account_created: ["billing_authorized", "canceled"],
  billing_authorized: ["charge_pending", "canceled"],
  charge_pending: ["active", "past_due"],
  active: ["charge_pending", "cancel_at_period_end"],
  past_due: ["charge_pending", "cancel_at_period_end", "canceled"],
  cancel_at_period_end: ["canceled"],
  canceled: [],
} as const satisfies Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>>;

export class InvalidSubscriptionTransitionError extends Error {
  constructor(
    readonly from: SubscriptionStatus,
    readonly to: SubscriptionStatus,
  ) {
    super(`허용되지 않는 구독 상태 전이: ${from} -> ${to}`);
    this.name = "InvalidSubscriptionTransitionError";
  }
}

export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (from === to) return;
  const allowed = subscriptionTransitions[from] as readonly SubscriptionStatus[];
  if (!allowed.includes(to)) throw new InvalidSubscriptionTransitionError(from, to);
}

export interface ChargeIdentityInput {
  readonly subscriptionId: string;
  readonly billingPeriodStart: Date;
  readonly attempt: number;
}

/**
 * A retry is a distinct provider operation, while a replay of that retry must
 * reuse exactly the same identifiers. The period and attempt are therefore both
 * in the digest. No tenant or customer identifier is exposed to Toss or logs.
 */
export function deriveChargeIdentity(input: ChargeIdentityInput): {
  readonly orderId: string;
  readonly idempotencyKey: string;
} {
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new Error("결제 시도 번호는 1 이상의 정수여야 합니다.");
  }
  if (Number.isNaN(input.billingPeriodStart.getTime())) {
    throw new Error("청구기간 시작일이 올바르지 않습니다.");
  }
  const digest = createHash("sha256")
    .update(
      [
        "semforge-billing-charge-v1",
        input.subscriptionId,
        input.billingPeriodStart.toISOString(),
        String(input.attempt),
      ].join("\u0000"),
    )
    .digest("base64url");
  return {
    orderId: `sf_${digest.slice(0, 40)}`,
    idempotencyKey: `semforge-billing-charge-v1_${digest}`,
  };
}

const retryDelayDays = {
  2: 1,
  3: 3,
  4: 5,
} as const;

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

export function retryAtForAttempt(periodStart: Date, attempt: number): Date | null {
  const days = retryDelayDays[attempt as keyof typeof retryDelayDays];
  return days === undefined ? null : addUtcDays(periodStart, days);
}

export function graceEndForPeriod(periodStart: Date): Date {
  return addUtcDays(periodStart, BILLING_GRACE_DAYS);
}

/** Calendar-month addition with end-of-month clamping in UTC. */
export function addBillingMonth(start: Date): Date {
  if (Number.isNaN(start.getTime())) throw new Error("결제 기간 시작일이 올바르지 않습니다.");
  const targetMonthStart = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      1,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
  const daysInTargetMonth = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(start.getUTCDate(), daysInTargetMonth));
  return targetMonthStart;
}

export function billingKeyAad(workspaceId: string, paymentMethodId: string): string {
  if (!workspaceId || !paymentMethodId) throw new Error("billing key AAD 식별자가 필요합니다.");
  return `${workspaceId}:${paymentMethodId}:billing-key`;
}

export interface BillingKeyVault {
  encrypt(billingKey: string, workspaceId: string, paymentMethodId: string): string;
  decrypt(
    billingKeyEncrypted: string,
    workspaceId: string,
    paymentMethodId: string,
  ): string | null;
}

export function createBillingKeyVault(crypto: SecretCrypto): BillingKeyVault {
  return {
    encrypt(billingKey, workspaceId, paymentMethodId) {
      if (!billingKey) throw new Error("빌링키가 필요합니다.");
      return crypto.encrypt(billingKey, billingKeyAad(workspaceId, paymentMethodId));
    },
    decrypt(billingKeyEncrypted, workspaceId, paymentMethodId) {
      return crypto.decrypt(
        billingKeyEncrypted,
        billingKeyAad(workspaceId, paymentMethodId),
      );
    },
  };
}

export type BillingCapability =
  | "report:read"
  | "workspace:read"
  | "workspace:write"
  | "collection:run"
  | "billing:manage";

export interface BillingAccessSubscription {
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly graceEndsAt: Date | null;
}

export type BillingAccessDecision = Readonly<{
  allowed: boolean;
  mode: "full" | "past_reports_only" | "billing_only";
  reason:
    | "active"
    | "cancel_pending"
    | "past_due_grace"
    | "payment_required"
    | "subscription_ended";
}>;

export function decideBillingAccess(
  subscription: BillingAccessSubscription,
  request: {
    readonly capability: BillingCapability;
    readonly reportPeriodEnd?: Date;
    readonly now: Date;
  },
): BillingAccessDecision {
  if (request.capability === "billing:manage") {
    return { allowed: true, mode: "billing_only", reason: "payment_required" };
  }
  if (subscription.status === "active") {
    return { allowed: true, mode: "full", reason: "active" };
  }
  const isPaymentDelinquent =
    subscription.status === "past_due" ||
    (subscription.status === "cancel_at_period_end" && subscription.graceEndsAt !== null);
  if (isPaymentDelinquent) {
    if (subscription.graceEndsAt !== null && request.now < subscription.graceEndsAt) {
      const isPastReport =
        request.capability === "report:read" &&
        request.reportPeriodEnd !== undefined &&
        subscription.currentPeriodStart !== null &&
        request.reportPeriodEnd < subscription.currentPeriodStart;
      return {
        allowed: isPastReport,
        mode: "past_reports_only",
        reason: "past_due_grace",
      };
    }
    return {
      allowed: false,
      mode: "billing_only",
      reason: "payment_required",
    };
  }
  if (
    subscription.status === "cancel_at_period_end" &&
    subscription.currentPeriodEnd !== null &&
    request.now < subscription.currentPeriodEnd
  ) {
    return { allowed: true, mode: "full", reason: "cancel_pending" };
  }
  const ended =
    subscription.status === "canceled" ||
    (subscription.status === "cancel_at_period_end" &&
      subscription.currentPeriodEnd !== null &&
      request.now >= subscription.currentPeriodEnd);
  return {
    allowed: false,
    mode: "billing_only",
    reason: ended ? "subscription_ended" : "payment_required",
  };
}

export const subscriptionCancellationPolicy = {
  timing: "period_end",
  proratedRefund: false,
  statutoryExceptionsApply: true,
  notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
} as const;
