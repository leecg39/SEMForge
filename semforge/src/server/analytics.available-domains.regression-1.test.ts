import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

// Regression: ISSUE-001 — 데이터 보유 도메인이 워크스페이스 경계 없이 노출됨
// Found by /qa on 2026-08-04
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-04.md

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "available-domains-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

const auth = (workspaceId: string): Pick<AuthContext, "workspaceId"> => ({ workspaceId });
let getAvailableDomains: (typeof import("@/server/analytics"))["getAvailableDomains"];

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.exec(
    "INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스 1','w1'),('w2','워크스페이스 2','w2')",
  );
  sqlite.exec(
    "INSERT INTO folders (id,workspace_id,name,domain) VALUES ('f1','w1','내 프로젝트','www.example.com'),('f2','w1','수집 전','empty.example.com'),('f3','w2','외부 프로젝트','outside.test')",
  );
  sqlite.exec(
    "INSERT INTO keyword_metrics (id,keyword,normalized_keyword,country_code,device,period_start,volume,intent,source) VALUES ('k1','검색','검색','US','desktop',0,10,'informational','talordata-serp')",
  );
  const snapshot = sqlite.prepare(
    "INSERT INTO serp_snapshots (id,keyword_metric_id,domain,url,position,captured_at,source) VALUES (?,?,?,?,?,?, 'talordata')",
  );
  snapshot.run("s1", "k1", "www.example.com", "https://www.example.com/", 1, 1000);
  snapshot.run("s2", "k1", "outside.test", "https://outside.test/", 2, 1000);
  sqlite.close();
  ({ getAvailableDomains } = await import("@/server/analytics"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("데이터 보유 도메인은 현재 워크스페이스의 활성 폴더에 속한 항목만 반환한다", async () => {
  assert.deepEqual(await getAvailableDomains(auth("w1")), ["example.com"]);
  assert.deepEqual(await getAvailableDomains(auth("w2")), ["outside.test"]);
});

test("현재 워크스페이스에 폴더가 없으면 다른 워크스페이스 도메인을 반환하지 않는다", async () => {
  assert.deepEqual(await getAvailableDomains(auth("missing")), []);
});
