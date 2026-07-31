import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

/** 실제 마이그레이션이 적용된 임시 SQLite 에서 플랫폼 분포 조회를 검증한다. */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiv-breakdown-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type QueryModule = typeof import("@/server/ai-visibility/platform-breakdown-query");
let detectPlatformCredentials: QueryModule["detectPlatformCredentials"];
let loadPlatformBreakdown: QueryModule["loadPlatformBreakdown"];

type StoreModule = typeof import("@/server/ai-visibility/prompts-store");
let createPrompt: StoreModule["createPrompt"];

const editor: AuthContext = {
  userId: "u1",
  email: "editor@example.com",
  name: "편집자",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro",
  role: "editor",
  sessionId: "s1",
  ip: null,
  userAgent: null,
};

async function insertAnswer(promptId: string, brandMentioned: boolean | null): Promise<void> {
  const { db } = await import("@/db/client");
  const { aiVisibilityAnswers } = await import("@/db/schema");
  await db.insert(aiVisibilityAnswers).values({
    id: `a-${Math.random().toString(36).slice(2)}`,
    promptId,
    platform: "grok",
    model: "test",
    answerText: "본문",
    brandMentioned,
    brandRank: brandMentioned === true ? 1 : null,
    citedUrls: "[]",
    citedDomains: "[]",
    mentionedBrands: "[]",
    source: "test",
    billed: true,
    capturedAt: new Date(),
  });
}

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.prepare("INSERT INTO workspaces (id, name, slug) VALUES ('w1','워크스페이스','ws-one')").run();
  sqlite.close();

  ({ detectPlatformCredentials, loadPlatformBreakdown } = await import(
    "@/server/ai-visibility/platform-breakdown-query"
  ));
  ({ createPrompt } = await import("@/server/ai-visibility/prompts-store"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("자격증명 감지: 연동이 없는 플랫폼은 항상 false 다", () => {
  const creds = detectPlatformCredentials({ TALORDATA_API_TOKEN: "t", XAI_API_KEY: "k" });
  assert.equal(creds.google_aio, true);
  assert.equal(creds.grok, true);
  for (const platform of ["google_ai_mode", "chatgpt", "gemini", "perplexity"] as const) {
    assert.equal(creds[platform], false, `${platform} 은 연동이 없으므로 false 여야 한다`);
  }
});

test("자격증명 감지: TalorData 토큰이 없으면 AI 개요도 미연동이다", () => {
  const creds = detectPlatformCredentials({});
  assert.equal(creds.google_aio, false);
});

test("자격증명 감지: 계정 인증 경로가 기본이면 grok 은 수집 가능으로 본다", () => {
  // XAI_API_KEY 가 없어도 cursor-grok 경로로 로컬 수집이 가능하다.
  assert.equal(detectPlatformCredentials({}).grok, true);
  assert.equal(detectPlatformCredentials({ AI_ANSWER_PROVIDER: "xai" }).grok, false);
  assert.equal(detectPlatformCredentials({ AI_ANSWER_PROVIDER: "xai", XAI_API_KEY: "k" }).grok, true);
});

test("관측이 없으면 수치를 0 이 아니라 관측 없음으로 낸다", async () => {
  const result = await loadPlatformBreakdown(editor);
  assert.equal(result.status, "live");
  const grok = result.data?.platforms.find((item) => item.platform === "grok");
  assert.equal(grok?.dataStatus, "empty");
  assert.equal(grok?.mentionRate, null);
});

test("판정 불가 건은 비율 분모에서 빼고 건수로 노출한다", async () => {
  const prompt = await createPrompt(editor, { domain: "example.com", prompt: "분포 집계 케이스" });
  await insertAnswer(prompt.id, true);
  await insertAnswer(prompt.id, false);
  await insertAnswer(prompt.id, null);

  const result = await loadPlatformBreakdown(editor, "example.com");
  const grok = result.data?.platforms.find((item) => item.platform === "grok");
  assert.equal(grok?.observed, 3);
  assert.equal(grok?.unknownMentionCount, 1);
  // 판정 가능한 2건 중 1건 언급 → 50%
  assert.equal(grok?.mentionRate, 50);
});

test("다른 도메인의 관측은 섞이지 않는다", async () => {
  const other = await createPrompt(editor, { domain: "other.example.com", prompt: "다른 도메인" });
  await insertAnswer(other.id, true);

  const scoped = await loadPlatformBreakdown(editor, "other.example.com");
  const grok = scoped.data?.platforms.find((item) => item.platform === "grok");
  assert.equal(grok?.observed, 1);
});
