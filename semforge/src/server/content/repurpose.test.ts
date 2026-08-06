import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-repurpose-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.CHATMOCK_BASE_URL = "http://chatmock.test:8000/v1";

type BoardsModule = typeof import("@/server/content/boards");
type RunsModule = typeof import("@/server/content/runs");
type RepurposeModule = typeof import("@/server/content/repurpose");
let createContentBoard: BoardsModule["createContentBoard"];
let createContentRun: RunsModule["createContentRun"];
let processContentRunStage: RunsModule["processContentRunStage"];
let collectRepurposeSource: RepurposeModule["collectRepurposeSource"];

const auth = { userId: "u1", email: "editor@example.com", name: "에디터", workspaceId: "w1", workspaceName: "워크스페이스", workspacePlan: "pro" as const, role: "editor" as const, sessionId: "s1", ip: null, userAgent: null };
const outsider = { ...auth, userId: "u2", workspaceId: "w2" };
const originalFetch = globalThis.fetch;
const profile = "chatmock-gpt-5.6-luna-xhigh" as const;

function openDatabase() { return new Database(process.env.DATABASE_PATH!); }

before(async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = openDatabase();
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.prepare("INSERT INTO content_articles (id,workspace_id,title,mode,status,keyword,meta_description,body,word_count,seo_score,created_by,updated_by,version) VALUES ('article-source','w1','원본 검색 가이드','create','draft','검색 성장','원본 설명',?,200,80,'u1','u1',3)").run(`# 원본 검색 가이드\n\n${"검증된 실행 절차와 독자의 질문을 설명하는 원본입니다. ".repeat(20)}`);
  sqlite.close();
  ({ createContentBoard } = await import("@/server/content/boards"));
  ({ createContentRun, processContentRunStage } = await import("@/server/content/runs"));
  ({ collectRepurposeSource } = await import("@/server/content/repurpose"));
});

after(() => { globalThis.fetch = originalFetch; fs.rmSync(tmpDir, { recursive: true, force: true }); });

const articleInput = { keyword: "검색 성장", title: "검색 성장 뉴스레터", audience: "운영자", brandVoice: "친절한 전문가", language: "ko", countryCode: "KR", targetWordCount: 700, aiProfile: profile, sourceType: "article" as const, sourceArticleId: "article-source", sourceText: null, targetFormat: "newsletter" as const };

test("Library 원문 재활용은 원본 버전 스냅샷과 파생 문서 관계를 함께 저장한다", async () => {
  const board = await createContentBoard(auth, { prompt: "기존 가이드를 뉴스레터로 재활용", intent: "repurpose", aiProfile: profile });
  const run = await createContentRun(auth, board.id, { idempotencyKey: "repurpose-library", input: articleInput });
  const sqlite = openDatabase();
  sqlite.prepare("UPDATE content_runs SET stage='research', status='queued' WHERE id=?").run(run.id);
  sqlite.close();
  const researched = await processContentRunStage(auth, run.id);
  const provenance = researched.provenance as { source?: { provider?: string; sourceVersion?: number } };
  assert.equal(provenance.source?.provider, "content_library");
  assert.equal(provenance.source?.sourceVersion, 3);
  globalThis.fetch = async () => {
    const article = { title: "검색 성장 주간 뉴스레터", metaDescription: "검증된 검색 성장 실행 순서를 정리한 운영자 뉴스레터입니다.", markdown: `# 검색 성장 주간 뉴스레터\n\n${"원본의 실행 절차를 뉴스레터 형식으로 명확하게 전달합니다. ".repeat(25)}` };
    return new Response(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(article) })}\n\nevent: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  };
  await processContentRunStage(auth, run.id);
  await processContentRunStage(auth, run.id);
  const completed = await processContentRunStage(auth, run.id);
  assert.equal(completed.status, "completed", JSON.stringify(completed.error));
  const verify = openDatabase();
  const relation = verify.prepare("SELECT source_article_id,derived_article_id,relation_type,source_version,workspace_id FROM content_article_relations WHERE derived_article_id=?").get(completed.articleId) as Record<string, unknown>;
  verify.close();
  assert.deepEqual(relation, { source_article_id: "article-source", derived_article_id: completed.articleId, relation_type: "repurpose", source_version: 3, workspace_id: "w1" });
});

test("직접 입력은 외부 문서 관계를 만들지 않고 다른 워크스페이스 Library 원문은 거부한다", async () => {
  const sourceText = `# 직접 입력\n\n${"직접 입력한 원문의 핵심 사실과 구조를 보존합니다. ".repeat(20)}`;
  const direct = await collectRepurposeSource(auth, { ...articleInput, sourceType: "direct", sourceArticleId: null, sourceText });
  assert.equal(direct.provenance.provider, "direct_input");
  assert.equal(direct.provenance.sourceArticleId, null);
  await assert.rejects(() => collectRepurposeSource(outsider, articleInput), /찾을 수 없습니다/u);
});
