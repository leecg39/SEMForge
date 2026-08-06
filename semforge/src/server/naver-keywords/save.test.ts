import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "naver-keyword-save-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let saveNaverKeywordsToList: typeof import("@/server/naver-keywords/save")["saveNaverKeywordsToList"];

const auth: AuthContext = {
  userId: "user-1",
  email: "owner@example.com",
  name: "Owner",
  workspaceId: "workspace-1",
  workspaceName: "Workspace",
  workspacePlan: "business",
  role: "owner",
  sessionId: "session-1",
  ip: null,
  userAgent: null,
};

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.prepare("INSERT INTO workspaces (id,name,slug,plan) VALUES (?,?,?,?)")
    .run("workspace-1", "Workspace", "workspace", "business");
  sqlite.prepare("INSERT INTO workspaces (id,name,slug,plan) VALUES (?,?,?,?)")
    .run("workspace-2", "Other", "other", "business");
  sqlite.prepare("INSERT INTO keyword_lists (id,workspace_id,name,mode,database,status) VALUES (?,?,?,?,?,?)")
    .run("list-1", "workspace-1", "내 목록", "manual", "KR", "ready");
  sqlite.prepare("INSERT INTO keyword_lists (id,workspace_id,name,mode,database,status) VALUES (?,?,?,?,?,?)")
    .run("list-2", "workspace-2", "타사 목록", "manual", "KR", "ready");
  sqlite.close();
  ({ saveNaverKeywordsToList } = await import("@/server/naver-keywords/save"));
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("선택 키워드를 정규화·중복 제거하고 NAVER provenance와 함께 저장한다", async () => {
  const result = await saveNaverKeywordsToList(auth, {
    listId: "list-1",
    items: [
      { keyword: " 네이버\u3000광고 ", snapshotId: "snap-1", volume: 120, intent: "commercial" },
      { keyword: "네이버 광고", snapshotId: "snap-1", volume: 120, intent: "commercial" },
      { keyword: "검색광고 비용", volume: 80 },
    ],
  });
  assert.deepEqual(result, { saved: 2, skipped: 1 });

  const { db } = await import("@/db/client");
  const { keywordListItems } = await import("@/db/schema");
  const rows = await db.select().from(keywordListItems);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.provider === "naver-search-ads"));
  assert.ok(rows.every((row) => row.measurement === "absolute"));
  assert.equal(rows.find((row) => row.keyword === "네이버 광고")?.sourceSnapshotId, "snap-1");

  const repeated = await saveNaverKeywordsToList(auth, {
    listId: "list-1",
    items: [{ keyword: "네이버 광고" }, { keyword: "검색광고 비용" }],
  });
  assert.deepEqual(repeated, { saved: 0, skipped: 2 });
});

test("다른 워크스페이스의 목록은 존재 여부를 노출하지 않는다", async () => {
  await assert.rejects(
    () => saveNaverKeywordsToList(auth, {
      listId: "list-2",
      items: [{ keyword: "격리 테스트" }],
    }),
    /찾을 수 없습니다/,
  );
});
