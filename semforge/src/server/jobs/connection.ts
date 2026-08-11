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
