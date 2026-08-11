// @TASK P3-C2-T1 - Pool-safe connection pinning for tenant transactions
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/database.contract.test.ts
import type { SqlQueryable } from "@/server/gsc/store";

export interface ReleasableSqlQueryable extends SqlQueryable {
  release(): void;
}

export type GscSqlSource = SqlQueryable & {
  connect?: () => Promise<ReleasableSqlQueryable>;
};

function isConnectable(
  source: GscSqlSource,
): source is GscSqlSource & { connect: () => Promise<ReleasableSqlQueryable> } {
  return typeof source.connect === "function";
}

/** Pin all nested BEGIN/SET LOCAL/queries to one physical pg connection. */
export async function withGscSqlClient<T>(
  source: GscSqlSource,
  operation: (client: SqlQueryable) => Promise<T>,
): Promise<T> {
  if (!isConnectable(source)) return operation(source);
  const client = await source.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

export async function withGscWorkspaceTransaction<T>(
  source: GscSqlSource,
  workspaceId: string,
  operation: (client: SqlQueryable) => Promise<T>,
): Promise<T> {
  return withGscSqlClient(source, async (client) => {
    await client.query("begin");
    try {
      await client.query("select set_config('app.workspace_id', $1, true)", [workspaceId]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  });
}
