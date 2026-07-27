import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

/**
 * SQLite 연결 싱글턴.
 * dev 서버 HMR 에서 파일 핸들이 중복 열리지 않도록 globalThis 에 캐시한다.
 */

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

function createConnection() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // 외래키 제약을 켜야 관계 데이터 삭제 제한이 실제로 동작한다.
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

type DbClient = ReturnType<typeof createConnection>;

const globalForDb = globalThis as unknown as { __semrushCloneDb?: DbClient };

function getConnection(): DbClient {
  if (!globalForDb.__semrushCloneDb) {
    globalForDb.__semrushCloneDb = createConnection();
  }
  return globalForDb.__semrushCloneDb;
}

/**
 * 지연 연결 프록시.
 * 모듈을 import 하는 것만으로는 SQLite 파일을 열지 않는다.
 * next build 가 라우트 모듈을 평가할 때 DB 파일이 없어도 실패하지 않게 하려는 목적이다.
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, property, receiver) {
    const client = getConnection() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { DB_PATH };
