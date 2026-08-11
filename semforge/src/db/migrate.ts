import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/** `npm run db:migrate` 로 실행. PostgreSQL 마이그레이션을 순서대로 적용한다. */

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
}

const pool = new Pool({
  connectionString,
  max: Number(process.env.PGPOOL_MAX ?? "1"),
  ssl:
    process.env.PGSSLMODE === "disable"
      ? undefined
      : process.env.PGSSLMODE
        ? { rejectUnauthorized: false }
        : undefined,
});

const db = drizzle(pool);

await migrate(db, { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });

console.log("[db] migrations applied");
await pool.end();
