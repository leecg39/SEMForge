import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * 키워드 태그 일괄 편집 테스트 — 정규화·중복 제거·소유권 강제를 검증한다.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-tags-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type TagsModule = typeof import("@/server/position-tracking/tags");
let updateKeywordTags: TagsModule["updateKeywordTags"];

const auth = {
  userId: "u1",
  email: "editor@example.com",
  name: "에디터",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro" as const,
  role: "editor" as const,
  sessionId: "s1",
  ip: null,
  userAgent: null,
};

function openDb() {
  // 동적 require 로 모듈 캐시를 공유한다 (테스트 전용).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  return new Database(process.env.DATABASE_PATH!);
}

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = openDb();
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.exec("INSERT INTO workspaces (id, name, slug) VALUES ('w1','테스트','test-ws')");
  sqlite.exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain) VALUES ('c1','w1','테스트','example.com')"
  );
  sqlite.exec(
    "INSERT INTO tracked_keywords (id, campaign_id, keyword, tags) VALUES " +
      "('k1','c1','alpha','[]'),('k2','c1','beta','[\"m&a\"]')"
  );
  sqlite.close();

  ({ updateKeywordTags } = await import("@/server/position-tracking/tags"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readTags(id: string): string[] {
  const sqlite = openDb();
  const row = sqlite.prepare("SELECT tags FROM tracked_keywords WHERE id = ?").get(id) as {
    tags: string;
  };
  sqlite.close();
  return JSON.parse(row.tags) as string[];
}

test("태그 추가는 정규화(공백·대소문자)와 중복 제거를 거쳐 저장된다", async () => {
  const result = await updateKeywordTags(auth, "c1", {
    keywordIds: ["k1", "k2"],
    add: ["  Brand  Core ", "m&a", "M&A"],
    remove: [],
  });
  // k2 는 m&a 를 이미 갖고 있어 brand core 만 추가된다.
  assert.equal(result.updated, 2);
  assert.deepEqual(readTags("k1").sort(), ["brand core", "m&a"]);
  assert.deepEqual(readTags("k2").sort(), ["brand core", "m&a"]);
});

test("태그 제거는 지정한 태그만 지운다", async () => {
  const result = await updateKeywordTags(auth, "c1", {
    keywordIds: ["k1"],
    add: [],
    remove: ["M&A"],
  });
  assert.equal(result.updated, 1);
  assert.deepEqual(readTags("k1"), ["brand core"]);
  // 다른 키워드는 그대로다.
  assert.ok(readTags("k2").includes("m&a"));
});

test("다른 워크스페이스의 캠페인은 404 를 던진다", async () => {
  const outsider = { ...auth, workspaceId: "w-other" };
  await assert.rejects(
    () => updateKeywordTags(outsider, "c1", { keywordIds: ["k1"], add: ["x"], remove: [] }),
    /찾을 수 없습니다/
  );
});
