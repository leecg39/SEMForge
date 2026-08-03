import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-media-due-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type DueModule = typeof import("@/server/content/media-due");
let resolveContentMediaCronAuth: DueModule["resolveContentMediaCronAuth"];

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('viewer','viewer@example.com','뷰어','x','x'),('editor','editor@example.com','편집자','x','x'),('outside','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.exec("INSERT INTO memberships (id,workspace_id,user_id,role) VALUES ('m-viewer','w1','viewer','viewer'),('m-editor','w1','editor','editor'),('m-outside','w2','outside','owner')");
  sqlite.close();
  ({ resolveContentMediaCronAuth } = await import("@/server/content/media-due"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("백그라운드 미디어 작업은 원 생성자가 viewer면 같은 워크스페이스 편집자로 이어간다", async () => {
  const auth = await resolveContentMediaCronAuth("w1", "viewer");
  assert.equal(auth?.userId, "editor");
  assert.equal(auth?.workspaceId, "w1");
  assert.equal(auth?.role, "editor");
});

test("백그라운드 미디어 작업은 다른 워크스페이스 사용자를 폴백으로 선택하지 않는다", async () => {
  assert.equal(await resolveContentMediaCronAuth("missing", "outside"), null);
});
