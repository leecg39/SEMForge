import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * 키워드 태그 스키마의 마이그레이션 통합 테스트.
 *
 * 확인할 것 두 가지다.
 * 1. 태그·연결 테이블이 실제로 생성되는가
 * 2. 기존 포지션 추적 경로(캠페인·추적 키워드)가 무손상인가
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-tags-"));
const sqlite = new Database(path.join(tmpDir, "test.db"));

before(() => {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.prepare("INSERT INTO workspaces (id, name, slug) VALUES ('w1', '테스트', 'test-ws')").run();
  sqlite
    .prepare(
      `INSERT INTO position_tracking_campaigns
         (id, workspace_id, name, domain, location, device, search_engine, status)
       VALUES ('camp1', 'w1', '캠페인', 'example.com', 'US', 'desktop', 'google', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO tracked_keywords (id, campaign_id, keyword, created_at, updated_at)
       VALUES ('kw1', 'camp1', '경영컨설팅', ?, ?), ('kw2', 'camp1', '정책자금', ?, ?)`,
    )
    .run(Date.now(), Date.now(), Date.now(), Date.now());
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
  return (
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table) !== undefined
  );
}

function insertTag(id: string, name: string): void {
  sqlite
    .prepare(
      `INSERT INTO position_tracking_tags (id, workspace_id, campaign_id, name, normalized_name, created_at, updated_at)
       VALUES (?, 'w1', 'camp1', ?, ?, ?, ?)`,
    )
    .run(id, name, name.toLowerCase(), Date.now(), Date.now());
}

test("태그와 연결 테이블이 마이그레이션으로 생성된다", () => {
  assert.equal(tableExists("position_tracking_tags"), true);
  assert.equal(tableExists("position_tracking_keyword_tags"), true);
});

test("태그는 워크스페이스·캠페인에 속하고 정규화 이름을 갖는다", () => {
  const columns = columnsOf("position_tracking_tags");
  for (const expected of ["id", "workspace_id", "campaign_id", "name", "normalized_name", "color"]) {
    assert.ok(columns.includes(expected), `${expected} 컬럼이 있어야 한다: ${columns.join(",")}`);
  }
});

test("기존 포지션 추적 경로는 무손상이다", () => {
  assert.equal(tableExists("position_tracking_campaigns"), true);
  assert.equal(tableExists("tracked_keywords"), true);
  const keywordColumns = columnsOf("tracked_keywords");
  for (const expected of ["position", "previous_position", "volume", "difficulty"]) {
    assert.ok(keywordColumns.includes(expected), `${expected} 컬럼이 유지돼야 한다`);
  }
});

test("같은 캠페인에서 태그 이름은 중복될 수 없다", () => {
  insertTag("t-dup-1", "브랜드");
  assert.throws(() => insertTag("t-dup-2", "브랜드"), /UNIQUE|constraint/i);
});

test("키워드 하나에 태그를 여러 개 붙일 수 있다", () => {
  insertTag("t-multi-a", "제품");
  insertTag("t-multi-b", "지역");
  const link = sqlite.prepare(
    `INSERT INTO position_tracking_keyword_tags (id, tag_id, keyword_id, created_at) VALUES (?, ?, ?, ?)`,
  );
  link.run("l1", "t-multi-a", "kw1", Date.now());
  link.run("l2", "t-multi-b", "kw1", Date.now());

  const rows = sqlite
    .prepare(`SELECT tag_id FROM position_tracking_keyword_tags WHERE keyword_id = 'kw1' ORDER BY tag_id`)
    .all() as Array<{ tag_id: string }>;
  assert.deepEqual(
    rows.map((row) => row.tag_id),
    ["t-multi-a", "t-multi-b"],
  );
});

test("같은 키워드에 같은 태그를 두 번 붙일 수 없다", () => {
  insertTag("t-once", "중복방지");
  const link = sqlite.prepare(
    `INSERT INTO position_tracking_keyword_tags (id, tag_id, keyword_id, created_at) VALUES (?, ?, ?, ?)`,
  );
  link.run("l-once-1", "t-once", "kw2", Date.now());
  assert.throws(() => link.run("l-once-2", "t-once", "kw2", Date.now()), /UNIQUE|constraint/i);
});

test("태그를 지우면 연결도 함께 지워진다", () => {
  insertTag("t-cascade", "삭제대상");
  sqlite
    .prepare(
      `INSERT INTO position_tracking_keyword_tags (id, tag_id, keyword_id, created_at) VALUES ('l-cascade', 't-cascade', 'kw2', ?)`,
    )
    .run(Date.now());

  sqlite.prepare(`DELETE FROM position_tracking_tags WHERE id = 't-cascade'`).run();
  const remaining = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM position_tracking_keyword_tags WHERE tag_id = 't-cascade'`)
    .get() as { count: number };
  assert.equal(remaining.count, 0);
});
