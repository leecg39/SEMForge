// @TASK MIG-0035 - 0032 타임스탬프 역전의 순방향 복구 회귀 테스트
// @SPEC docs/DB_SCHEMA.md#backlink-provider-integration
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
const journal = JSON.parse(
  fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
) as Journal;
const temporaryDirectories: string[] = [];

after(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createMigrationFolderThrough(lastIndex: number): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-migrations-"));
  const metaDirectory = path.join(directory, "meta");
  const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);

  temporaryDirectories.push(directory);
  fs.mkdirSync(metaDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(metaDirectory, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  );
  for (const entry of entries) {
    fs.copyFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(directory, `${entry.tag}.sql`),
    );
  }

  return directory;
}

const expectedTables = [
  "backlink_import_staging",
  "backlink_imported_links",
  "backlink_snapshots",
  "bing_webmaster_connections",
  "bing_webmaster_oauth_states",
];

const expectedIndexes = [
  "backlink_import_staging_workspace_idx",
  "backlink_import_staging_expiry_idx",
  "backlink_imported_links_row_unique",
  "backlink_imported_links_target_idx",
  "backlink_imported_links_domain_idx",
  "backlink_snapshots_scope_date_unique",
  "backlink_snapshots_history_idx",
  "bing_webmaster_connections_workspace_unique",
  "bing_webmaster_connections_site_idx",
  "bing_webmaster_oauth_states_hash_unique",
  "bing_webmaster_oauth_states_expiry_idx",
  "backlink_report_cache_scope_unique",
  "backlink_report_cache_expiry_idx",
  "backlink_report_cache_workspace_idx",
];

function assertBacklinkSchema(sqlite: Database.Database): void {
  const tables = new Set(
    (sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>).map((row) => row.name),
  );
  const indexes = new Set(
    (sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>).map((row) => row.name),
  );

  for (const table of expectedTables) assert.ok(tables.has(table), `missing table: ${table}`);
  for (const index of expectedIndexes) assert.ok(indexes.has(index), `missing index: ${index}`);

  const provider = (sqlite
    .prepare("PRAGMA table_info('backlink_report_caches')")
    .all() as Array<{ name: string; dflt_value: string | null }>).find(
    (column) => column.name === "provider",
  );
  assert.equal(provider?.dflt_value, "'bing-webmaster'");
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
}

function insertWorkspace(sqlite: Database.Database, id: string): void {
  sqlite
    .prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)")
    .run(id, "Migration Test", id, "free");
}

test("fresh DB는 0032 스키마와 bing-webmaster 기본값을 가진다", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  try {
    migrate(drizzle(sqlite), { migrationsFolder });
    assertBacklinkSchema(sqlite);

    insertWorkspace(sqlite, "workspace-fresh");
    sqlite
      .prepare(
        "INSERT INTO backlink_report_caches (id, workspace_id, target, scope) VALUES (?, ?, ?, ?)",
      )
      .run("report-fresh", "workspace-fresh", "https://fresh.example", "site");
    const row = sqlite
      .prepare("SELECT provider FROM backlink_report_caches WHERE id = ?")
      .get("report-fresh") as { provider: string };
    assert.equal(row.provider, "bing-webmaster");
  } finally {
    sqlite.close();
  }
});

test("0031 DB의 0032 누락을 0035가 복구하며 부모와 자식 행을 보존한다", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  try {
    migrate(drizzle(sqlite), { migrationsFolder: createMigrationFolderThrough(31) });
    insertWorkspace(sqlite, "workspace-upgrade");
    sqlite
      .prepare(
        "INSERT INTO backlink_report_caches (id, workspace_id, target, scope, provider) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "report-preserved",
        "workspace-upgrade",
        "https://preserved.example",
        "site",
        "semrush-v4",
      );
    sqlite
      .prepare(
        `INSERT INTO backlink_list_caches
          (id, report_id, dataset, query_hash, query_payload, rows_payload, total, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "list-preserved",
        "report-preserved",
        "links",
        "query-hash",
        "{}",
        '[{"sourceUrl":"https://source.example"}]',
        1,
        1_785_840_000_000,
        1_785_926_400_000,
      );

    migrate(drizzle(sqlite), { migrationsFolder });

    const appliedAt = new Set(
      (sqlite
        .prepare("SELECT created_at FROM __drizzle_migrations")
        .all() as Array<{ created_at: number }>).map((row) => Number(row.created_at)),
    );
    const skipped0032 = journal.entries.find((entry) => entry.idx === 32);
    const repair0035 = journal.entries.find((entry) => entry.idx === 35);
    assert.ok(skipped0032);
    assert.ok(repair0035);
    assert.equal(appliedAt.has(skipped0032.when), false);
    assert.equal(appliedAt.has(repair0035.when), true);

    assertBacklinkSchema(sqlite);
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, provider FROM backlink_report_caches WHERE id = ?")
        .get("report-preserved"),
      { id: "report-preserved", provider: "semrush-v4" },
    );
    assert.deepEqual(
      sqlite
        .prepare("SELECT id, report_id, total FROM backlink_list_caches WHERE id = ?")
        .get("list-preserved"),
      { id: "list-preserved", report_id: "report-preserved", total: 1 },
    );

    sqlite
      .prepare(
        "INSERT INTO backlink_report_caches (id, workspace_id, target, scope) VALUES (?, ?, ?, ?)",
      )
      .run("report-default", "workspace-upgrade", "https://default.example", "site");
    const inserted = sqlite
      .prepare("SELECT provider FROM backlink_report_caches WHERE id = ?")
      .get("report-default") as { provider: string };
    assert.equal(inserted.provider, "bing-webmaster");
  } finally {
    sqlite.close();
  }
});
