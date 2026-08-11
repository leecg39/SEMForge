// @TASK P3-W1-T1 - Collector-facing lease, handler, and provider-call contract
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/contracts.test.ts

export type JobStatus = "queued" | "leased" | "succeeded" | "retryable" | "dead";

export interface JobHandlerInput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly payload: Readonly<TPayload>;
  readonly idempotencyKey: string;
  readonly attempt: number;
  readonly maxAttempts: number;
}

export interface JobLeaseFence {
  readonly owner: string;
  readonly token: string;
  readonly generation: number;
  readonly expiresAt: Date;
}

export interface ProviderCallRequest {
  readonly provider: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly resource: string;
  readonly units: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly reservationExpiresAt: Date;
}

export interface ProviderCallReservation {
  readonly disposition: "execute" | "replay" | "in_doubt";
  readonly providerCallId: string;
  readonly usageReservationId: string;
  readonly responseMetadata: Readonly<Record<string, unknown>> | null;
}

export interface ProviderCallSuccess {
  readonly providerCallId: string;
  readonly usageReservationId: string;
  readonly responseMetadata?: Readonly<Record<string, unknown>>;
  readonly costUnits?: number;
}

export interface ProviderCallFailure {
  readonly providerCallId: string;
  readonly usageReservationId: string;
  readonly errorCode: string;
  readonly responseMetadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderCallCoordinator {
  reserve(request: ProviderCallRequest): Promise<ProviderCallReservation>;
  succeed(result: ProviderCallSuccess): Promise<void>;
  fail(result: ProviderCallFailure): Promise<void>;
}

export interface JobExecutionContext {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly lease: JobLeaseFence;
  readonly signal: AbortSignal;
  readonly providerCalls: ProviderCallCoordinator;
  now(): Date;
  audit(action: string, metadata?: Readonly<Record<string, unknown>>): Promise<void>;
}

export type JobHandlerResult =
  | {
      readonly status: "succeeded";
      readonly metadata: Readonly<Record<string, unknown>>;
    }
  | {
      readonly status: "retryable";
      readonly error: string;
      readonly retryAt?: Date;
    }
  | {
      readonly status: "dead";
      readonly error: string;
    };

export type JobHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> = (
  job: JobHandlerInput<TPayload>,
  context: JobExecutionContext,
) => Promise<JobHandlerResult>;

export function defineJobHandler<TPayload extends Record<string, unknown>>(
  handler: JobHandler<TPayload>,
): JobHandler<TPayload> {
  return handler;
}

export function jobSucceeded(
  metadata: Readonly<Record<string, unknown>> = {},
): JobHandlerResult {
  return { status: "succeeded", metadata };
}

export function jobRetryable(error: string, retryAt?: Date): JobHandlerResult {
  return retryAt
    ? { status: "retryable", error, retryAt }
    : { status: "retryable", error };
}

export function jobDead(error: string): JobHandlerResult {
  return { status: "dead", error };
}
