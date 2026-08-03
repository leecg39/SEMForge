import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "home-metrics-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type HomeModule = typeof import("@/server/home");
let getFolderMetricStrips: HomeModule["getFolderMetricStrips"];
let calculateAiVisibility: HomeModule["calculateAiVisibility"];

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

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.exec(
    "INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')",
  );
  sqlite.exec(
    "INSERT INTO folders (id,workspace_id,name,domain) VALUES ('f1','w1','기본','www.example.com'),('f2','w1','미수집','empty.example.com')",
  );
  sqlite.exec(
    "INSERT INTO ai_visibility_queries (id,workspace_id,domain,query,normalized_query) VALUES ('q1','w1','example.com','alpha','alpha'),('q2','w1','example.com','beta','beta'),('q3','w2','example.com','outside','outside'),('q4','w1','example.com','unknown','unknown')",
  );
  const snapshot = sqlite.prepare(
    "INSERT INTO ai_visibility_snapshots (id,query_id,aio_present,cited,captured_at) VALUES (?,?,?,?,?)",
  );
  snapshot.run("s-old", "q1", 1, 0, 1000);
  snapshot.run("s-q1", "q1", 1, 1, 2000);
  snapshot.run("s-q2", "q2", 1, 0, 2000);
  snapshot.run("s-outside", "q3", 1, 1, 3000);
  snapshot.run("s-unknown", "q4", 1, null, 4000);
  sqlite.close();
  ({ getFolderMetricStrips, calculateAiVisibility } =
    await import("@/server/home"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("AI 가시성은 쿼리별 최신 실측 인용 비율로 계산한다", async () => {
  const rows = await getFolderMetricStrips(auth, ["f1", "f2"]);
  const measured = rows.find((row) => row.folderId === "f1");
  const empty = rows.find((row) => row.folderId === "f2");
  assert.equal(measured?.aiVisibility, 50);
  assert.equal(measured?.mentions, 1);
  assert.equal(measured?.aiObserved, 3);
  assert.equal(measured?.aiMeasured, 2);
  assert.equal(measured?.aiUpdatedAt, new Date(4000).toISOString());
  assert.equal(empty?.aiVisibility, null);
  assert.equal(empty?.mentions, 0);
  assert.equal(empty?.aiObserved, 0);
  assert.equal(empty?.aiMeasured, 0);
  assert.equal(empty?.aiUpdatedAt, null);
});

test("AI 가시성 계산은 수집 전 null이며 0~100 비율을 반환한다", () => {
  assert.equal(calculateAiVisibility(0, 0), null);
  assert.equal(calculateAiVisibility(4, 1), 25);
  assert.equal(calculateAiVisibility(3, 2), 67);
  assert.equal(calculateAiVisibility(2, 3), 100);
  assert.equal(calculateAiVisibility(2, -1), 0);
});
