// @TASK P2-B1-T1 - PostgreSQL billing store for Toss automatic billing
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import { createHmac } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { getPool, withWorkspacePoolTransaction } from "@/db/client";
import { newUuid } from "@/lib/ids";
import type {
  BillingAccount,
  BillingCustomerRecord,
  BillingLedgerEntry,
  BillingStore,
  PaymentAttempt,
  PaymentMethodRecord,
  PaymentStatus,
  SubscriptionRecord,
} from "@/server/billing/service";

type Row = Record<string, unknown>;

export function billingKeyFingerprint(billingKey: string, secret: string): string {
  if (!billingKey || billingKey !== billingKey.trim()) {
    throw new Error("billing key가 필요합니다.");
  }
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BILLING_FINGERPRINT_SECRET은 32 byte 이상이어야 합니다.");
  }
  return createHmac("sha256", secret).update(billingKey, "utf8").digest("hex");
}

export function billingDatabaseRole(scope: "global" | "tenant"): "billing" | "billingTenant" {
  return scope === "tenant" ? "billingTenant" : "billing";
}

function date(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("DB row string invariant failed");
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value);
}

function number(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("DB row number invariant failed");
  return parsed;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("DB row boolean invariant failed");
  return value;
}

function customer(row: Row): BillingCustomerRecord {
  return {
    id: string(row.customer_id),
    workspaceId: string(row.workspace_id),
    tossCustomerKey: string(row.toss_customer_key),
  };
}

function subscription(row: Row): SubscriptionRecord {
  return {
    id: string(row.subscription_id),
    workspaceId: string(row.workspace_id),
    billingCustomerId: string(row.subscription_billing_customer_id),
    paymentMethodId: nullableString(row.subscription_payment_method_id),
    status: string(row.subscription_status) as SubscriptionRecord["status"],
    amountKrw: number(row.subscription_amount_krw),
    currentPeriodStart: date(row.current_period_start),
    currentPeriodEnd: date(row.current_period_end),
    graceEndsAt: date(row.grace_ends_at),
    canceledAt: date(row.canceled_at),
  };
}

function paymentMethod(row: Row): PaymentMethodRecord | null {
  if (!row.payment_method_id) return null;
  return {
    id: string(row.payment_method_id),
    workspaceId: string(row.workspace_id),
    billingCustomerId: string(row.payment_method_billing_customer_id),
    billingKeyEncrypted: string(row.billing_key_encrypted),
    billingKeyFingerprint: string(row.billing_key_fingerprint),
    cardBrand: nullableString(row.card_brand),
    cardLast4: nullableString(row.card_last4),
    active: booleanValue(row.payment_method_active),
    replacedAt: date(row.replaced_at),
  };
}

function payment(row: Row): PaymentAttempt | null {
  if (!row.payment_id) return null;
  return {
    id: string(row.payment_id),
    workspaceId: string(row.workspace_id),
    subscriptionId: string(row.payment_subscription_id),
    orderId: string(row.order_id),
    idempotencyKey: string(row.idempotency_key),
    tossPaymentKey: nullableString(row.toss_payment_key),
    status: string(row.payment_status) as PaymentStatus,
    amountKrw: number(row.payment_amount_krw),
    billingPeriodStart: date(row.billing_period_start)!,
    billingPeriodEnd: date(row.billing_period_end)!,
    attempt: number(row.attempt),
    failureCode: nullableString(row.failure_code),
    failureMessage: nullableString(row.failure_message),
    paidAt: date(row.paid_at),
  };
}

function account(row: Row): BillingAccount {
  return {
    customer: customer(row),
    subscription: subscription(row),
    paymentMethod: paymentMethod(row),
    latestPayment: payment(row),
  };
}

async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function appendLedger(client: PoolClient, entry: BillingLedgerEntry): Promise<void> {
  await client.query(
    `insert into billing_ledger_events
      (id, workspace_id, type, entity_id, actor_user_id, request_id, occurred_at,
       amount_krw, order_id, payment_status, provider_code)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      entry.id,
      entry.workspaceId,
      entry.type,
      entry.entityId,
      entry.actorUserId,
      entry.requestId,
      entry.occurredAt,
      entry.amountKrw ?? null,
      entry.orderId ?? null,
      entry.paymentStatus ?? null,
      entry.providerCode ?? null,
    ],
  );
}

async function loadAccount(client: PoolClient, workspaceId: string): Promise<BillingAccount | null> {
  const result = await client.query<Row>(
    `select
       bc.id as customer_id,
       bc.workspace_id,
       bc.toss_customer_key,
       s.id as subscription_id,
       s.billing_customer_id as subscription_billing_customer_id,
       s.payment_method_id as subscription_payment_method_id,
       s.status as subscription_status,
       s.amount_krw as subscription_amount_krw,
       s.current_period_start,
       s.current_period_end,
       s.grace_ends_at,
       s.canceled_at,
       pm.id as payment_method_id,
       pm.billing_customer_id as payment_method_billing_customer_id,
       pm.billing_key_encrypted,
       pm.billing_key_fingerprint,
       pm.card_brand,
       pm.card_last4,
       pm.active as payment_method_active,
       pm.replaced_at,
       p.id as payment_id,
       p.subscription_id as payment_subscription_id,
       p.order_id,
       p.idempotency_key,
       p.toss_payment_key,
       p.status as payment_status,
       p.amount_krw as payment_amount_krw,
       p.billing_period_start,
       p.billing_period_end,
       p.attempt,
       p.failure_code,
       p.failure_message,
       p.paid_at
     from billing_customers bc
     join subscriptions s on s.workspace_id = bc.workspace_id and s.billing_customer_id = bc.id
     left join payment_methods pm on pm.workspace_id = s.workspace_id and pm.id = s.payment_method_id
     left join lateral (
       select *
       from payments p
       where p.workspace_id = s.workspace_id and p.subscription_id = s.id
       order by p.billing_period_start desc, p.attempt desc
       limit 1
     ) p on true
     where bc.workspace_id = $1`,
    [workspaceId],
  );
  return result.rows[0] ? account(result.rows[0]) : null;
}

async function loadPayment(client: PoolClient, orderId: string): Promise<PaymentAttempt | null> {
  const result = await client.query<Row>(
    `select workspace_id, id as payment_id, subscription_id as payment_subscription_id,
       order_id, idempotency_key, toss_payment_key, status as payment_status,
       amount_krw as payment_amount_krw, billing_period_start, billing_period_end,
       attempt, failure_code, failure_message, paid_at
     from payments
     where order_id = $1`,
    [orderId],
  );
  return payment(result.rows[0] ?? {});
}

async function loadPaymentByIdempotencyKey(
  client: PoolClient,
  workspaceId: string,
  idempotencyKey: string,
): Promise<PaymentAttempt | null> {
  const result = await client.query<Row>(
    `select workspace_id, id as payment_id, subscription_id as payment_subscription_id,
       order_id, idempotency_key, toss_payment_key, status as payment_status,
       amount_krw as payment_amount_krw, billing_period_start, billing_period_end,
       attempt, failure_code, failure_message, paid_at
     from payments
     where workspace_id = $1 and idempotency_key = $2`,
    [workspaceId, idempotencyKey],
  );
  return payment(result.rows[0] ?? {});
}

export function createPostgresBillingStore(options: {
  readonly pool?: Pool;
  readonly fingerprintSecret: string;
  readonly scope: "global" | "tenant";
}): BillingStore {
  const scope = options.scope;
  const pool = options.pool ?? getPool(billingDatabaseRole(scope));
  const fingerprint = (billingKey: string) =>
    billingKeyFingerprint(billingKey, options.fingerprintSecret);
  const workspaceTransaction = <T>(
    workspaceId: string,
    operation: (client: PoolClient) => Promise<T>,
  ) => scope === "tenant"
    ? withWorkspacePoolTransaction(pool, workspaceId, operation)
    : transaction(pool, operation);
  const globalTransaction = <T>(operation: (client: PoolClient) => Promise<T>) => {
    if (scope !== "global") {
      return Promise.reject(new Error("이 작업은 global billing store에서만 허용됩니다."));
    }
    return transaction(pool, operation);
  };

  return {
    async getAccount(workspaceId) {
      return workspaceTransaction(workspaceId, (client) => loadAccount(client, workspaceId));
    },

    async savePaymentMethod(input) {
      return workspaceTransaction(input.workspaceId, async (client) => {
        const current = await loadAccount(client, input.workspaceId);
        if (!current) throw new Error("billing account not found");
        if (current.customer.tossCustomerKey !== input.expectedCustomerKey) {
          throw new Error("billing customer key mismatch");
        }

        const inserted = await client.query<{ id: string }>(
          `insert into payment_methods
            (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint,
             card_brand, card_last4, active, replaced_at)
           values ($1,$2,$3,$4,$5,$6,$7,true,null)
           on conflict (id) do nothing
           returning id`,
          [
            input.paymentMethod.id,
            input.workspaceId,
            input.paymentMethod.billingCustomerId,
            input.paymentMethod.billingKeyEncrypted,
            input.paymentMethod.billingKeyFingerprint,
            input.paymentMethod.cardBrand,
            input.paymentMethod.cardLast4,
          ],
        );
        const created = inserted.rowCount === 1;
        if (created) {
          await client.query(
            `update payment_methods
             set active = false, replaced_at = coalesce(replaced_at, now()), updated_at = now()
             where workspace_id = $1 and billing_customer_id = $2 and id <> $3 and active`,
            [input.workspaceId, input.paymentMethod.billingCustomerId, input.paymentMethod.id],
          );
          await client.query(
            `update subscriptions
             set payment_method_id = $3,
                 status = case when status = 'account_created' then 'billing_authorized' else status end,
                 updated_at = now()
             where workspace_id = $1 and billing_customer_id = $2`,
            [input.workspaceId, input.paymentMethod.billingCustomerId, input.paymentMethod.id],
          );
          await appendLedger(client, input.ledger);
        }
        const updated = await loadAccount(client, input.workspaceId);
        if (!updated) throw new Error("billing account disappeared");
        return { account: updated, created };
      });
    },

    async reserveCharge(input) {
      return workspaceTransaction(input.workspaceId, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `insert into payments
            (id, workspace_id, subscription_id, order_id, idempotency_key, toss_payment_key,
             status, amount_krw, billing_period_start, billing_period_end, attempt,
             failure_code, failure_message, paid_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           on conflict (workspace_id, idempotency_key) do nothing
           returning id`,
          [
            input.attempt.id,
            input.workspaceId,
            input.attempt.subscriptionId,
            input.attempt.orderId,
            input.attempt.idempotencyKey,
            input.attempt.tossPaymentKey,
            input.attempt.status,
            input.attempt.amountKrw,
            input.attempt.billingPeriodStart,
            input.attempt.billingPeriodEnd,
            input.attempt.attempt,
            input.attempt.failureCode,
            input.attempt.failureMessage,
            input.attempt.paidAt,
          ],
        );
        const created = inserted.rowCount === 1;
        const attempt = created
          ? input.attempt
          : await loadPaymentByIdempotencyKey(
              client,
              input.workspaceId,
              input.attempt.idempotencyKey,
            );
        if (!attempt) throw new Error("payment reservation invariant failed");
        if (created) {
          await client.query(
            `update subscriptions set status = 'charge_pending', updated_at = now()
             where workspace_id = $1 and id = $2`,
            [input.workspaceId, input.attempt.subscriptionId],
          );
          await appendLedger(client, input.ledger);
        }
        const updated = await loadAccount(client, input.workspaceId);
        if (!updated) throw new Error("billing account not found");
        return { account: updated, attempt, created };
      });
    },

    async settleCharge(input) {
      return workspaceTransaction(input.workspaceId, async (client) => {
        const existing = await loadPayment(client, input.orderId);
        if (!existing) throw new Error("payment attempt not found");
        if (existing.status === input.status) {
          const unchanged = await loadAccount(client, input.workspaceId);
          if (!unchanged) throw new Error("billing account not found");
          return { account: unchanged, changed: false };
        }
        await client.query(
          `update payments
           set status = $3, toss_payment_key = $4, failure_code = $5,
               failure_message = $6, paid_at = $7, updated_at = now()
           where workspace_id = $1 and order_id = $2`,
          [
            input.workspaceId,
            input.orderId,
            input.status,
            input.tossPaymentKey,
            input.failureCode,
            input.failureMessage,
            input.paidAt,
          ],
        );
        if (input.status === "paid") {
          await client.query(
            `update subscriptions
             set status = 'active',
                 current_period_start = $3,
                 current_period_end = $4,
                 grace_ends_at = null,
                 updated_at = now()
             where workspace_id = $1 and id = $2`,
            [
              input.workspaceId,
              existing.subscriptionId,
              existing.billingPeriodStart,
              existing.billingPeriodEnd,
            ],
          );
        } else if (
          input.status === "failed" ||
          input.status === "canceled" ||
          input.status === "refunded"
        ) {
          await client.query(
            `update subscriptions
             set status = 'past_due', grace_ends_at = $3, updated_at = now()
             where workspace_id = $1 and id = $2`,
            [input.workspaceId, existing.subscriptionId, input.graceEndsAt],
          );
        }
        await appendLedger(client, input.ledger);
        const updated = await loadAccount(client, input.workspaceId);
        if (!updated) throw new Error("billing account not found");
        return { account: updated, changed: true };
      });
    },

    async scheduleCancellation(input) {
      return workspaceTransaction(input.workspaceId, async (client) => {
        const current = await loadAccount(client, input.workspaceId);
        if (!current) throw new Error("billing account not found");
        if (current.subscription.status === "cancel_at_period_end") {
          return { account: current, changed: false };
        }
        await client.query(
          `update subscriptions
           set status = 'cancel_at_period_end', canceled_at = now(), updated_at = now()
           where workspace_id = $1`,
          [input.workspaceId],
        );
        await appendLedger(client, input.ledger);
        const updated = await loadAccount(client, input.workspaceId);
        if (!updated) throw new Error("billing account not found");
        return { account: updated, changed: true };
      });
    },

    async claimProviderEvent(input) {
      return globalTransaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `insert into provider_events
            (id, workspace_id, provider, provider_event_id, event_type, payload, received_at)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (provider, provider_event_id) do nothing
           returning id`,
          [
            newUuid(),
            input.workspaceId,
            input.provider,
            input.providerEventId,
            input.eventType,
            input.payload,
            input.receivedAt,
          ],
        );
        if (inserted.rowCount === 1) return "claimed" as const;
        const existing = await client.query<{ processed_at: Date | null }>(
          `select processed_at from provider_events
           where provider = $1 and provider_event_id = $2`,
          [input.provider, input.providerEventId],
        );
        return existing.rows[0]?.processed_at ? ("processed" as const) : ("retry" as const);
      });
    },

    async completeProviderEvent(input) {
      await globalTransaction(async (client) => {
        await client.query(
          `update provider_events
           set processed_at = $3, processing_error = null
           where provider = $1 and provider_event_id = $2`,
          [input.provider, input.providerEventId, input.processedAt],
        );
      });
    },

    async findPaymentByOrderId(orderId) {
      return globalTransaction((client) => loadPayment(client, orderId));
    },

    async findPaymentByIdempotencyKey(workspaceId, idempotencyKey) {
      return workspaceTransaction(workspaceId, (client) =>
        loadPaymentByIdempotencyKey(client, workspaceId, idempotencyKey),
      );
    },

    async disablePaymentMethod(input) {
      return globalTransaction(async (client) => {
        const current = await loadAccount(client, input.workspaceId);
        if (!current) throw new Error("billing account not found");
        const disabled = await client.query(
          `update payment_methods
           set active = false, replaced_at = coalesce(replaced_at, now()), updated_at = now()
           where workspace_id = $1 and id = $2 and active`,
          [input.workspaceId, input.paymentMethodId],
        );
        if ((disabled.rowCount ?? 0) > 0) {
          await client.query(
            `update subscriptions
             set payment_method_id = null,
                 status = case
                   when status in ('billing_authorized', 'charge_pending', 'active', 'past_due') then 'past_due'
                   else status
                 end,
                 grace_ends_at = coalesce(grace_ends_at, now() + interval '7 days'),
                 updated_at = now()
             where workspace_id = $1 and payment_method_id = $2`,
            [input.workspaceId, input.paymentMethodId],
          );
        }
        const updated = await loadAccount(client, input.workspaceId);
        if (!updated) throw new Error("billing account disappeared");
        return { account: updated, changed: (disabled.rowCount ?? 0) > 0 };
      });
    },

    async findAccountByBillingKey(billingKey) {
      return globalTransaction(async (client) => {
        const found = await client.query<{ workspace_id: string }>(
          `select workspace_id from payment_methods where billing_key_fingerprint = $1`,
          [fingerprint(billingKey)],
        );
        const workspaceId = found.rows[0]?.workspace_id;
        return workspaceId ? loadAccount(client, workspaceId) : null;
      });
    },
  };
}
