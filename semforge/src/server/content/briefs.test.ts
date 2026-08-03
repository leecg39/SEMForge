import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-briefs-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";

type BoardsModule = typeof import("@/server/content/boards");
type RunsModule = typeof import("@/server/content/runs");
let createContentBoard: BoardsModule["createContentBoard"];
let createContentRun: RunsModule["createContentRun"];
let processContentRunStage: RunsModule["processContentRunStage"];

const auth = { userId: "u1", email: "editor@example.com", name: "에디터", workspaceId: "w1", workspaceName: "워크스페이스", workspacePlan: "pro" as const, role: "editor" as const, sessionId: "s1", ip: null, userAgent: null };
const outsider = { ...auth, userId: "u2", workspaceId: "w2" };
const profile = "chatmock-gpt-5.6-luna-xhigh" as const;
const originalFetch = globalThis.fetch;

function openDatabase() { return new Database(process.env.DATABASE_PATH!); }

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = openDatabase();
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.prepare("INSERT INTO content_articles (id,workspace_id,title,mode,status,keyword,meta_description,body,word_count,seo_score,created_by,updated_by) VALUES ('brief-1','w1','검색 성장 브리프','brief','draft','검색 성장','검색 성장 기획','## 고유 브리프 문맥\n\n독자의 실제 질문을 먼저 설명하고 실행 순서를 구조화합니다.',20,70,'u1','u1')").run();
  sqlite.close();
  ({ createContentBoard } = await import("@/server/content/boards"));
  ({ createContentRun, processContentRunStage } = await import("@/server/content/runs"));
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const requirements = { keyword: "검색 성장", title: null, audience: "운영자", brandVoice: "전문가", language: "ko", countryCode: "KR", targetWordCount: 1000, sourceUrl: null, aiProfile: profile };

test("브리프에서 만든 기사 작업판은 sourceArticleId를 보존하고 워크스페이스를 격리한다", async () => {
  const board = await createContentBoard(auth, { prompt: "브리프를 기사로 작성해 줘", intent: "create", aiProfile: profile, sourceArticleId: "brief-1" });
  const payload = board.messages[0]?.payload as { sourceArticleId?: string; sourceArticleVersion?: number };
  assert.equal(payload.sourceArticleId, "brief-1");
  assert.equal(payload.sourceArticleVersion, 1);
  await assert.rejects(() => createContentBoard(outsider, { prompt: "외부 브리프 사용", intent: "create", aiProfile: profile, sourceArticleId: "brief-1" }), /찾을 수 없습니다/u);
});

test("기사 생성 프롬프트는 저장된 SEO 브리프 본문을 신뢰하지 않는 문맥으로 연결한다", async () => {
  const board = await createContentBoard(auth, { prompt: "브리프 문맥으로 기사 작성", intent: "create", aiProfile: profile, sourceArticleId: "brief-1" });
  const run = await createContentRun(auth, board.id, { idempotencyKey: "brief-context-run", input: { ...requirements, sourceArticleId: "brief-1" } });
  const sqlite = openDatabase();
  const research = { provider: "talordata", keyword: "검색 성장", countryCode: "KR", capturedAt: new Date().toISOString(), fromCache: false, volume: 10, intent: "informational", features: [], results: [{ position: 1, title: "검색 성장", description: "실행 가이드", link: "https://example.com" }] };
  const sourceDocument = { title: "검색 성장 브리프", metaDescription: "검색 성장 기획", markdown: "## 고유 브리프 문맥\n\n독자의 실제 질문을 먼저 설명하고 실행 순서를 구조화합니다." };
  sqlite.prepare("UPDATE content_runs SET stage='generate', status='queued', provenance_json=?, output_json=? WHERE id=?").run(JSON.stringify({ research, source: { provider: "content_library", capturedAt: new Date().toISOString(), sourceArticleId: "brief-1", sourceVersion: 1, characterCount: sourceDocument.markdown.length } }), JSON.stringify({ sourceDocument }), run.id);
  sqlite.close();
  let linked = false;
  globalThis.fetch = async (_input, init) => {
    linked = String(init?.body).includes("고유 브리프 문맥") && String(init?.body).includes("SOURCE_BRIEF");
    const article = { title: "검색 성장 실행 가이드", metaDescription: "검색 성장을 실행하는 운영자를 위한 단계별 가이드입니다.", markdown: `# 검색 성장 실행 가이드\n\n${"브리프의 질문과 실행 순서를 근거로 구체적인 방법을 설명합니다. ".repeat(25)}` };
    return new Response(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(article) })}\n\nevent: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  };
  const processed = await processContentRunStage(auth, run.id);
  assert.equal(linked, true);
  assert.equal(processed.stage, "analyze");
});

test("Topic Finder용 brief 작업판은 동일 실행 계약으로 queued run을 만든다", async () => {
  const board = await createContentBoard(auth, { prompt: "검색 성장 주제를 조사해 줘", intent: "brief", aiProfile: profile });
  const run = await createContentRun(auth, board.id, { idempotencyKey: "topic-brief-run", input: requirements });
  assert.equal(run.intent, "brief");
  assert.equal(run.status, "queued");
});
