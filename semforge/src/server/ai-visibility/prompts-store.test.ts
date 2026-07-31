import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";

/** 실제 마이그레이션이 적용된 임시 SQLite 에서 프롬프트 저장소를 검증한다. */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiv-prompts-store-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type StoreModule = typeof import("@/server/ai-visibility/prompts-store");
let normalizePrompt: StoreModule["normalizePrompt"];
let listPrompts: StoreModule["listPrompts"];
let createPrompt: StoreModule["createPrompt"];
let setPromptTracked: StoreModule["setPromptTracked"];
let softDeletePrompt: StoreModule["softDeletePrompt"];

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
  sqlite
    .prepare("INSERT INTO workspaces (id, name, slug) VALUES (?, ?, ?), (?, ?, ?)")
    .run("w1", "첫 번째 워크스페이스", "workspace-one", "w2", "두 번째 워크스페이스", "workspace-two");
  sqlite.close();

  ({ normalizePrompt, listPrompts, createPrompt, setPromptTracked, softDeletePrompt } =
    await import("@/server/ai-visibility/prompts-store"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("프롬프트는 소문자화하고 연속 공백과 앞뒤 공백을 정리한다", () => {
  assert.equal(normalizePrompt("  SEMForge\n\t추천   기준  "), "semforge 추천 기준");
});

test("정규화 결과가 같은 활성 프롬프트는 중복 오류로 거부한다", async () => {
  await createPrompt(editor, {
    domain: "https://WWW.Duplicate.Example.com/path",
    prompt: "  최고의 SEO 도구는?  ",
  });

  await assert.rejects(
    () =>
      createPrompt(editor, {
        domain: "duplicate.example.com",
        prompt: "최고의   seo 도구는?",
      }),
    (error) =>
      error instanceof ApiError &&
      error.code === "DUPLICATE" &&
      /이미 등록된 프롬프트/.test(error.message),
  );
});

test("목록은 현재 워크스페이스의 활성 프롬프트만 반환한다", async () => {
  const otherWorkspace = { ...editor, workspaceId: "w2", workspaceName: "두 번째 워크스페이스" };
  await createPrompt(editor, { domain: "isolated.example.com", prompt: "우리 워크스페이스 질문" });
  await createPrompt(otherWorkspace, {
    domain: "isolated.example.com",
    prompt: "다른 워크스페이스 질문",
  });

  const rows = await listPrompts(editor, "isolated.example.com");
  assert.deepEqual(rows.map((row) => row.prompt), ["우리 워크스페이스 질문"]);
});

test("소프트 삭제한 프롬프트는 목록에서 제외한다", async () => {
  const created = await createPrompt(editor, {
    domain: "deleted.example.com",
    prompt: "삭제할 질문",
  });

  await softDeletePrompt(editor, created.id);

  assert.deepEqual(await listPrompts(editor, "deleted.example.com"), []);
});

test("편집자는 활성 프롬프트의 tracked 값을 변경할 수 있다", async () => {
  const created = await createPrompt(editor, {
    domain: "tracked.example.com",
    prompt: "추적할 질문",
  });

  const updated = await setPromptTracked(editor, created.id, true);

  assert.equal(updated.tracked, true);
  const [listed] = await listPrompts(editor, "tracked.example.com");
  assert.equal(listed.tracked, true);
});

test("조회자는 실과금 수집 대상 여부를 변경할 수 없다", async () => {
  const created = await createPrompt(editor, {
    domain: "permission.example.com",
    prompt: "권한을 확인할 질문",
  });
  const viewer = { ...editor, userId: "u-viewer", role: "viewer" as const };

  await assert.rejects(
    () => setPromptTracked(viewer, created.id, true),
    (error) => error instanceof ApiError && error.code === "FORBIDDEN" && /권한/.test(error.message),
  );
  const [unchanged] = await listPrompts(editor, "permission.example.com");
  assert.equal(unchanged.tracked, false);
});
