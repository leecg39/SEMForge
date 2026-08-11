// @TASK P3-W1-T1 - Dedicated connection boundary for worker transactions
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/jobs/connection.test.ts

export interface WorkerSqlQueryable {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface WorkerSqlClient extends WorkerSqlQueryable {
  release(): void;
}

export interface WorkerConnectionPool {
  connect(): Promise<WorkerSqlClient>;
}

type WorkerTransactionCallback = <T>(
  operation: (transaction: WorkerSqlQueryable) => Promise<T>,
) => Promise<T>;

export async function withDedicatedWorkerConnection<T>(
  pool: WorkerConnectionPool,
  operation: (client: WorkerSqlClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

// @TASK P3-W1-T1 - Keep every worker state transition on one leased transaction
export async function withWorkerTransaction<T>(
  database: WorkerSqlQueryable,
  operation: (transaction: WorkerSqlQueryable) => Promise<T>,
  workspaceId?: string,
): Promise<T> {
  const connect = (database as Partial<WorkerConnectionPool>).connect;
  if (typeof connect === "function") {
    return withDedicatedWorkerConnection(
      { connect: connect.bind(database) },
      async (client) => {
        await client.query("begin");
        try {
          if (workspaceId) {
            await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
          }
          const result = await operation(client);
          await client.query("commit");
          return result;
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      },
    );
  }

  const transaction = (database as { transaction?: WorkerTransactionCallback }).transaction;
  if (typeof transaction === "function") {
    return transaction.call(database, async (client) => {
      if (workspaceId) {
        await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      }
      return operation(client);
    }) as Promise<T>;
  }

  throw new TypeError("WORKER_TRANSACTION_UNSUPPORTED");
}
