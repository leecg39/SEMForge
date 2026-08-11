// @TASK P1-D1-T1 - Owner-only PostgreSQL migration runner
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { getServerEnv } from "@/lib/env";

async function main(): Promise<void> {
  const env = getServerEnv();
  const connectionString = env.MIGRATION_DATABASE_URL ??
    (env.NODE_ENV === "production" ? undefined : env.DATABASE_URL);
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL이 필요합니다.");

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: env.PGPOOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: env.PGPOOL_IDLE_TIMEOUT_MS,
    statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
    application_name: "semforge-migrator",
    ssl:
      env.PGSSLMODE === "disable"
        ? false
        : env.PGSSLMODE === "verify-full"
          ? { rejectUnauthorized: true }
          : { rejectUnauthorized: false },
  });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
    });
    console.log("[db] PostgreSQL migrations applied");
  } finally {
    await pool.end();
  }
}

void main();
