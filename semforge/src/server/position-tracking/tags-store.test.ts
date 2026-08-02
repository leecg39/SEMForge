import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";

/** 실제 마이그레이션이 적용된 임시 SQLite에서 태그 CRUD와 집계를 검증한다. */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-tags-store-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type StoreModule = typeof import("@/server/position-tracking/tags-store");
let normalizeTagName: StoreModule["normalizeTagName"];
let loadCampaignTagWorkspace: StoreModule["loadCampaignTagWorkspace"];
let createCampaignTag: StoreModule["createCampaignTag"];
let updateCampaignTag: StoreModule["updateCampaignTag"];
let deleteCampaignTag: StoreModule["deleteCampaignTag"];

const editor: AuthContext = {
  userId: "u-editor",
  email: "editor@example.com",
  name: "편집자",
  workspaceId: "w1",
  workspaceName: "첫 번째 워크스페이스",
  workspacePlan: "pro",
  role: "editor",
  sessionId: "s-editor",
  ip: null,
  userAgent: null,
};

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.exec(
    "INSERT INTO workspaces (id, name, slug) VALUES " +
      "('w1','첫 번째','workspace-one'),('w2','두 번째','workspace-two')",
  );
  sqlite.exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain) VALUES " +
      "('c1','w1','첫 캠페인','example.com'),('c2','w2','다른 캠페인','other.example.com')",
  );
  sqlite.exec(
    "INSERT INTO tracked_keywords (id, campaign_id, keyword, position) VALUES " +
      "('k1','c1','브랜드 키워드',1)," +
      "('k2','c1','일반 키워드',10)," +
      "('k3','c1','미노출 키워드',NULL)," +
      "('k-other','c2','다른 워크스페이스 키워드',3)",
  );
  sqlite.close();

  ({
    normalizeTagName,
    loadCampaignTagWorkspace,
    createCampaignTag,
    updateCampaignTag,
    deleteCampaignTag,
  } = await import("@/server/position-tracking/tags-store"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("태그 이름은 앞뒤·연속 공백과 대소문자를 정규화한다", () => {
  assert.equal(normalizeTagName("  Brand\n\t  Keyword  "), "brand keyword");
});

test("태그를 만들고 키워드를 연결하면 실제 순위로 그룹 실적을 집계한다", async () => {
  const created = await createCampaignTag(editor, "c1", {
    name: "핵심 키워드",
    color: "#235FE2",
  });
  const updated = await updateCampaignTag(editor, "c1", {
    tagId: created.tags[0].id,
    keywordIds: ["k1", "k2", "k3"],
  });
  const [tag] = updated.tags;

  assert.equal(tag.keywordCount, 3);
  assert.equal(tag.rankedCount, 2);
  assert.equal(tag.averagePosition, 5.5);
  assert.equal(tag.top3, 1);
  assert.equal(tag.top10, 2);
  assert.equal(tag.top20, 2);
  assert.equal(tag.visibility, 36.2);
  assert.deepEqual(tag.keywordIds, ["k1", "k2", "k3"]);
});

test("정규화 결과가 같은 활성 태그는 중복 오류로 거부한다", async () => {
  await assert.rejects(
    () => createCampaignTag(editor, "c1", { name: "  핵심   키워드  " }),
    (error) =>
      error instanceof ApiError &&
      error.code === "DUPLICATE" &&
      /이미 존재/.test(error.message),
  );
});

test("다른 워크스페이스의 캠페인은 존재를 숨긴다", async () => {
  await assert.rejects(
    () => loadCampaignTagWorkspace(editor, "c2"),
    (error) => error instanceof ApiError && error.code === "NOT_FOUND",
  );
});

test("다른 캠페인의 키워드를 연결하려 하면 기존 연결을 보존하고 거부한다", async () => {
  const beforeState = await loadCampaignTagWorkspace(editor, "c1");
  const tag = beforeState.tags[0];

  await assert.rejects(
    () =>
      updateCampaignTag(editor, "c1", {
        tagId: tag.id,
        keywordIds: ["k-other"],
      }),
    (error) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );

  const afterState = await loadCampaignTagWorkspace(editor, "c1");
  assert.deepEqual(afterState.tags[0].keywordIds, tag.keywordIds);
});

test("조회자는 태그를 변경할 수 없다", async () => {
  const viewer = { ...editor, userId: "u-viewer", role: "viewer" as const };
  await assert.rejects(
    () => createCampaignTag(viewer, "c1", { name: "권한 없음" }),
    (error) => error instanceof ApiError && error.code === "FORBIDDEN",
  );
});

test("태그를 소프트 삭제하면 연결을 지우고 같은 이름을 다시 쓸 수 있다", async () => {
  const beforeState = await loadCampaignTagWorkspace(editor, "c1");
  const tag = beforeState.tags[0];
  const deleted = await deleteCampaignTag(editor, "c1", tag.id);
  assert.equal(deleted.tags.some((row) => row.id === tag.id), false);

  const recreated = await createCampaignTag(editor, "c1", { name: "핵심 키워드" });
  assert.equal(recreated.tags.some((row) => row.name === "핵심 키워드"), true);

  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  const remaining = sqlite
    .prepare("SELECT COUNT(*) AS count FROM position_tracking_keyword_tags WHERE tag_id = ?")
    .get(tag.id) as { count: number };
  sqlite.close();
  assert.equal(remaining.count, 0);
});
