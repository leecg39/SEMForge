import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

/**
 * PostgreSQL 연결 싱글턴.
 * 코어 제품은 단일 관리형 PostgreSQL 만 사용한다.
 */

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
}

const globalForDb = globalThis as unknown as { __semforgeClonePgPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__semforgeClonePgPool) {
    globalForDb.__semforgeClonePgPool = new Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX ?? "10"),
      ssl:
        process.env.PGSSLMODE === "disable"
          ? undefined
          : process.env.PGSSLMODE
            ? { rejectUnauthorized: false }
            : undefined,
    });
  }
  return globalForDb.__semforgeClonePgPool;
}

export const db = drizzle(getPool(), { schema });
