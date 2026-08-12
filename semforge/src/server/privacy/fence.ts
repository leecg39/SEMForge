// @TASK P5-PRIVACY-FENCE - Workspace erasure vs tenant side-effect fencing
// @SPEC docs/ops/privacy-erasure-runbook.md
// @TEST src/server/privacy/fence.test.ts
export type WorkspacePrivacyState = "active" | "blocking" | "erased";

export interface WorkspacePrivacyFenceSql {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface WorkspacePrivacyFenceConnection extends WorkspacePrivacyFenceSql {
  /** true destroys a session whose advisory-lock state cannot be proven clean. */
  release(destroy?: boolean | Error): void;
}

export interface WorkspacePrivacyFencePool {
  connect(): Promise<WorkspacePrivacyFenceConnection>;
}

export interface WorkspaceErasureFenceInput {
  readonly workspaceId: string;
  readonly requestUuid: string;
  readonly operatorId: string;
  readonly now: Date;
}

export type WorkspaceSharedFenceResult<T> =
  | { readonly disposition: "executed"; readonly value: T }
  | { readonly disposition: "skipped"; readonly state: "blocking" | "erased" };

/** Canonical migration contract consumed by the runtime adapter. */
export const WORKSPACE_PRIVACY_FENCE_POSTGRES_CONTRACT = Object.freeze({
  table: "workspace_privacy_controls",
  lockKeyFunction: "privacy_workspace_lock_key(uuid)",
  blockFunction: "privacy_block_workspace(uuid,uuid,text,timestamptz)",
  erasedFunction: "privacy_mark_workspace_erased(uuid,uuid,text,timestamptz)",
  eraseFunction: "privacy_erase_workspace(uuid,uuid,text)",
  finishFunction: "privacy_finish_request(uuid,uuid,text,text,timestamptz)",
});

export interface WorkspacePrivacyFence {
  withShared<T>(
    workspaceId: string,
    operation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<WorkspaceSharedFenceResult<T>>;
  withExclusiveErasure<T>(
    input: WorkspaceErasureFenceInput,
    externalOperation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<T>;
  withSharedState<T>(
    workspaceId: string,
    operation: (
      state: WorkspacePrivacyState,
      database: WorkspacePrivacyFenceSql,
    ) => Promise<T>,
  ): Promise<T>;
}

/** Identity-role operations that must fence every workspace for one subject atomically. */
export interface WorkspacePrivacyMultiFence {
  withSharedMany<T>(
    workspaceIds: readonly string[],
    operation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<WorkspaceSharedFenceResult<T>>;
}

export class WorkspacePrivacyFenceError extends Error {
  constructor(
    readonly code:
      | "WORKSPACE_PRIVACY_FENCE_INVALID_INPUT"
      | "WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED"
      | "WORKSPACE_PRIVACY_FENCE_INVALID_STATE"
      | "WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "WorkspacePrivacyFenceError";
  }
}

function requireNonBlank(value: string): string {
  if (!value || value !== value.trim() || value.length > 200) {
    throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_INVALID_INPUT");
  }
  return value;
}

function requireDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_INVALID_INPUT");
  }
  return value;
}

function parseState(value: unknown): WorkspacePrivacyState {
  if (value === "active" || value === "blocking" || value === "erased") return value;
  throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_INVALID_STATE");
}

async function rollback(connection: WorkspacePrivacyFenceConnection): Promise<void> {
  await connection.query("rollback").catch(() => undefined);
}

async function beginTenantTransaction(
  connection: WorkspacePrivacyFenceConnection,
  workspaceId: string,
): Promise<void> {
  await connection.query("begin");
  await connection.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
}

async function readControlState(
  connection: WorkspacePrivacyFenceConnection,
  workspaceId: string,
  requestUuid?: string,
): Promise<WorkspacePrivacyState> {
  const row = (await connection.query<{ state: string }>(
    `select state::text as state
       from workspace_privacy_controls
      where workspace_id = $1::uuid
        and ($2::uuid is null or deletion_request_id = $2::uuid)`,
    [workspaceId, requestUuid ?? null],
  )).rows[0];
  // The migration creates an active control row for every workspace. Missing
  // is an invariant violation, treated as blocking-equivalent so no provider
  // or tenant mutation can run while operators investigate the corruption.
  return row ? parseState(row.state) : "blocking";
}

export class PostgresWorkspacePrivacyFence implements WorkspacePrivacyFence, WorkspacePrivacyMultiFence {
  constructor(private readonly pool: WorkspacePrivacyFencePool) {}

  async withShared<T>(
    rawWorkspaceId: string,
    operation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<WorkspaceSharedFenceResult<T>> {
    return this.withSharedState(rawWorkspaceId, async (state, database) => {
      if (state === "active") {
        return { disposition: "executed", value: await operation(database) } as const;
      }
      return { disposition: "skipped", state } as const;
    });
  }

  async withSharedState<T>(
    rawWorkspaceId: string,
    operation: (state: WorkspacePrivacyState, database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<T> {
    const workspaceId = requireNonBlank(rawWorkspaceId);
    let connection: WorkspacePrivacyFenceConnection;
    try {
      connection = await this.pool.connect();
    } catch (error) {
      throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED", { cause: error });
    }
    let locked = false;
    let transaction = false;
    let destroy = false;
    let failure: unknown;
    let outcome: T | undefined;
    let hasOutcome = false;
    try {
      try {
        await connection.query(
          "select pg_advisory_lock_shared(privacy_workspace_lock_key($1::uuid))",
          [workspaceId],
        );
        locked = true;
        await beginTenantTransaction(connection, workspaceId);
        transaction = true;
        const state = await readControlState(connection, workspaceId);
        outcome = await operation(state, connection);
        hasOutcome = true;
        await connection.query("commit");
        transaction = false;
      } catch (error) {
        failure = error;
        if (transaction) {
          await rollback(connection);
          transaction = false;
        }
      }
    } finally {
      if (locked) {
        try {
          const unlocked = (await connection.query<{ unlocked: boolean }>(
            "select pg_advisory_unlock_shared(privacy_workspace_lock_key($1::uuid)) as unlocked",
            [workspaceId],
          )).rows[0]?.unlocked;
          if (unlocked !== true) {
            destroy = true;
            failure = new WorkspacePrivacyFenceError(
              "WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED",
              failure === undefined ? undefined : { cause: failure },
            );
          }
        } catch (error) {
          destroy = true;
          failure = new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED", {
            cause: error,
          });
        }
      } else if (failure !== undefined) {
        destroy = true;
      }
      connection.release(destroy);
    }
    if (failure !== undefined) {
      if (failure instanceof WorkspacePrivacyFenceError) throw failure;
      throw failure;
    }
    if (!hasOutcome) {
      throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED");
    }
    return outcome as T;
  }

  /**
   * Locks a subject's workspaces in stable order on one session. The callback
   * is for identity-role SQL only: there is deliberately no single tenant GUC
   * that could truthfully represent several workspaces.
   */
  async withSharedMany<T>(
    rawWorkspaceIds: readonly string[],
    operation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<WorkspaceSharedFenceResult<T>> {
    const workspaceIds = [...new Set(rawWorkspaceIds.map(requireNonBlank))].sort();
    if (workspaceIds.length === 0) {
      throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_INVALID_INPUT");
    }
    let connection: WorkspacePrivacyFenceConnection;
    try {
      connection = await this.pool.connect();
    } catch (error) {
      throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED", { cause: error });
    }
    const locked: string[] = [];
    let transaction = false;
    let destroy = false;
    let failure: unknown;
    let outcome: WorkspaceSharedFenceResult<T> | undefined;
    try {
      try {
        for (const workspaceId of workspaceIds) {
          await connection.query(
            "select pg_advisory_lock_shared(privacy_workspace_lock_key($1::uuid))",
            [workspaceId],
          );
          locked.push(workspaceId);
        }
        await connection.query("begin");
        transaction = true;
        let blocked: "blocking" | "erased" | undefined;
        for (const workspaceId of workspaceIds) {
          await connection.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
          const state = await readControlState(connection, workspaceId);
          if (state !== "active") blocked ??= state;
        }
        outcome = blocked
          ? { disposition: "skipped", state: blocked }
          : { disposition: "executed", value: await operation(connection) };
        await connection.query("commit");
        transaction = false;
      } catch (error) {
        failure = error;
        if (transaction) {
          await rollback(connection);
          transaction = false;
        }
      }
    } finally {
      for (const workspaceId of locked.reverse()) {
        try {
          const unlocked = (await connection.query<{ unlocked: boolean }>(
            "select pg_advisory_unlock_shared(privacy_workspace_lock_key($1::uuid)) as unlocked",
            [workspaceId],
          )).rows[0]?.unlocked;
          if (unlocked !== true) {
            destroy = true;
            failure = new WorkspacePrivacyFenceError(
              "WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED",
              failure === undefined ? undefined : { cause: failure },
            );
          }
        } catch (error) {
          destroy = true;
          failure = new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED", {
            cause: error,
          });
        }
      }
      if (failure !== undefined && locked.length === 0) destroy = true;
      connection.release(destroy);
    }
    if (failure !== undefined) throw failure;
    if (!outcome) throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED");
    return outcome;
  }

  async withExclusiveErasure<T>(
    input: WorkspaceErasureFenceInput,
    externalOperation: (database: WorkspacePrivacyFenceSql) => Promise<T>,
  ): Promise<T> {
    const workspaceId = requireNonBlank(input.workspaceId);
    const requestUuid = requireNonBlank(input.requestUuid);
    const operatorId = requireNonBlank(input.operatorId);
    const now = requireDate(input.now);
    let connection: WorkspacePrivacyFenceConnection;
    try {
      connection = await this.pool.connect();
    } catch (error) {
      throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED", { cause: error });
    }
    let locked = false;
    let transaction = false;
    let destroy = false;
    let failure: unknown;
    let value: T | undefined;
    let hasValue = false;
    try {
      try {
        // Durable blocking is committed before waiting for active shared jobs.
        await beginTenantTransaction(connection, workspaceId);
        transaction = true;
        const blocked = (await connection.query<{ state: string }>(
          `select privacy_block_workspace(
             $1::uuid, $2::uuid, $3::text, $4::timestamptz
           )::text as state`,
          [workspaceId, requestUuid, operatorId, now],
        )).rows[0];
        if (parseState(blocked?.state) !== "blocking") {
          throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_INVALID_STATE");
        }
        await connection.query("commit");
        transaction = false;

        await connection.query(
          "select pg_advisory_lock(privacy_workspace_lock_key($1::uuid))",
          [workspaceId],
        );
        locked = true;

        // Provider revocation, suppression and versioned S3 purge run only
        // after every previously-started shared side effect has finished.
        const externalDatabase: WorkspacePrivacyFenceSql = {
          query: async <TRow = unknown>(text: string, values?: readonly unknown[]) => {
            await beginTenantTransaction(connection, workspaceId);
            transaction = true;
            try {
              const result = await connection.query<TRow>(text, values);
              await connection.query("commit");
              transaction = false;
              return result;
            } catch (error) {
              await rollback(connection);
              transaction = false;
              throw error;
            }
          },
        };
        value = await externalOperation(externalDatabase);
        hasValue = true;

        // Local erasure, state transition and request completion are one DB
        // commit. A crash rolls all three back and leaves durable `blocking`.
        await beginTenantTransaction(connection, workspaceId);
        transaction = true;
        await connection.query(
          "select privacy_erase_workspace($1::uuid, $2::uuid, $3::text)",
          [workspaceId, requestUuid, operatorId],
        );
        await connection.query(
          `select privacy_record_request_step(
             $1::uuid, $2::uuid, $3::text, 'local.erasure', 'succeeded',
             null, '{}'::jsonb, $4::timestamptz
           )`,
          [workspaceId, requestUuid, operatorId, now],
        );
        const marked = (await connection.query<{ state: string }>(
          `select privacy_mark_workspace_erased(
             $1::uuid, $2::uuid, $3::text, $4::timestamptz
           )::text as state`,
          [workspaceId, requestUuid, operatorId, now],
        )).rows[0];
        if (parseState(marked?.state) !== "erased") {
          throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_INVALID_STATE");
        }
        await connection.query(
          "select privacy_finish_request($1::uuid, $2::uuid, $3::text, 'completed', $4::timestamptz)",
          [workspaceId, requestUuid, operatorId, now],
        );
        await connection.query("commit");
        transaction = false;
      } catch (error) {
        failure = error;
        if (transaction) {
          await rollback(connection);
          transaction = false;
        }
      }
    } finally {
      if (locked) {
        try {
          const unlocked = (await connection.query<{ unlocked: boolean }>(
            "select pg_advisory_unlock(privacy_workspace_lock_key($1::uuid)) as unlocked",
            [workspaceId],
          )).rows[0]?.unlocked;
          if (unlocked !== true) {
            destroy = true;
            failure = new WorkspacePrivacyFenceError(
              "WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED",
              failure === undefined ? undefined : { cause: failure },
            );
          }
        } catch (error) {
          destroy = true;
          failure = new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_UNLOCK_FAILED", {
            cause: error,
          });
        }
      } else if (failure !== undefined) {
        destroy = true;
      }
      connection.release(destroy);
    }
    if (failure !== undefined) throw failure;
    if (!hasValue) {
      throw new WorkspacePrivacyFenceError("WORKSPACE_PRIVACY_FENCE_DATABASE_FAILED");
    }
    return value as T;
  }
}

export interface WorkspacePrivacyWorkerExecutionScope {
  execute<T>(input: {
    readonly workspaceId: string;
    readonly active: () => Promise<T>;
    readonly blocked: (state: "blocking" | "erased") => Promise<T>;
  }): Promise<T>;
}

export function createWorkspacePrivacyWorkerExecutionScope(
  fence: WorkspacePrivacyFence,
): WorkspacePrivacyWorkerExecutionScope {
  return {
    execute(input) {
      return fence.withSharedState(input.workspaceId, (state) =>
        state === "active" ? input.active() : input.blocked(state));
    },
  };
}
