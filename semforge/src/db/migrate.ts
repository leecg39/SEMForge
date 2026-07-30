import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** `npm run db:migrate` 로 실행. drizzle-kit generate 산출물을 순서대로 적용한다. */

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
// 마이그레이션은 FK 검사를 끄고 실행한다 (drizzle 재생성 마이그레이션의 전제).
// drizzle 가 SQL 안에 넣는 `PRAGMA foreign_keys=OFF` 는 트랜잭션 안에서 no-op 이라,
// 여기서 켜 두면 테이블 재생성 시 참조 테이블의 ON DELETE CASCADE 가 발동해
// 자식 행이 소실될 수 있다 (0013 에서 실제 발생 — serp_snapshots 손실 후 재수집으로 복구).
sqlite.pragma("foreign_keys = OFF");
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });

console.log(`[db] migrations applied → ${dbPath}`);
sqlite.close();
