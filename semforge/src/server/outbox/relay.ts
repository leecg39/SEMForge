// @TASK P3-W1-T1 - Transactional outbox claim and job publication
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/outbox/relay.integration.test.ts
import type { JobLeaseFence, JobStatus } from "@/server/jobs/contracts";
import {
  type JobRecord,
  type SqlQueryable,
} from "@/server/jobs/queue";

export interface ClaimOutboxInput {
  readonly workerId: string;
  readonly limit?: number;
  readonly leaseMs?: number;
  readonly now?: Date;
  readonly topics?: readonly string[];
}

export interface PublishOutboxInput {
  readonly jobType?: string;
  readonly priority?: number;
  readonly maxAttempts?: number;
  readonly now?: Date;
}

export interface RecoverExpiredOutboxInput {
  readonly now?: Date;
  readonly limit?: number;
}

export interface ListDeadOutboxInput {
  readonly workspaceId: string;
  readonly now?: Date;
  readonly limit?: number;
}

export interface OutboxRecoveryResult {
  readonly record: OutboxRecord;
  readonly dead: boolean;
}

export interface OutboxRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly topic: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly availableAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly publishedAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
}

export interface LeasedOutboxRecord extends OutboxRecord {
  readonly lease: JobLeaseFence;
}

type OutboxRow = {
  id: string;
  workspace_id: string;
  topic: string;
  payload: Record<string, unknown> | string;
  idempotency_key: string;
  request_hash: string;
  available_at: Date | string;
  lease_owner: string | null;
  lease_token: string | null;
  lease_generation: number | string | bigint;
  lease_expires_at: Date | string | null;
  attempts: number;
  max_attempts: number;
  published_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
};

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
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  idempotency_conflict?: boolean;
};

type PublishRow = {
  job: JobRow | string | null;
  idempotency_conflict: boolean;
  privacy_suppressed: boolean;
};

export class OutboxRelayError extends Error {
  constructor(
    readonly code:
      | "INVALID_OUTBOX"
      | "LEASE_LOST"
      | "JOB_NOT_FOUND"
      | "IDEMPOTENCY_CONFLICT"
      | "WORKSPACE_PRIVACY_SUPPRESSED",
    message: string = code,
  ) {
    super(message);
    this.name = "OutboxRelayError";
  }
}

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new OutboxRelayError("INVALID_OUTBOX", `${field} is invalid`);
  }
  return normalized;
}

function requireInteger(value: number, minimum: number, maximum: number, field: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new OutboxRelayError("INVALID_OUTBOX", `${field} is invalid`);
  }
  return value;
}

function parseJson(value: Record<string, unknown> | string): Readonly<Record<string, unknown>> {
  if (typeof value !== "string") return value;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OutboxRelayError("INVALID_OUTBOX", "payload is invalid");
  }
  return parsed as Record<string, unknown>;
}

function toLeasedOutbox(row: OutboxRow): LeasedOutboxRecord {
  if (!row.lease_owner || !row.lease_token || !row.lease_expires_at) {
    throw new OutboxRelayError("INVALID_OUTBOX", "outbox lease is missing");
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    topic: row.topic,
    payload: parseJson(row.payload),
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    availableAt: new Date(row.available_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    lease: {
      owner: row.lease_owner,
      token: row.lease_token,
      generation: Number(row.lease_generation),
      expiresAt: new Date(row.lease_expires_at),
    },
  };
}

function toOutbox(row: OutboxRow): OutboxRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    topic: row.topic,
    payload: parseJson(row.payload),
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    availableAt: new Date(row.available_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
  };
}

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    status: row.status,
    payload: parseJson(row.payload),
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

function parsePublishJob(value: PublishRow["job"]): JobRow | null {
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OutboxRelayError("INVALID_OUTBOX", "published job is invalid");
  }
  return parsed as JobRow;
}

const OUTBOX_COLUMNS = `
  id::text, workspace_id::text, topic, payload, idempotency_key, request_hash, available_at,
  lease_owner, lease_token::text, lease_generation, lease_expires_at,
  attempts, max_attempts, published_at, last_error, created_at
`;

const CLAIMED_OUTBOX_COLUMNS = `
  event.id::text, event.workspace_id::text, event.topic, event.payload, event.idempotency_key, event.request_hash,
  event.available_at, event.lease_owner, event.lease_token::text, event.lease_generation,
  event.lease_expires_at, event.attempts, event.max_attempts, event.published_at,
  event.last_error, event.created_at
`;

const JOB_COLUMNS = `
  id::text, workspace_id::text, type, status, payload, idempotency_key, request_hash,
  priority, available_at, attempts, max_attempts, last_error, created_at, updated_at
`;

const EXISTING_JOB_COLUMNS = `
  job.id::text, job.workspace_id::text, job.type, job.status, job.payload, job.idempotency_key, job.request_hash,
  job.priority, job.available_at, job.attempts, job.max_attempts, job.last_error,
  job.created_at, job.updated_at
`;

export class PostgresOutboxRelay {
  constructor(
    private readonly database: SqlQueryable,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async claim(input: ClaimOutboxInput): Promise<LeasedOutboxRecord[]> {
    const workerId = requireNonBlank(input.workerId, "workerId");
    const limit = requireInteger(input.limit ?? 1, 1, 100, "limit");
    const leaseMs = requireInteger(input.leaseMs ?? 60_000, 1_000, 60 * 60 * 1000, "leaseMs");
    const now = input.now ?? this.clock();
    const topics = input.topics?.map((topic) => requireNonBlank(topic, "topic"));
    if (topics && (topics.length === 0 || new Set(topics).size !== topics.length)) {
      throw new OutboxRelayError("INVALID_OUTBOX", "topics are invalid");
    }
    const result = await this.database.query<OutboxRow>(
      `with suppressible as (
         select event.id
           from outbox event
           left join workspace_privacy_controls privacy
             on privacy.workspace_id = event.workspace_id
          where event.published_at is null and event.available_at <= $1
            and event.attempts < event.max_attempts
            and (event.lease_expires_at is null or event.lease_expires_at <= $1)
            and ($5::text[] is null or event.topic = any($5::text[]))
            and (privacy.workspace_id is null or privacy.state <> 'active')
          order by event.available_at asc, event.created_at asc
          for update of event skip locked
          limit $2
       ), suppressed as (
         update outbox as event
            set published_at = $1,
                lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                last_error = 'WORKSPACE_PRIVACY_SUPPRESSED'
           from suppressible
          where event.id = suppressible.id
         returning event.id::text, event.workspace_id::text, event.topic
       ), suppressed_audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid, 'outbox.suppressed', 'outbox', id, $3,
                jsonb_build_object('reason', 'WORKSPACE_PRIVACY_SUPPRESSED', 'topic', topic)
           from suppressed
       ), candidates as (
         select event.id
           from outbox event
           join workspace_privacy_controls privacy
             on privacy.workspace_id = event.workspace_id and privacy.state = 'active'
          where event.published_at is null and event.available_at <= $1
            and event.attempts < event.max_attempts
            and (event.lease_expires_at is null or event.lease_expires_at <= $1)
            and ($5::text[] is null or event.topic = any($5::text[]))
          order by event.available_at asc, event.created_at asc
          for update of event skip locked
          limit $2
       ), claimed as (
         update outbox as event
            set lease_owner = $3,
                lease_token = gen_random_uuid(),
                lease_generation = event.lease_generation + 1,
                lease_expires_at = $1::timestamptz + ($4::double precision * interval '1 millisecond'),
                attempts = event.attempts + 1
           from candidates
          where event.id = candidates.id
         returning ${CLAIMED_OUTBOX_COLUMNS}
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid, 'outbox.leased', 'outbox', id::text, $3,
                jsonb_build_object('attempt', attempts, 'leaseGeneration', lease_generation, 'topic', topic)
           from claimed
       )
       select * from claimed order by available_at asc, created_at asc`,
      [now, limit, workerId, leaseMs, topics ?? null],
    );
    return result.rows.map(toLeasedOutbox);
  }

  async publish(event: LeasedOutboxRecord, input: PublishOutboxInput = {}): Promise<JobRecord> {
    const now = input.now ?? this.clock();
    const jobType = requireNonBlank(input.jobType ?? event.topic, "jobType");
    const priority = requireInteger(input.priority ?? 100, -1_000_000, 1_000_000, "priority");
    const maxAttempts = requireInteger(input.maxAttempts ?? 5, 1, 100, "maxAttempts");
    const result = await this.database.query<PublishRow>(
      `with privacy_lock as materialized (
         select pg_advisory_xact_lock_shared(privacy_workspace_lock_key($1::uuid))
       ), privacy_control as materialized (
         select privacy.state::text as state
           from workspace_privacy_controls privacy
           cross join privacy_lock
          where privacy.workspace_id = $1::uuid
          for share of privacy
       ), source as (
         select ${OUTBOX_COLUMNS}
           from outbox event
           cross join privacy_lock
          where event.workspace_id = $1 and event.id = $2
            and (
              event.published_at is not null
              or (
                event.published_at is null and event.lease_owner = $3 and event.lease_token = $4
                and event.lease_generation = $5 and event.lease_expires_at > $6
                and exists (select 1 from privacy_control where state = 'active')
              )
            )
          for update of event
       ), suppressed as (
         update outbox as event
            set published_at = $6,
                lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                last_error = 'WORKSPACE_PRIVACY_SUPPRESSED'
          where event.workspace_id = $1 and event.id = $2
            and event.published_at is null
            and event.lease_owner = $3 and event.lease_token = $4
            and event.lease_generation = $5 and event.lease_expires_at > $6
            and exists (select 1 from privacy_lock)
            and not exists (select 1 from privacy_control where state = 'active')
         returning event.id::text, event.workspace_id::text, event.topic
       ), suppressed_audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid, 'outbox.suppressed', 'outbox', id, $3,
                jsonb_build_object('reason', 'WORKSPACE_PRIVACY_SUPPRESSED', 'topic', topic)
           from suppressed
       ), inserted_job as (
         insert into jobs
           (workspace_id, type, payload, idempotency_key, priority, available_at, max_attempts)
         select workspace_id::uuid, $7, payload,
                'outbox:' || topic || ':' || idempotency_key,
                $8, $6, $9
           from source
          where published_at is null
         on conflict (workspace_id, type, idempotency_key) do nothing
         returning ${JOB_COLUMNS}
       ), resolved_job as (
         select * from inserted_job
         union all
         select ${EXISTING_JOB_COLUMNS}
           from jobs as job
           join source on source.workspace_id::uuid = job.workspace_id
                      and job.type = $7
                      and job.idempotency_key = 'outbox:' || source.topic || ':' || source.idempotency_key
          where not exists (select 1 from inserted_job)
       ), checked_job as (
         select resolved_job.*,
                resolved_job.request_hash <> encode(sha256(convert_to(
                  $7::text || chr(31) || source.payload::text || chr(31) ||
                  $9::integer::text || chr(31) || $8::integer::text,
                  'UTF8'
                )), 'hex') as idempotency_conflict
           from resolved_job cross join source
       ), published as (
         update outbox as event
            set published_at = coalesce(event.published_at, $6),
                lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                last_error = null
           from source
          where event.id = source.id::uuid
            and exists (select 1 from checked_job where not idempotency_conflict)
         returning event.id::text
       ), audited as (
         insert into audit_events (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select source.workspace_id::uuid, 'outbox.published', 'outbox', source.id::text, $3,
                jsonb_build_object('topic', source.topic, 'jobType', $7)
           from source
          where source.published_at is null and exists (select 1 from published)
       )
       select to_jsonb(checked_job) as job,
              checked_job.idempotency_conflict,
              false as privacy_suppressed
         from checked_job
        where checked_job.idempotency_conflict or exists (select 1 from published)
       union all
       select null::jsonb as job, false as idempotency_conflict, true as privacy_suppressed
         from suppressed
        limit 1`,
      [
        requireNonBlank(event.workspaceId, "workspaceId"),
        requireNonBlank(event.id, "outboxId"),
        requireNonBlank(event.lease.owner, "leaseOwner"),
        requireNonBlank(event.lease.token, "leaseToken"),
        event.lease.generation,
        now,
        jobType,
        priority,
        maxAttempts,
      ],
    );
    const row = result.rows[0];
    if (row?.privacy_suppressed) {
      throw new OutboxRelayError("WORKSPACE_PRIVACY_SUPPRESSED");
    }
    if (row?.idempotency_conflict) {
      throw new OutboxRelayError("IDEMPOTENCY_CONFLICT");
    }
    const job = parsePublishJob(row?.job ?? null);
    if (!job) {
      throw new OutboxRelayError("LEASE_LOST", "OUTBOX_LEASE_LOST");
    }
    return toJob(job);
  }

  async recoverExpired(
    input: RecoverExpiredOutboxInput = {},
  ): Promise<OutboxRecoveryResult[]> {
    const now = input.now ?? this.clock();
    const limit = requireInteger(input.limit ?? 100, 1, 1_000, "limit");
    const result = await this.database.query<OutboxRow>(
      `with candidates as (
         select id, lease_owner as expired_lease_owner, last_error as previous_error
           from outbox
          where published_at is null and lease_expires_at <= $1
          order by lease_expires_at asc, created_at asc
          for update skip locked
          limit $2
       ), changed as (
         update outbox as event
            set lease_owner = null,
                lease_token = null,
                lease_expires_at = null,
                available_at = $1,
                last_error = 'LEASE_EXPIRED'
           from candidates
          where event.id = candidates.id
         returning ${CLAIMED_OUTBOX_COLUMNS},
                   candidates.expired_lease_owner, candidates.previous_error
       ), audited as (
         insert into audit_events
           (workspace_id, action, entity_type, entity_id, request_id, metadata)
         select workspace_id::uuid,
                case when attempts >= max_attempts then 'outbox.dead' else 'outbox.recovered' end,
                'outbox', id::text, expired_lease_owner,
                jsonb_strip_nulls(jsonb_build_object(
                  'attempt', attempts,
                  'leaseGeneration', lease_generation,
                  'previousError', previous_error,
                  'reason', 'LEASE_EXPIRED'
                ))
           from changed
       )
       select * from changed order by available_at asc, created_at asc`,
      [now, limit],
    );
    return result.rows.map((row) => ({
      record: toOutbox(row),
      dead: row.attempts >= row.max_attempts,
    }));
  }

  async listDead(input: ListDeadOutboxInput): Promise<OutboxRecord[]> {
    const now = input.now ?? this.clock();
    const limit = requireInteger(input.limit ?? 100, 1, 1_000, "limit");
    const result = await this.database.query<OutboxRow>(
      `select ${OUTBOX_COLUMNS}
         from outbox
        where workspace_id = $1 and published_at is null and attempts >= max_attempts
          and (lease_expires_at is null or lease_expires_at <= $2)
        order by available_at asc, created_at asc
        limit $3`,
      [requireNonBlank(input.workspaceId, "workspaceId"), now, limit],
    );
    return result.rows.map(toOutbox);
  }
}
