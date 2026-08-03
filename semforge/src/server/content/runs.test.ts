import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-runs-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.TALORDATA_API_TOKEN = "test-talordata";
process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";

type RunsModule = typeof import("@/server/content/runs");
let createContentRun: RunsModule["createContentRun"];
let getContentRun: RunsModule["getContentRun"];
let processContentRunStage: RunsModule["processContentRunStage"];
let retryContentRun: RunsModule["retryContentRun"];
let cancelContentRun: RunsModule["cancelContentRun"];

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
const outsider = { ...auth, userId: "u2", workspaceId: "w2" };
const originalFetch = globalThis.fetch;

function openDatabase() {
  return new Database(process.env.DATABASE_PATH!);
}

function insertBoard(id: string) {
  const sqlite = openDatabase();
  sqlite.prepare("INSERT INTO content_boards (id,workspace_id,title,intent,status,created_by,updated_by) VALUES (?, 'w1', ?, 'create', 'active', 'u1', 'u1')").run(id, `작업판 ${id}`);
  sqlite.prepare("INSERT INTO content_messages (id,workspace_id,board_id,role,kind,body,created_by,updated_by) VALUES (?, 'w1', ?, 'user', 'text', '자사몰 SEO 글을 작성해줘', 'u1', 'u1')").run(`msg-${id}`, id);
  sqlite.close();
}

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.close();
  ({ createContentRun, getContentRun, processContentRunStage, retryContentRun, cancelContentRun } = await import("@/server/content/runs"));
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("idempotencyKey 재요청은 같은 실행을 반환하고 워크스페이스를 격리한다", async () => {
  insertBoard("board-idempotent");
  const request = {
    idempotencyKey: "request-idempotent",
    input: {
      keyword: "자사몰 SEO",
      title: null,
      audience: "운영자",
      brandVoice: "전문가",
      language: "ko",
      countryCode: "KR",
      targetWordCount: 1000,
      sourceUrl: null,
      aiProfile: "chatmock-gpt-5.6-luna-xhigh" as const,
    },
  };
  const first = await createContentRun(auth, "board-idempotent", request);
  const second = await createContentRun(auth, "board-idempotent", request);
  assert.equal(second.id, first.id);
  assert.equal(second.reused, true);
  await assert.rejects(() => getContentRun(outsider, first.id), /찾을 수 없습니다/);
});

test("동일 generate stage 동시 호출은 ChatMock을 한 번만 호출한다", async () => {
  insertBoard("board-concurrent");
  const created = await createContentRun(auth, "board-concurrent", {
    idempotencyKey: "request-concurrent",
    input: { keyword: "자사몰 SEO", audience: "운영자", brandVoice: "전문가", language: "ko", countryCode: "KR", targetWordCount: 1000, title: null, sourceUrl: null, aiProfile: "chatmock-gpt-5.6-luna-xhigh" },
  });
  const sqlite = openDatabase();
  const research = { provider: "talordata", keyword: "자사몰 SEO", countryCode: "KR", capturedAt: new Date().toISOString(), fromCache: false, volume: 100, intent: "informational", features: [], results: [{ position: 1, title: "SEO 가이드", description: "설명", link: "https://example.com" }] };
  sqlite.prepare("UPDATE content_runs SET stage='generate', status='queued', provenance_json=? WHERE id=?").run(JSON.stringify({ research }), created.id);
  sqlite.close();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const article = { title: "자사몰 SEO 가이드", metaDescription: "자사몰 SEO를 시작하는 운영자를 위한 구체적인 실전 가이드입니다.", markdown: `# 자사몰 SEO 가이드\n\n${"실제 적용 순서와 체크리스트를 설명합니다. ".repeat(30)}` };
    return new Response(
      `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(article) })}\n\nevent: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  await Promise.all([
    processContentRunStage(auth, created.id),
    processContentRunStage(auth, created.id),
  ]);
  const result = await getContentRun(auth, created.id);
  assert.equal(calls, 1);
  assert.equal(result.stage, "analyze");
  assert.equal(result.status, "running");
});

test("ChatMock 스키마 오류는 실패 상태로 영구 저장되고 같은 단계에서 재시도한다", async () => {
  insertBoard("board-retry");
  const created = await createContentRun(auth, "board-retry", {
    idempotencyKey: "request-retry",
    input: { keyword: "SEO", audience: "운영자", brandVoice: "전문가", language: "ko", countryCode: "KR", targetWordCount: 1000, title: null, sourceUrl: null, aiProfile: "chatmock-gpt-5.6-luna-xhigh" },
  });
  const sqlite = openDatabase();
  sqlite.prepare("UPDATE content_runs SET stage='generate', status='queued', provenance_json=? WHERE id=?").run(JSON.stringify({ research: { provider: "talordata", keyword: "SEO", countryCode: "KR", capturedAt: new Date().toISOString(), fromCache: false, volume: 1, intent: null, features: [], results: [{ position: 1, title: "SEO", description: "", link: "https://example.com" }] } }), created.id);
  sqlite.close();
  globalThis.fetch = async () => Response.json({ output: [{ content: [{ text: "not-json" }] }] });
  const failed = await processContentRunStage(auth, created.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.stage, "generate");
  assert.match(failed.error.message ?? "", /JSON/);
  const retried = await retryContentRun(auth, created.id);
  assert.equal(retried.status, "queued");
  assert.equal(retried.stage, "generate");
});

test("대기 실행 취소는 공급자 호출 없이 취소 상태를 저장한다", async () => {
  insertBoard("board-cancel");
  const created = await createContentRun(auth, "board-cancel", {
    idempotencyKey: "request-cancel",
    input: { keyword: "SEO", audience: "운영자", brandVoice: "전문가", language: "ko", countryCode: "KR", targetWordCount: 1000, title: null, sourceUrl: null, aiProfile: "chatmock-gpt-5.6-luna-xhigh" },
  });
  const cancelled = await cancelContentRun(auth, created.id);
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.cancelledAt);
});
