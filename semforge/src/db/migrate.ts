import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** `npm run db:migrate` 로 실행. drizzle-kit generate 산출물을 순서대로 적용한다. */

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });

console.log(`[db] migrations applied → ${dbPath}`);
sqlite.close();
