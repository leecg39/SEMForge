// @TASK P3-W1-T1 - PostgreSQL SKIP LOCKED lease job queue
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/queue.integration.test.ts
import type { JobLeaseFence, JobStatus } from "@/server/jobs/contracts";

export interface SqlQueryable {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface EnqueueJobInput {
  readonly workspaceId: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly priority?: number;
  readonly availableAt?: Date;
  readonly maxAttempts?: number;
}

export interface ClaimJobsInput {
  readonly workerId: string;
  readonly limit?: number;
  readonly leaseMs?: number;
  readonly now?: Date;
}

export interface JobRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly status: JobStatus;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly priority: number;
  readonly availableAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LeasedJob extends JobRecord {
  readonly status: "leased";
  readonly lease: JobLeaseFence;
}

export interface LeaseTimingInput {
  readonly now?: Date;
  readonly leaseMs?: number;
}

export interface CompleteJobInput {
  readonly now?: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FailJobInput {
  readonly error: string;
  readonly retryable: boolean;
  readonly retryAt?: Date;
  readonly now?: Date;
}

export interface RecoverExpiredJobsInput {
  readonly now?: Date;
  readonly limit?: number;
}

type LeaseReference = Pick<LeasedJob, "id" | "workspaceId" | "lease">;

type JobRow = {
  id: string;
  workspace_id: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown> | string;
  idempotency_key: string;
  request_hash: string;
  priority: number;
  available_at: Date | string;
  lease_owner: string | null;
  lease_token: string | null;
  lease_generation: number | string | bigint;
  lease_expires_at: Date | string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export class JobQueueError extends Error {
  constructor(
    readonly code: "INVALID_JOB" | "LEASE_LOST" | "JOB_NOT_FOUND" | "IDEMPOTENCY_CONFLICT",
    message: string = code,
  ) {
    super(message);
    this.name = "JobQueueError";
  }
}

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new JobQueueError("INVALID_JOB", `${field} is invalid`);
  }
  return normalized;
}

function requireInteger(value: number, minimum: number, maximum: number, field: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new JobQueueError("INVALID_JOB", `${field} is invalid`);
  }
  return value;
}

function requireErrorCode(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(normalized)) {
    throw new JobQueueError("INVALID_JOB", "error code is invalid");
  }
  return normalized;
}

function parsePayload(payload: JobRow["payload"]): Readonly<Record<string, unknown>> {
  if (typeof payload !== "string") return payload;
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JobQueueError("INVALID_JOB", "stored payload is invalid");
  }
  return parsed as Record<string, unknown>;
}

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    status: row.status,
    payload: parsePayload(row.payload),
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    priority: row.priority,
    availableAt: new Date(row.available_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toLeasedJob(row: JobRow): LeasedJob {
  if (
    row.status !== "leased" ||
    !row.lease_owner ||
    !row.lease_token ||
    !row.lease_expires_at
  ) {
    throw new JobQueueError("INVALID_JOB", "claimed job is missing its lease fence");
  }
  return {
    ...toJob(row),
    status: "leased",
    lease: {
      owner: row.lease_owner,
      token: row.lease_token,
      generation: Number(row.lease_generation),
      expiresAt: new Date(row.lease_expires_at),
    },
  };
}

const JOB_COLUMNS = `
  id::text, workspace_id::text, type, status, payload, idempotency_key, request_hash,
  priority, available_at, lease_owner, lease_token::text, lease_generation,
  lease_expires_at, attempts, max_attempts, last_error, created_at, updated_at
`;

const CLAIMED_JOB_COLUMNS = `
  job.id::text, job.workspace_id::text, job.type, job.status, job.payload, job.idempotency_key, job.request_hash,
  job.priority, job.available_at, job.lease_owner, job.lease_token::text, job.lease_generation,
  job.lease_expires_at, job.attempts, job.max_attempts, job.last_error, job.created_at, job.updated_at
`;

export class PostgresJobQueue {
  constructor(
    private readonly database: SqlQueryable,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async enqueue(input: EnqueueJobInput): Promise<JobRecord> {
    const workspaceId = requireNonBlank(input.workspaceId, "workspaceId");
    const type = requireNonBlank(input.type, "type");
    const idempotencyKey = requireNonBlank(input.idempotencyKey, "idempotencyKey");
    const priority = requireInteger(input.priority ?? 100, -1_000_000, 1_000_000, "priority");
    const maxAttempts = requireInteger(input.maxAttempts ?? 5, 1, 100, "maxAttempts");
    const availableAt = input.availableAt ?? this.clock();
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
      throw new JobQueueError("INVALID_JOB", "payload is invalid");
    }

    const result = await this.database.query<JobRow>(
      `with inserted as (
         insert into jobs
           (workspace_id, type, payload, idempotency_key, priority, available_at, max_attempts)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7)
         on conflict (workspace_id, type, idempotency_key) do nothing
         returning ${JOB_COLUMNS}
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid, 'job.enqueued', 'job', id::text, $4,
                jsonb_build_object('type', type, 'idempotencyKey', idempotency_key)
           from inserted
       ), resolved as (
         select * from inserted
         union all
         select ${JOB_COLUMNS}
           from jobs
          where workspace_id = $1 and type = $2 and idempotency_key = $4
            and not exists (select 1 from inserted)
       )
       select * from resolved limit 1`,
      [workspaceId, type, JSON.stringify(input.payload), idempotencyKey, priority, availableAt, maxAttempts],
    );
    const row = result.rows[0];
    if (!row) throw new JobQueueError("JOB_NOT_FOUND");
    const expected = await this.database.query<{ request_hash: string }>(
      `select encode(sha256(convert_to($1::text || chr(31) || $2::jsonb::text || chr(31) ||
                 $3::integer::text || chr(31) || $4::integer::text, 'UTF8')), 'hex') as request_hash`,
      [type, JSON.stringify(input.payload), maxAttempts, priority],
    );
    if (row.request_hash !== expected.rows[0]?.request_hash) {
      throw new JobQueueError("IDEMPOTENCY_CONFLICT");
    }
    return toJob(row);
  }

  async claim(input: ClaimJobsInput): Promise<LeasedJob[]> {
    const workerId = requireNonBlank(input.workerId, "workerId");
    const limit = requireInteger(input.limit ?? 1, 1, 100, "limit");
    const leaseMs = requireInteger(input.leaseMs ?? 60_000, 1_000, 60 * 60 * 1000, "leaseMs");
    const now = input.now ?? this.clock();

    const result = await this.database.query<JobRow>(
       `with candidates as (
         select id
           from jobs
          where attempts < max_attempts
            and (
              (status in ('queued', 'retryable') and available_at <= $1)
              or (status = 'leased' and lease_expires_at <= $1)
            )
          order by priority asc, available_at asc, created_at asc
          for update skip locked
          limit $2
       ), claimed as (
         update jobs as job
            set status = 'leased',
                lease_owner = $3,
                lease_token = gen_random_uuid(),
                lease_generation = job.lease_generation + 1,
                lease_expires_at = $1::timestamptz + ($4::double precision * interval '1 millisecond'),
                attempts = job.attempts + 1,
                updated_at = $1
           from candidates
          where job.id = candidates.id
         returning ${CLAIMED_JOB_COLUMNS}
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid, 'job.leased', 'job', id::text, $3,
                jsonb_build_object('attempt', attempts, 'leaseGeneration', lease_generation)
           from claimed
       )
       select * from claimed order by priority asc, available_at asc, created_at asc`,
      [now, limit, workerId, leaseMs],
    );
    return result.rows.map(toLeasedJob);
  }

  async get(workspaceId: string, jobId: string): Promise<JobRecord | null> {
    const result = await this.database.query<JobRow>(
      `select ${JOB_COLUMNS}
         from jobs
        where workspace_id = $1 and id = $2
        limit 1`,
      [requireNonBlank(workspaceId, "workspaceId"), requireNonBlank(jobId, "jobId")],
    );
    return result.rows[0] ? toJob(result.rows[0]) : null;
  }

  async heartbeat(job: LeaseReference, input: LeaseTimingInput = {}): Promise<LeasedJob> {
    const now = input.now ?? this.clock();
    const leaseMs = requireInteger(input.leaseMs ?? 60_000, 1_000, 60 * 60 * 1000, "leaseMs");
    const result = await this.database.query<JobRow>(
      `with changed as (
         update jobs
            set lease_expires_at = $6::timestamptz + ($7::double precision * interval '1 millisecond'),
                updated_at = $6
          where workspace_id = $1 and id = $2 and status = 'leased'
            and lease_owner = $3 and lease_token = $4 and lease_generation = $5
            and lease_expires_at > $6
         returning ${JOB_COLUMNS}
       )
       select * from changed`,
      [
        requireNonBlank(job.workspaceId, "workspaceId"),
        requireNonBlank(job.id, "jobId"),
        requireNonBlank(job.lease.owner, "leaseOwner"),
        requireNonBlank(job.lease.token, "leaseToken"),
        job.lease.generation,
        now,
        leaseMs,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new JobQueueError("LEASE_LOST");
    return toLeasedJob(row);
  }

  async succeed(job: LeaseReference, input: CompleteJobInput = {}): Promise<JobRecord> {
    const now = input.now ?? this.clock();
    const metadata = input.metadata ?? {};
    const result = await this.database.query<JobRow>(
      `with changed as (
         update jobs
            set status = 'succeeded',
                lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                last_error = null,
                updated_at = $6
          where workspace_id = $1 and id = $2 and status = 'leased'
            and lease_owner = $3 and lease_token = $4 and lease_generation = $5
            and lease_expires_at > $6
         returning ${JOB_COLUMNS}
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid, 'job.succeeded', 'job', id::text, $3,
                $7::jsonb || jsonb_build_object('attempt', attempts, 'leaseGeneration', $5::bigint)
           from changed
       )
       select * from changed`,
      [
        requireNonBlank(job.workspaceId, "workspaceId"),
        requireNonBlank(job.id, "jobId"),
        requireNonBlank(job.lease.owner, "leaseOwner"),
        requireNonBlank(job.lease.token, "leaseToken"),
        job.lease.generation,
        now,
        JSON.stringify(metadata),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new JobQueueError("LEASE_LOST");
    return toJob(row);
  }

  async fail(job: LeaseReference, input: FailJobInput): Promise<JobRecord> {
    const now = input.now ?? this.clock();
    const error = requireErrorCode(input.error);
    const result = await this.database.query<JobRow>(
      `with changed as (
         update jobs
            set status = case
                           when $7::boolean and attempts < max_attempts then 'retryable'::job_status
                           else 'dead'::job_status
                         end,
                available_at = case
                                 when $7::boolean and attempts < max_attempts
                                   then coalesce($8::timestamptz, $6::timestamptz)
                                 else available_at
                               end,
                lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                last_error = $9,
                updated_at = $6
          where workspace_id = $1 and id = $2 and status = 'leased'
            and lease_owner = $3 and lease_token = $4 and lease_generation = $5
            and lease_expires_at > $6
         returning ${JOB_COLUMNS}
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid,
                case when status = 'dead' then 'job.dead' else 'job.retryable' end,
                'job', id::text, $3,
                jsonb_build_object('attempt', attempts, 'leaseGeneration', $5::bigint, 'error', $9)
           from changed
       )
       select * from changed`,
      [
        requireNonBlank(job.workspaceId, "workspaceId"),
        requireNonBlank(job.id, "jobId"),
        requireNonBlank(job.lease.owner, "leaseOwner"),
        requireNonBlank(job.lease.token, "leaseToken"),
        job.lease.generation,
        now,
        input.retryable,
        input.retryAt ?? null,
        error,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new JobQueueError("LEASE_LOST");
    return toJob(row);
  }

  async recoverExpired(input: RecoverExpiredJobsInput = {}): Promise<JobRecord[]> {
    const now = input.now ?? this.clock();
    const limit = requireInteger(input.limit ?? 100, 1, 1_000, "limit");
    const result = await this.database.query<JobRow>(
      `with candidates as (
         select id, lease_owner as expired_lease_owner, last_error as previous_error
           from jobs
          where status = 'leased' and lease_expires_at <= $1
          order by lease_expires_at asc, created_at asc
          for update skip locked
          limit $2
       ), changed as (
         update jobs as job
            set status = case
                           when job.attempts < job.max_attempts then 'retryable'::job_status
                           else 'dead'::job_status
                         end,
                available_at = $1,
                lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                last_error = 'LEASE_EXPIRED',
                updated_at = $1
           from candidates
          where job.id = candidates.id
         returning ${CLAIMED_JOB_COLUMNS},
                   candidates.expired_lease_owner, candidates.previous_error
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid,
                case when status = 'dead' then 'job.dead' else 'job.recovered' end,
                'job', id::text, expired_lease_owner,
                jsonb_strip_nulls(jsonb_build_object(
                  'attempt', attempts,
                  'leaseGeneration', lease_generation,
                  'previousError', previous_error,
                  'reason', 'LEASE_EXPIRED'
                ))
           from changed
       )
       select * from changed order by updated_at asc, id asc`,
      [now, limit],
    );
    return result.rows.map(toJob);
  }
}
