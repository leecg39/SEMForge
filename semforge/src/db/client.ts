// @TASK P1-D1-T1 - Role-separated PostgreSQL pools and transaction-local tenant context
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "@/db/schema";
import { getServerEnv, type ServerEnv } from "@/lib/env";

// @TASK P1-D3 - Dedicated pre-tenant auth and operator runtime roles
export type DatabaseRole =
  | "web"
  | "auth"
  | "operator"
  | "dispatcher"
  | "scheduler"
  | "worker"
  | "billing"
  | "privacy";
export type SemforgeDatabase = NodePgDatabase<typeof schema>;

const globalPools = globalThis as unknown as {
  __semforgePgPools?: Partial<Record<DatabaseRole, Pool>>;
};

function sslConfig(env: ServerEnv): PoolConfig["ssl"] {
  if (env.PGSSLMODE === "disable") return false;
  if (env.PGSSLMODE === "verify-full") return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

export function resolveDatabaseUrl(role: DatabaseRole, env: ServerEnv): string {
  const key = {
    web: "DATABASE_URL",
    auth: "AUTH_DATABASE_URL",
    operator: "OPERATOR_DATABASE_URL",
    dispatcher: "DISPATCHER_DATABASE_URL",
    scheduler: "SCHEDULER_DATABASE_URL",
    worker: "WORKER_DATABASE_URL",
    billing: "BILLING_DATABASE_URL",
    privacy: "PRIVACY_DATABASE_URL",
  } as const satisfies Record<DatabaseRole, keyof ServerEnv>;
  const envKey = key[role];
  const value = env[envKey];
  if (typeof value !== "string" || !value) throw new Error(`${envKey}이 필요합니다.`);
  return value;
}

export function getPool(role: DatabaseRole = "web"): Pool {
  const pools = (globalPools.__semforgePgPools ??= {});
  if (pools[role]) return pools[role]!;

  const env = getServerEnv();
  pools[role] = new Pool({
    connectionString: resolveDatabaseUrl(role, env),
    max: env.PGPOOL_MAX,
    connectionTimeoutMillis: env.PGPOOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: env.PGPOOL_IDLE_TIMEOUT_MS,
    statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
    application_name: `semforge-${role}`,
    ssl: sslConfig(env),
  });
  return pools[role]!;
}

export function getDatabase(role: DatabaseRole = "web"): SemforgeDatabase {
  return drizzle(getPool(role), { schema });
}

export async function withWorkspace<T>(
  workspaceId: string,
  operation: (transaction: SemforgeDatabase) => Promise<T>,
): Promise<T> {
  return getDatabase("web").transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return operation(transaction as SemforgeDatabase);
  });
}
