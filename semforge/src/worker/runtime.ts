// @TASK P3-W1-T1 - Lease-aware collector worker runtime
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/worker/runtime.integration.test.ts
import type {
  JobExecutionContext,
  JobHandler,
  JobHandlerResult,
} from "@/server/jobs/contracts";
import { PostgresProviderCallCoordinator } from "@/server/jobs/provider-calls";
import {
  JobQueueError,
  type LeasedJob,
  PostgresJobQueue,
  type SqlQueryable,
} from "@/server/jobs/queue";

type RegisteredJobHandler = (...arguments_: never[]) => Promise<JobHandlerResult>;

export interface WorkerRuntimeOptions {
  readonly database: SqlQueryable;
  readonly handlers: Readonly<Record<string, RegisteredJobHandler>>;
  readonly workerId: string;
  readonly concurrency?: number;
  readonly leaseMs?: number;
  readonly heartbeatMs?: number;
  readonly pollMs?: number;
  readonly shutdownGraceMs?: number;
  readonly retryBackoffMs?: number;
  readonly maxRetryBackoffMs?: number;
  readonly clock?: () => Date;
}

export interface WorkerRunResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly retryable: number;
  readonly dead: number;
  readonly leaseLost: number;
}

type ExecutionOutcome = Exclude<keyof Omit<WorkerRunResult, "claimed">, number>;

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} is invalid`);
  }
  return value;
}

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new TypeError(`${field} is invalid`);
  return normalized;
}

function safeErrorCode(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized && normalized.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(normalized)
    ? normalized
    : fallback;
}

function isLeaseLost(error: unknown): boolean {
  return error instanceof JobQueueError && error.code === "LEASE_LOST";
}

function createCounter(claimed: number): MutableWorkerRunResult {
  return { claimed, succeeded: 0, retryable: 0, dead: 0, leaseLost: 0 };
}

interface MutableWorkerRunResult {
  claimed: number;
  succeeded: number;
  retryable: number;
  dead: number;
  leaseLost: number;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || milliseconds === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export class WorkerRuntime {
  private readonly database: SqlQueryable;
  private readonly handlers: Readonly<Record<string, RegisteredJobHandler>>;
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly leaseMs: number;
  private readonly heartbeatMs: number;
  private readonly pollMs: number;
  private readonly shutdownGraceMs: number;
  private readonly retryBackoffMs: number;
  private readonly maxRetryBackoffMs: number;
  private readonly clock: () => Date;
  private readonly queue: PostgresJobQueue;
  private readonly activeControllers = new Set<AbortController>();
  private running = false;

  constructor(options: WorkerRuntimeOptions) {
    this.database = options.database;
    this.handlers = options.handlers;
    this.workerId = requireNonBlank(options.workerId, "workerId");
    this.concurrency = requireInteger(options.concurrency ?? 1, 1, 100, "concurrency");
    this.leaseMs = requireInteger(options.leaseMs ?? 60_000, 1_000, 3_600_000, "leaseMs");
    this.heartbeatMs = requireInteger(
      options.heartbeatMs ?? Math.max(1, Math.floor(this.leaseMs / 3)),
      1,
      this.leaseMs - 1,
      "heartbeatMs",
    );
    this.pollMs = requireInteger(options.pollMs ?? 1_000, 1, 60_000, "pollMs");
    this.shutdownGraceMs = requireInteger(
      options.shutdownGraceMs ?? 30_000,
      0,
      10 * 60_000,
      "shutdownGraceMs",
    );
    this.retryBackoffMs = requireInteger(
      options.retryBackoffMs ?? 30_000,
      1,
      24 * 60 * 60_000,
      "retryBackoffMs",
    );
    this.maxRetryBackoffMs = requireInteger(
      options.maxRetryBackoffMs ?? 30 * 60_000,
      this.retryBackoffMs,
      7 * 24 * 60 * 60_000,
      "maxRetryBackoffMs",
    );
    this.clock = options.clock ?? (() => new Date());
    this.queue = new PostgresJobQueue(this.database, this.clock);
  }

  async runOnce(): Promise<WorkerRunResult> {
    await this.queue.recoverExpired({ now: this.clock(), limit: this.concurrency * 2 });
    const jobs = await this.queue.claim({
      workerId: this.workerId,
      limit: this.concurrency,
      leaseMs: this.leaseMs,
      now: this.clock(),
    });
    const result = createCounter(jobs.length);
    const outcomes = await Promise.all(jobs.map((job) => this.execute(job)));
    for (const outcome of outcomes) result[outcome] += 1;
    return result;
  }

  async start(signal: AbortSignal): Promise<void> {
    if (this.running) throw new Error("WORKER_ALREADY_RUNNING");
    this.running = true;
    const active = new Set<Promise<ExecutionOutcome>>();
    let stopping = signal.aborted;
    const stop = () => {
      stopping = true;
    };
    signal.addEventListener("abort", stop, { once: true });

    try {
      while (!stopping) {
        const capacity = this.concurrency - active.size;
        if (capacity > 0) {
          await this.queue.recoverExpired({ now: this.clock(), limit: capacity * 2 });
          if (stopping) break;
          const jobs = await this.queue.claim({
            workerId: this.workerId,
            limit: capacity,
            leaseMs: this.leaseMs,
            now: this.clock(),
          });
          for (const job of jobs) {
            const execution = this.execute(job);
            active.add(execution);
            void execution.then(
              () => active.delete(execution),
              () => active.delete(execution),
            );
          }
          if (jobs.length > 0) continue;
        }

        if (active.size >= this.concurrency) {
          await Promise.race([Promise.race(active), abortableDelay(this.pollMs, signal)]);
        } else {
          await abortableDelay(this.pollMs, signal);
        }
      }

      if (active.size === 0) return;
      const settled = Promise.allSettled([...active]);
      let graceExpired = false;
      await Promise.race([
        settled,
        abortableDelay(this.shutdownGraceMs).then(() => {
          graceExpired = true;
        }),
      ]);
      if (graceExpired && active.size > 0) {
        for (const controller of this.activeControllers) controller.abort("WORKER_SHUTDOWN");
      }
      await Promise.allSettled([...active]);
    } finally {
      signal.removeEventListener("abort", stop);
      this.running = false;
    }
  }

  private async execute(initialJob: LeasedJob): Promise<ExecutionOutcome> {
    const controller = new AbortController();
    this.activeControllers.add(controller);
    let currentJob = initialJob;
    let leaseLost = false;
    const heartbeatStop = new AbortController();
    const heartbeat = (async () => {
      while (!heartbeatStop.signal.aborted) {
        await abortableDelay(this.heartbeatMs, heartbeatStop.signal);
        if (heartbeatStop.signal.aborted) return;
        try {
          currentJob = await this.queue.heartbeat(currentJob, {
            now: this.clock(),
            leaseMs: this.leaseMs,
          });
        } catch (error) {
          leaseLost = true;
          controller.abort(isLeaseLost(error) ? "LEASE_LOST" : "HEARTBEAT_FAILED");
          return;
        }
      }
    })();

    try {
      const handler = Object.hasOwn(this.handlers, initialJob.type)
        ? this.handlers[initialJob.type]
        : undefined;
      if (!handler) {
        await this.queue.fail(currentJob, {
          error: "HANDLER_NOT_REGISTERED",
          retryable: false,
          now: this.clock(),
        });
        return "dead";
      }

      const context: JobExecutionContext = {
        workspaceId: initialJob.workspaceId,
        jobId: initialJob.id,
        attempt: initialJob.attempts,
        maxAttempts: initialJob.maxAttempts,
        lease: initialJob.lease,
        signal: controller.signal,
        providerCalls: new PostgresProviderCallCoordinator(this.database, {
          workspaceId: initialJob.workspaceId,
          jobId: initialJob.id,
          workerId: this.workerId,
          clock: this.clock,
        }),
        now: this.clock,
        audit: async (action, metadata = {}) => {
          const normalizedAction = safeErrorCode(action, "worker.audit.invalid_action");
          await this.database.query(
            `insert into audit_events
               (workspace_id, action, entity_type, entity_id, request_id, metadata)
             values ($1, $2, 'job', $3, $4, $5::jsonb)`,
            [
              initialJob.workspaceId,
              normalizedAction,
              initialJob.id,
              this.workerId,
              JSON.stringify(metadata),
            ],
          );
        },
      };
      const runtimeHandler = handler as unknown as JobHandler;
      let result: JobHandlerResult;
      try {
        result = await runtimeHandler(
          {
            id: initialJob.id,
            workspaceId: initialJob.workspaceId,
            type: initialJob.type,
            payload: initialJob.payload,
            idempotencyKey: initialJob.idempotencyKey,
            attempt: initialJob.attempts,
            maxAttempts: initialJob.maxAttempts,
          },
          context,
        );
      } catch {
        if (leaseLost) return "leaseLost";
        const now = this.clock();
        await this.queue.fail(currentJob, {
          error: controller.signal.aborted ? "WORKER_SHUTDOWN" : "HANDLER_EXCEPTION",
          retryable: true,
          retryAt: controller.signal.aborted ? now : this.retryAt(initialJob.attempts, now),
          now,
        });
        return "retryable";
      }

      if (leaseLost) return "leaseLost";
      if (controller.signal.aborted) {
        await this.queue.fail(currentJob, {
          error: "WORKER_SHUTDOWN",
          retryable: true,
          now: this.clock(),
        });
        return "retryable";
      }
      if (result.status === "succeeded") {
        await this.queue.succeed(currentJob, { metadata: result.metadata, now: this.clock() });
        return "succeeded";
      }
      const retryable = result.status === "retryable";
      const now = this.clock();
      const retryAt = result.status === "retryable"
        ? (result.retryAt ?? this.retryAt(initialJob.attempts, now))
        : undefined;
      const failed = await this.queue.fail(currentJob, {
        error: safeErrorCode(result.error, retryable ? "HANDLER_RETRYABLE" : "HANDLER_DEAD"),
        retryable,
        retryAt,
        now,
      });
      return failed.status === "dead" ? "dead" : "retryable";
    } catch (error) {
      if (isLeaseLost(error)) return "leaseLost";
      throw error;
    } finally {
      heartbeatStop.abort();
      await heartbeat;
      this.activeControllers.delete(controller);
    }
  }

  private retryAt(attempt: number, now: Date): Date {
    const exponent = Math.max(0, Math.min(30, attempt - 1));
    const delay = Math.min(this.maxRetryBackoffMs, this.retryBackoffMs * 2 ** exponent);
    return new Date(now.getTime() + delay);
  }
}
