// Billing state can change after a scheduler enqueues work, so collection and
// snapshot handlers re-check access immediately before touching providers/data.
import {
  decideBillingAccess,
  SUBSCRIPTION_STATUSES,
  type BillingAccessSubscription,
  type SubscriptionStatus,
} from "@/server/billing/domain";
import {
  defineJobHandler,
  jobSucceeded,
  type JobHandler,
} from "@/server/jobs/contracts";
import {
  withWorkerTransaction,
  type WorkerSqlQueryable,
} from "@/server/jobs/connection";

type SubscriptionRow = {
  status: string;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  grace_ends_at: Date | string | null;
};

function date(value: Date | string | null): Date | null | undefined {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function subscription(row: SubscriptionRow | undefined): BillingAccessSubscription | null {
  if (!row) {
    return {
      status: "account_created",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
    };
  }
  if (!SUBSCRIPTION_STATUSES.includes(row.status as SubscriptionStatus)) return null;
  const currentPeriodStart = date(row.current_period_start);
  const currentPeriodEnd = date(row.current_period_end);
  const graceEndsAt = date(row.grace_ends_at);
  if (currentPeriodStart === undefined || currentPeriodEnd === undefined || graceEndsAt === undefined) {
    return null;
  }
  return {
    status: row.status as SubscriptionStatus,
    currentPeriodStart,
    currentPeriodEnd,
    graceEndsAt,
  };
}

export function createBillingAccessGuardedJobHandler<
  TPayload extends Record<string, unknown>,
>(input: {
  readonly database: WorkerSqlQueryable;
  readonly delegate: JobHandler<TPayload>;
}): JobHandler<TPayload> {
  return defineJobHandler<TPayload>(async (job, context) => {
    const access = await withWorkerTransaction(input.database, async (transaction) => {
      const result = await transaction.query<SubscriptionRow>(
        `select status::text, current_period_start, current_period_end, grace_ends_at
           from subscriptions
          where workspace_id = $1
          limit 1`,
        [job.workspaceId],
      );
      const candidate = subscription(result.rows[0]);
      if (candidate === null) return null;
      return decideBillingAccess(candidate, {
        capability: "collection:run",
        now: context.now(),
      });
    }, job.workspaceId);

    if (access?.allowed) return input.delegate(job, context);
    const reason = access?.reason ?? "invalid_subscription";
    await context.audit("job.billing_access.skipped", {
      jobType: job.type,
      reason,
    });
    return jobSucceeded({ skipped: true, skipReason: reason });
  });
}
