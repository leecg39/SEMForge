import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * AI 가시성 프롬프트·답변 스키마의 마이그레이션 통합 테스트.
 *
 * 확인할 것 두 가지다.
 * 1. 프롬프트/답변 테이블이 마이그레이션으로 실제 생성되는가
 * 2. 기존 AIO 경로(ai_visibility_queries/_snapshots)가 무손상인가
 *
 * better-sqlite3 는 DATABASE_PATH 를 읽지 않으므로 임시 파일에 직접 붙인다.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiv-schema-"));
const sqlite = new Database(path.join(tmpDir, "test.db"));

before(() => {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  // 프롬프트가 워크스페이스를 참조하므로 픽스처를 먼저 만든다.
  sqlite
    .prepare(`INSERT INTO workspaces (id, name, slug) VALUES ('w1', '테스트 워크스페이스', 'test-ws')`)
    .run();
});

after(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function columnsOf(table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function tableExists(table: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row !== undefined;
}

/** 프롬프트 1건을 넣고 id 를 돌려준다. */
function insertPrompt(id: string): string {
  sqlite
    .prepare(
      `INSERT INTO ai_visibility_prompts
         (id, workspace_id, domain, prompt, normalized_prompt, country_code, locale, tracked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'KR', 'ko', 1, ?, ?)`
    )
    // 유니크 인덱스가 (워크스페이스·도메인·정규화프롬프트·국가·로케일) 이므로 id 별로 다르게 만든다.
    .run(id, "w1", "example.com", `경영컨설팅 추천 ${id}`, `경영컨설팅 추천 ${id}`, Date.now(), Date.now());
  return id;
}

test("프롬프트·답변 테이블이 마이그레이션으로 생성된다", () => {
  assert.equal(tableExists("ai_visibility_prompts"), true);
  assert.equal(tableExists("ai_visibility_answers"), true);
});

test("프롬프트 테이블은 주제·의도·추적여부를 담는다", () => {
  const columns = columnsOf("ai_visibility_prompts");
  for (const expected of [
    "id",
    "workspace_id",
    "domain",
    "prompt",
    "normalized_prompt",
    "topic",
    "intent",
    "country_code",
    "locale",
    "tracked",
  ]) {
    assert.ok(columns.includes(expected), `${expected} 컬럼이 있어야 한다: ${columns.join(",")}`);
  }
});

test("답변 테이블은 본문·브랜드 언급·인용 소스·과금 여부를 담는다", () => {
  const columns = columnsOf("ai_visibility_answers");
  for (const expected of [
    "id",
    "prompt_id",
    "platform",
    "model",
    "answer_text",
    "brand_mentioned",
    "brand_rank",
    "cited_urls",
    "cited_domains",
    "mentioned_brands",
    "source",
    "billed",
    "captured_at",
  ]) {
    assert.ok(columns.includes(expected), `${expected} 컬럼이 있어야 한다: ${columns.join(",")}`);
  }
});

test("기존 AIO 경로는 무손상이다", () => {
  // 프롬프트 모델을 추가하면서 기존 수집 경로를 깨뜨리면 안 된다.
  assert.equal(tableExists("ai_visibility_queries"), true);
  assert.equal(tableExists("ai_visibility_snapshots"), true);
  const snapshotColumns = columnsOf("ai_visibility_snapshots");
  for (const expected of ["aio_present", "cited", "cited_url", "cited_domains", "source"]) {
    assert.ok(snapshotColumns.includes(expected), `${expected} 컬럼이 유지돼야 한다`);
  }
});

test("한 프롬프트에 여러 플랫폼 답변을 append-only 로 쌓을 수 있다", () => {
  const promptId = insertPrompt("p-multi");
  const insert = sqlite.prepare(
    `INSERT INTO ai_visibility_answers
       (id, prompt_id, platform, model, answer_text, brand_mentioned, cited_urls, cited_domains, mentioned_brands, source, billed, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '[]', ?, ?, ?)`
  );
  insert.run("a1", promptId, "google_aio", null, null, 1, "talordata", 0, Date.now());
  insert.run("a2", promptId, "grok", "grok-4.5", "답변 본문", 0, "xai", 1, Date.now());

  const rows = sqlite
    .prepare(`SELECT platform, source, billed FROM ai_visibility_answers WHERE prompt_id = ? ORDER BY id`)
    .all(promptId) as Array<{ platform: string; source: string; billed: number }>;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.platform),
    ["google_aio", "grok"]
  );
  // 캐시 히트와 실과금 호출을 구분할 수 있어야 비용 추적이 된다.
  assert.equal(rows[1].billed, 1);
});

test("프롬프트를 지우면 답변도 함께 지워진다", () => {
  const promptId = insertPrompt("p-cascade");
  sqlite
    .prepare(
      `INSERT INTO ai_visibility_answers
         (id, prompt_id, platform, cited_urls, cited_domains, mentioned_brands, source, billed, captured_at)
       VALUES ('a-cascade', ?, 'grok', '[]', '[]', '[]', 'xai', 1, ?)`
    )
    .run(promptId, Date.now());

  sqlite.prepare(`DELETE FROM ai_visibility_prompts WHERE id = ?`).run(promptId);
  const remaining = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM ai_visibility_answers WHERE prompt_id = ?`)
    .get(promptId) as { count: number };
  assert.equal(remaining.count, 0);
});
