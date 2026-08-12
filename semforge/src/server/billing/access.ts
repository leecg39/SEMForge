// @TASK P4-BILLING-ACCESS - Production server-side paid-beta access enforcement
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
// @TEST src/server/billing/access.test.ts
import { getPool as getDatabasePool } from "@/db/client";
import {
  decideBillingAccess,
  SUBSCRIPTION_STATUSES,
  type BillingAccessDecision,
  type BillingAccessSubscription,
  type BillingCapability,
  type SubscriptionStatus,
} from "@/server/billing/domain";

export interface BillingAccessSqlSource {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

type BillingAccessRow = {
  status: string;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  grace_ends_at: Date | string | null;
};

export type BillingAccessScope = BillingAccessDecision & Readonly<{
  /** Exclusive SQL boundary for past-due report pagination. */
  reportPeriodEndBefore: Date | null;
}>;

export type BillingAccessAuthorizer = (request: {
  readonly workspaceId: string;
  readonly capability: BillingCapability;
  readonly reportPeriodEnd?: Date;
}) => Promise<BillingAccessScope>;

const missingSubscription: BillingAccessSubscription = {
  status: "invited",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
};

function optionalDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("청구 구독 날짜가 올바르지 않습니다.");
  return date;
}

function subscription(row: BillingAccessRow | undefined): BillingAccessSubscription {
  if (!row) return missingSubscription;
  if (!SUBSCRIPTION_STATUSES.includes(row.status as SubscriptionStatus)) {
    throw new Error("청구 구독 상태가 올바르지 않습니다.");
  }
  return {
    status: row.status as SubscriptionStatus,
    currentPeriodStart: optionalDate(row.current_period_start),
    currentPeriodEnd: optionalDate(row.current_period_end),
    graceEndsAt: optionalDate(row.grace_ends_at),
  };
}

export function createBillingAccessAuthorizer(options: {
  readonly database: BillingAccessSqlSource;
  readonly clock?: () => Date;
}): BillingAccessAuthorizer {
  const clock = options.clock ?? (() => new Date());
  return async (request) => {
    const row = (
      await options.database.query<BillingAccessRow>(
        `select status, current_period_start, current_period_end, grace_ends_at
           from subscriptions
          where workspace_id = $1
          limit 1`,
        [request.workspaceId],
      )
    ).rows[0];
    const actualSubscription = subscription(row);
    const decision = decideBillingAccess(actualSubscription, {
      capability: request.capability,
      ...(request.reportPeriodEnd === undefined
        ? {}
        : { reportPeriodEnd: request.reportPeriodEnd }),
      now: clock(),
    });
    return {
      ...decision,
      reportPeriodEndBefore:
        decision.mode === "past_reports_only"
          ? actualSubscription.currentPeriodStart
          : null,
    };
  };
}

export function createRuntimeBillingAccessAuthorizer(options: {
  readonly getPool?: (role: "billing") => BillingAccessSqlSource;
  readonly clock?: () => Date;
} = {}): BillingAccessAuthorizer {
  const getPool = options.getPool ?? ((role: "billing") => getDatabasePool(role));
  return (request) => createBillingAccessAuthorizer({
    // Route modules are evaluated during Next builds. Resolve BILLING_DATABASE_URL
    // only when an authenticated request actually needs an access decision.
    database: getPool("billing"),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  })(request);
}
