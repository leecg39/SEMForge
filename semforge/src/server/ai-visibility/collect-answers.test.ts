import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import type { AiAnswerDraft, AiAnswerProvider } from "@/server/ai-visibility/providers/types";
import { providerError, providerLive } from "@/server/providers/types";

/** 실제 마이그레이션이 적용된 임시 SQLite 에서 답변 수집기를 검증한다. */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiv-collect-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type CollectModule = typeof import("@/server/ai-visibility/collect-answers");
let collectAnswerForPrompt: CollectModule["collectAnswerForPrompt"];
let collectTrackedAnswers: CollectModule["collectTrackedAnswers"];
let ANSWER_TTL_MS: CollectModule["ANSWER_TTL_MS"];

type StoreModule = typeof import("@/server/ai-visibility/prompts-store");
let createPrompt: StoreModule["createPrompt"];
let setPromptTracked: StoreModule["setPromptTracked"];

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
const otherWorkspace: AuthContext = { ...editor, workspaceId: "w2", sessionId: "s-other" };

function draft(overrides: Partial<AiAnswerDraft> = {}): AiAnswerDraft {
  return {
    platform: "grok",
    model: "test-model",
    answerText: "테스트 답변",
    mentionedBrands: ["예시기관"],
    citedDomains: ["example.com"],
    structured: true,
    brandMentioned: true,
    brandRank: 1,
    billed: true,
    source: "test-provider",
    ...overrides,
  };
}

/** 호출 횟수를 세는 가짜 제공자. */
function fakeProvider(result: () => ReturnType<AiAnswerProvider["collect"]>): AiAnswerProvider & {
  calls: number;
} {
  const provider = {
    id: "test-provider",
    platform: "grok" as const,
    source: "test-provider",
    deployable: false,
    calls: 0,
    async collect() {
      provider.calls += 1;
      return result();
    },
  };
  return provider;
}

async function countAnswers(promptId: string): Promise<number> {
  const { db } = await import("@/db/client");
  const { aiVisibilityAnswers } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ id: aiVisibilityAnswers.id })
    .from(aiVisibilityAnswers)
    .where(eq(aiVisibilityAnswers.promptId, promptId));
  return rows.length;
}

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
    .run("w1", "첫 번째", "ws-one", "w2", "두 번째", "ws-two");
  sqlite.close();

  ({ collectAnswerForPrompt, collectTrackedAnswers, ANSWER_TTL_MS } = await import(
    "@/server/ai-visibility/collect-answers"
  ));
  ({ createPrompt, setPromptTracked } = await import("@/server/ai-visibility/prompts-store"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("수집 성공 시 답변을 한 건 적재한다", async () => {
  const prompt = await createPrompt(editor, { domain: "example.com", prompt: "수집 성공 케이스" });
  const provider = fakeProvider(async () => providerLive("test-provider", draft()));

  const result = await collectAnswerForPrompt(editor, prompt.id, { provider });
  assert.equal(result.status, "live");
  assert.equal(await countAnswers(prompt.id), 1);
});

test("수집 실패는 행을 만들지 않는다", async () => {
  // 실패를 빈 행으로 남기면 "관측했으나 언급 없음"으로 오독된다.
  const prompt = await createPrompt(editor, { domain: "example.com", prompt: "수집 실패 케이스" });
  const provider = fakeProvider(async () => providerError("test-provider", "제공자 오류"));

  const result = await collectAnswerForPrompt(editor, prompt.id, { provider });
  assert.equal(result.status, "error");
  assert.equal(await countAnswers(prompt.id), 0);
});

test("TTL 안에서는 다시 호출하지 않고 기존 관측을 재사용한다", async () => {
  // 실과금 호출이므로 같은 프롬프트를 반복 수집하지 않는다.
  const prompt = await createPrompt(editor, { domain: "example.com", prompt: "TTL 케이스" });
  const provider = fakeProvider(async () => providerLive("test-provider", draft()));

  await collectAnswerForPrompt(editor, prompt.id, { provider });
  const second = await collectAnswerForPrompt(editor, prompt.id, { provider });

  assert.equal(provider.calls, 1, "TTL 안에서는 제공자를 다시 부르면 안 된다");
  assert.equal(await countAnswers(prompt.id), 1);
  assert.equal(second.status, "live");
});

test("forceRefresh 는 TTL 을 무시하고 다시 수집한다", async () => {
  const prompt = await createPrompt(editor, { domain: "example.com", prompt: "강제 갱신 케이스" });
  const provider = fakeProvider(async () => providerLive("test-provider", draft()));

  await collectAnswerForPrompt(editor, prompt.id, { provider });
  await collectAnswerForPrompt(editor, prompt.id, { provider, forceRefresh: true });

  assert.equal(provider.calls, 2);
  assert.equal(await countAnswers(prompt.id), 2, "append-only 로 이력이 쌓여야 한다");
});

test("TTL 은 24시간이다", () => {
  assert.equal(ANSWER_TTL_MS, 24 * 60 * 60 * 1000);
});

test("다른 워크스페이스의 프롬프트는 수집할 수 없다", async () => {
  const prompt = await createPrompt(editor, { domain: "example.com", prompt: "격리 케이스" });
  const provider = fakeProvider(async () => providerLive("test-provider", draft()));

  await assert.rejects(
    () => collectAnswerForPrompt(otherWorkspace, prompt.id, { provider }),
    (error) => error instanceof ApiError && error.code === "NOT_FOUND",
  );
  assert.equal(provider.calls, 0, "권한 확인 전에 제공자를 부르면 안 된다");
});

test("일괄 수집은 tracked 프롬프트만 대상으로 한다", async () => {
  const tracked = await createPrompt(editor, { domain: "batch.example.com", prompt: "일괄 대상" });
  await createPrompt(editor, { domain: "batch.example.com", prompt: "일괄 제외 대상" });
  await setPromptTracked(editor, tracked.id, true);

  const provider = fakeProvider(async () => providerLive("test-provider", draft()));
  const results = await collectTrackedAnswers(editor, { provider, domain: "batch.example.com" });

  assert.equal(provider.calls, 1, "tracked=false 프롬프트는 수집하지 않는다");
  assert.equal(results.length, 1);
  assert.equal(results[0].promptId, tracked.id);
});

test("일괄 수집은 한 번에 처리할 개수 상한을 지킨다", async () => {
  const provider = fakeProvider(async () => providerLive("test-provider", draft()));
  for (let index = 0; index < 4; index += 1) {
    const created = await createPrompt(editor, {
      domain: "limit.example.com",
      prompt: `상한 케이스 ${index}`,
    });
    await setPromptTracked(editor, created.id, true);
  }

  const results = await collectTrackedAnswers(editor, {
    provider,
    domain: "limit.example.com",
    maxPrompts: 2,
  });
  assert.equal(results.length, 2);
  assert.equal(provider.calls, 2);
});
