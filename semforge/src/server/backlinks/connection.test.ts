import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { ApiError } from "@/lib/api";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bing-connection-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.APP_SECRET = "test-only-bing-token-encryption-key-material";

let createState: typeof import("@/server/backlinks/connection")["createBingOauthState"];
let consumeState: typeof import("@/server/backlinks/connection")["consumeBingOauthState"];
let saveConnection: typeof import("@/server/backlinks/connection")["saveBingConnection"];

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-1", "One", "one", "free");
  sqlite.prepare("INSERT INTO workspaces (id, name, slug, plan) VALUES (?, ?, ?, ?)").run("workspace-2", "Two", "two", "free");
  sqlite.close();
  ({ createBingOauthState: createState, consumeBingOauthState: consumeState,
    saveBingConnection: saveConnection } = await import("@/server/backlinks/connection"));
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("OAuth state는 워크스페이스 변조·재사용·만료를 거부한다", async () => {
  const now = new Date("2026-08-04T00:00:00Z");
  const state = await createState({ workspaceId: "workspace-1", returnTo: "/analytics/backlinks/overview/", now });
  await assert.rejects(() => consumeState({ rawState: state, workspaceId: "workspace-2", now }),
    (error: unknown) => error instanceof ApiError && error.code === "UNAUTHENTICATED");
  assert.equal((await consumeState({ rawState: state, workspaceId: "workspace-1", now })).returnTo, "/analytics/backlinks/overview/");
  await assert.rejects(() => consumeState({ rawState: state, workspaceId: "workspace-1", now }), ApiError);
  const expired = await createState({ workspaceId: "workspace-1", returnTo: "/", now });
  await assert.rejects(() => consumeState({ rawState: expired, workspaceId: "workspace-1", now: new Date(now.getTime() + 11 * 60_000) }), ApiError);
});

test("Bing 토큰은 데이터베이스에 평문으로 저장하지 않는다", async () => {
  await saveConnection({ workspaceId: "workspace-1", accessToken: "plain-access-token", refreshToken: "plain-refresh-token" });
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  const row = sqlite.prepare("SELECT access_token, refresh_token FROM bing_webmaster_connections WHERE workspace_id = ?").get("workspace-1") as { access_token: string; refresh_token: string };
  sqlite.close();
  assert.notEqual(row.access_token, "plain-access-token");
  assert.notEqual(row.refresh_token, "plain-refresh-token");
});
