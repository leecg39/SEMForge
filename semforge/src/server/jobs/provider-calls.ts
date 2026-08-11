// @TASK P3-W1-T1 - Provider-call and usage reservation idempotency coordinator
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/provider-calls.integration.test.ts
import type {
  ProviderCallCoordinator,
  ProviderCallFailure,
  ProviderCallRequest,
  ProviderCallReservation,
  ProviderCallSuccess,
} from "@/server/jobs/contracts";
import { withWorkerTransaction } from "@/server/jobs/connection";
import type { SqlQueryable } from "@/server/jobs/queue";

export interface ProviderCallCoordinatorScope {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly clock?: () => Date;
}

type ProviderCallRow = {
  provider_call_id: string;
  call_provider: string;
  call_operation: string;
  call_idempotency_key: string;
  request_hash: string;
  call_status: string;
  response_metadata: Record<string, unknown> | string;
};

type UsageReservationRow = {
  usage_reservation_id: string;
  provider_call_id: string;
  usage_provider: string;
  usage_resource: string;
  usage_units: number;
  usage_status: string;
  usage_idempotency_key: string;
  usage_period_start: Date | string;
  usage_period_end: Date | string;
  usage_expires_at: Date | string;
};

type MatchedReservationRow = {
  provider_call_id: string;
  provider: string;
  operation: string;
};

export class ProviderCallCoordinatorError extends Error {
  constructor(
    readonly code:
      | "INVALID_PROVIDER_CALL"
      | "IDEMPOTENCY_CONFLICT"
      | "PROVIDER_CALL_STATE_CONFLICT",
    message: string = code,
  ) {
    super(message);
    this.name = "ProviderCallCoordinatorError";
  }
}

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 300) {
    throw new ProviderCallCoordinatorError("INVALID_PROVIDER_CALL", `${field} is invalid`);
  }
  return normalized;
}

function requireUnits(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
    throw new ProviderCallCoordinatorError("INVALID_PROVIDER_CALL", "units is invalid");
  }
  return value;
}

function requireCostUnits(value: number | undefined): number {
  const normalized = value ?? 0;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1_000_000_000) {
    throw new ProviderCallCoordinatorError("INVALID_PROVIDER_CALL", "costUnits is invalid");
  }
  return normalized;
}

function requirePeriod(request: ProviderCallRequest): void {
  if (
    !Number.isFinite(request.periodStart.getTime()) ||
    !Number.isFinite(request.periodEnd.getTime()) ||
    !Number.isFinite(request.reservationExpiresAt.getTime()) ||
    request.periodEnd <= request.periodStart ||
    request.reservationExpiresAt <= request.periodStart
  ) {
    throw new ProviderCallCoordinatorError("INVALID_PROVIDER_CALL", "reservation period is invalid");
  }
}

function parseMetadata(value: ProviderCallRow["response_metadata"]): Readonly<Record<string, unknown>> {
  if (typeof value !== "string") return value;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProviderCallCoordinatorError("PROVIDER_CALL_STATE_CONFLICT");
  }
  return parsed as Record<string, unknown>;
}

function sameInstant(value: Date | string, expected: Date): boolean {
  return new Date(value).getTime() === expected.getTime();
}

function validStatePair(callStatus: string, usageStatus: string): boolean {
  return (
    (callStatus === "started" && usageStatus === "reserved") ||
    (callStatus === "succeeded" && usageStatus === "consumed") ||
    (callStatus === "failed" && usageStatus === "released")
  );
}

export class PostgresProviderCallCoordinator implements ProviderCallCoordinator {
  private readonly workspaceId: string;
  private readonly jobId: string;
  private readonly workerId: string;
  private readonly clock: () => Date;

  constructor(
    private readonly database: SqlQueryable,
    scope: ProviderCallCoordinatorScope,
  ) {
    this.workspaceId = requireNonBlank(scope.workspaceId, "workspaceId");
    this.jobId = requireNonBlank(scope.jobId, "jobId");
    this.workerId = requireNonBlank(scope.workerId, "workerId");
    this.clock = scope.clock ?? (() => new Date());
  }

  async reserve(request: ProviderCallRequest): Promise<ProviderCallReservation> {
    requirePeriod(request);
    const provider = requireNonBlank(request.provider, "provider");
    const operation = requireNonBlank(request.operation, "operation");
    const idempotencyKey = requireNonBlank(request.idempotencyKey, "idempotencyKey");
    const requestHash = requireNonBlank(request.requestHash, "requestHash");
    const resource = requireNonBlank(request.resource, "resource");
    const units = requireUnits(request.units);
    const usageIdempotencyKey = `provider-call:${provider}:${idempotencyKey}`;
    const now = this.clock();

    return withWorkerTransaction(this.database, async (transaction) => {
      const insertedCall = await transaction.query<ProviderCallRow>(
        `insert into provider_calls
           (workspace_id, provider, operation, idempotency_key, request_hash, status,
            response_metadata, started_at)
         values ($1, $2, $3, $4, $5, 'started', jsonb_build_object('jobId', $6::text), $7)
         on conflict (workspace_id, provider, idempotency_key) do nothing
         returning id::text as provider_call_id, provider as call_provider,
                   operation as call_operation, idempotency_key as call_idempotency_key,
                   request_hash, status as call_status, response_metadata`,
        [this.workspaceId, provider, operation, idempotencyKey, requestHash, this.jobId, now],
      );
      const callInserted = insertedCall.rows.length === 1;
      let call = insertedCall.rows[0];

      // A separate READ COMMITTED statement sees a row that made ON CONFLICT wait but was
      // invisible to the insert statement snapshot on real PostgreSQL.
      if (!call) {
        const resolvedCall = await transaction.query<ProviderCallRow>(
          `select id::text as provider_call_id, provider as call_provider,
                  operation as call_operation, idempotency_key as call_idempotency_key,
                  request_hash, status as call_status, response_metadata
             from provider_calls
            where workspace_id = $1 and provider = $2 and idempotency_key = $3
            for update`,
          [this.workspaceId, provider, idempotencyKey],
        );
        call = resolvedCall.rows[0];
      }
      if (!call) throw new ProviderCallCoordinatorError("PROVIDER_CALL_STATE_CONFLICT");
      if (
        call.call_provider !== provider ||
        call.call_operation !== operation ||
        call.call_idempotency_key !== idempotencyKey ||
        call.request_hash !== requestHash
      ) {
        throw new ProviderCallCoordinatorError("IDEMPOTENCY_CONFLICT");
      }

      const insertedUsage = await transaction.query<UsageReservationRow>(
        `insert into usage_reservations
           (workspace_id, provider_call_id, provider, resource, units, status, idempotency_key,
            period_start, period_end, expires_at)
         values ($1, $2, $3, $4, $5, 'reserved', $6, $7, $8, $9)
         on conflict (workspace_id, idempotency_key) do nothing
         returning id::text as usage_reservation_id, provider_call_id::text,
                   provider as usage_provider, resource as usage_resource, units as usage_units,
                   status as usage_status, idempotency_key as usage_idempotency_key,
                   period_start as usage_period_start, period_end as usage_period_end,
                   expires_at as usage_expires_at`,
        [
          this.workspaceId,
          call.provider_call_id,
          provider,
          resource,
          units,
          usageIdempotencyKey,
          request.periodStart,
          request.periodEnd,
          request.reservationExpiresAt,
        ],
      );
      let usage = insertedUsage.rows[0];
      if (!usage) {
        const resolvedUsage = await transaction.query<UsageReservationRow>(
          `select id::text as usage_reservation_id, provider_call_id::text,
                  provider as usage_provider, resource as usage_resource, units as usage_units,
                  status as usage_status, idempotency_key as usage_idempotency_key,
                  period_start as usage_period_start, period_end as usage_period_end,
                  expires_at as usage_expires_at
             from usage_reservations
            where workspace_id = $1 and idempotency_key = $2
            for update`,
          [this.workspaceId, usageIdempotencyKey],
        );
        usage = resolvedUsage.rows[0];
      }
      if (!usage) throw new ProviderCallCoordinatorError("PROVIDER_CALL_STATE_CONFLICT");
      if (
        usage.provider_call_id !== call.provider_call_id ||
        usage.usage_provider !== provider ||
        usage.usage_resource !== resource ||
        usage.usage_units !== units ||
        usage.usage_idempotency_key !== usageIdempotencyKey ||
        !sameInstant(usage.usage_period_start, request.periodStart) ||
        !sameInstant(usage.usage_period_end, request.periodEnd) ||
        !sameInstant(usage.usage_expires_at, request.reservationExpiresAt)
      ) {
        throw new ProviderCallCoordinatorError("IDEMPOTENCY_CONFLICT");
      }
      if (!validStatePair(call.call_status, usage.usage_status)) {
        throw new ProviderCallCoordinatorError("PROVIDER_CALL_STATE_CONFLICT");
      }

      if (callInserted) {
        await transaction.query(
          `insert into audit_events
             (workspace_id, action, entity_type, entity_id, request_id, metadata)
           values ($1, 'provider_call.reserved', 'provider_call', $2, $3,
                   jsonb_build_object('provider', $4::text, 'operation', $5::text,
                                      'jobId', $6::text, 'units', $7::integer))`,
          [
            this.workspaceId,
            call.provider_call_id,
            this.workerId,
            provider,
            operation,
            this.jobId,
            units,
          ],
        );
      }

      const disposition = callInserted
        ? "execute"
        : call.call_status === "succeeded"
          ? "replay"
          : "in_doubt";
      return {
        disposition,
        providerCallId: call.provider_call_id,
        usageReservationId: usage.usage_reservation_id,
        responseMetadata: disposition === "replay" ? parseMetadata(call.response_metadata) : null,
      };
    });
  }

  async succeed(result: ProviderCallSuccess): Promise<void> {
    const providerCallId = requireNonBlank(result.providerCallId, "providerCallId");
    const usageReservationId = requireNonBlank(result.usageReservationId, "usageReservationId");
    const costUnits = requireCostUnits(result.costUnits);
    const responseMetadata = result.responseMetadata ?? {};
    const now = this.clock();

    await withWorkerTransaction(this.database, async (transaction) => {
      const matched = await this.lockReservation(
        transaction,
        providerCallId,
        usageReservationId,
      );
      await transaction.query(
        `update provider_calls
            set status = 'succeeded', cost_units = $3, response_metadata = $4::jsonb,
                completed_at = $5
          where workspace_id = $1 and id = $2`,
        [this.workspaceId, providerCallId, costUnits, JSON.stringify(responseMetadata), now],
      );
      await transaction.query(
        `update usage_reservations
            set status = 'consumed', updated_at = $4
          where workspace_id = $1 and id = $2 and provider_call_id = $3`,
        [this.workspaceId, usageReservationId, providerCallId, now],
      );
      await transaction.query(
        `insert into audit_events
           (workspace_id, action, entity_type, entity_id, request_id, metadata)
         values ($1, 'provider_call.succeeded', 'provider_call', $2, $3,
                 jsonb_build_object('provider', $4::text, 'operation', $5::text,
                                    'costUnits', $6::numeric))`,
        [
          this.workspaceId,
          providerCallId,
          this.workerId,
          matched.provider,
          matched.operation,
          costUnits,
        ],
      );
    });
  }

  async fail(result: ProviderCallFailure): Promise<void> {
    const providerCallId = requireNonBlank(result.providerCallId, "providerCallId");
    const usageReservationId = requireNonBlank(result.usageReservationId, "usageReservationId");
    const errorCode = requireNonBlank(result.errorCode, "errorCode");
    const responseMetadata = result.responseMetadata ?? {};
    const now = this.clock();

    await withWorkerTransaction(this.database, async (transaction) => {
      const matched = await this.lockReservation(
        transaction,
        providerCallId,
        usageReservationId,
      );
      await transaction.query(
        `update provider_calls
            set status = 'failed',
                response_metadata = $4::jsonb || jsonb_build_object('errorCode', $3::text),
                completed_at = $5
          where workspace_id = $1 and id = $2`,
        [this.workspaceId, providerCallId, errorCode, JSON.stringify(responseMetadata), now],
      );
      await transaction.query(
        `update usage_reservations
            set status = 'released', updated_at = $4
          where workspace_id = $1 and id = $2 and provider_call_id = $3`,
        [this.workspaceId, usageReservationId, providerCallId, now],
      );
      await transaction.query(
        `insert into audit_events
           (workspace_id, action, entity_type, entity_id, request_id, metadata)
         values ($1, 'provider_call.failed', 'provider_call', $2, $3,
                 jsonb_build_object('provider', $4::text, 'operation', $5::text,
                                    'errorCode', $6::text))`,
        [
          this.workspaceId,
          providerCallId,
          this.workerId,
          matched.provider,
          matched.operation,
          errorCode,
        ],
      );
    });
  }

  private async lockReservation(
    transaction: SqlQueryable,
    providerCallId: string,
    usageReservationId: string,
  ): Promise<MatchedReservationRow> {
    const matched = await transaction.query<MatchedReservationRow>(
      `select provider_call.id::text as provider_call_id,
              provider_call.provider, provider_call.operation
         from provider_calls as provider_call
         join usage_reservations as usage
           on usage.workspace_id = provider_call.workspace_id
          and usage.provider_call_id = provider_call.id
        where provider_call.workspace_id = $1 and provider_call.id = $2
          and usage.id = $3 and provider_call.status = 'started'
          and usage.status = 'reserved'
        for update of provider_call, usage`,
      [this.workspaceId, providerCallId, usageReservationId],
    );
    const row = matched.rows[0];
    if (!row) throw new ProviderCallCoordinatorError("PROVIDER_CALL_STATE_CONFLICT");
    return row;
  }
}
