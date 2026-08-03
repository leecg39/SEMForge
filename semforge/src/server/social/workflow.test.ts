import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { AuthContext } from "@/lib/session";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-social-"));
process.env.DATABASE_PATH = path.join(temp, "test.db");
const editor: AuthContext = {
  userId: "u-editor",
  email: "editor@test",
  name: "에디터",
  workspaceId: "w1",
  workspaceName: "워크스페이스",
  workspacePlan: "pro",
  role: "editor",
  sessionId: "s1",
  ip: null,
  userAgent: null,
};
const admin: AuthContext = {
  ...editor,
  userId: "u-admin",
  email: "admin@test",
  role: "admin",
};
let projects: typeof import("./projects");
let posts: typeof import("./posts");

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
  sqlite.exec(
    "INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u-editor','editor@test','에디터','x','x'),('u-admin','admin@test','관리자','x','x')",
  );
  sqlite.exec(
    "INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')",
  );
  sqlite.exec(
    "INSERT INTO folders (id,workspace_id,name,domain) VALUES ('f1','w1','Acme','acme.test'),('f2','w2','외부','outside.test')",
  );
  sqlite.close();
  projects = await import("./projects");
  posts = await import("./posts");
  await projects.updateSocialSettings(admin, "f1", {
    timezone: "Asia/Seoul",
    approvalRequired: true,
    syncEnabled: true,
  });
  await projects.upsertSocialProfile(admin, "f1", {
    platform: "google_business_profile",
    externalId: "accounts/a/locations/l",
    displayName: "Acme 강남",
  });
});

after(() => fs.rmSync(temp, { recursive: true, force: true }));

test("편집자 게시물은 승인 설정을 우회하지 않고 관리자가 승인하면 예약된다", async () => {
  const settings = await projects.getSocialSettings(editor, "f1");
  const created = await posts.createSocialPost(editor, "f1", {
    text: "공식 업데이트",
    publishMode: "now",
    profileIds: [settings.profiles[0]!.id],
  });
  assert.equal(created.status, "draft");
  const submitted = await posts.submitSocialPost(editor, created.id);
  assert.equal(submitted.status, "pending_approval");
  await assert.rejects(
    () => posts.approveSocialPost(editor, created.id),
    /관리자 이상/u,
  );
  const approved = await posts.approveSocialPost(admin, created.id);
  assert.equal(approved.status, "queued");
  assert.equal(approved.targets[0]?.status, "queued");
});

test("주간 반복은 첫 시각과 종료일을 검증한다", async () => {
  const settings = await projects.getSocialSettings(editor, "f1");
  await assert.rejects(
    () =>
      posts.createSocialPost(editor, "f1", {
        text: "반복",
        publishMode: "recurring",
        profileIds: [settings.profiles[0]!.id],
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        recurrence: { frequency: "weekly" },
        recurrenceEndAt: new Date().toISOString(),
      }),
    /반복 종료일/u,
  );
});

test("주간 반복 시각은 프로젝트 시간대의 DST 이후에도 같은 현지 시각을 유지한다", async () => {
  const { nextWeeklyOccurrence } = await import("./runs");
  const next = nextWeeklyOccurrence(
    new Date("2026-03-01T14:00:00.000Z"),
    "America/New_York",
  );
  assert.equal(next.toISOString(), "2026-03-08T13:00:00.000Z");
});

test("다른 워크스페이스 fid는 존재를 노출하지 않는다", async () => {
  await assert.rejects(
    () => projects.getSocialSettings(editor, "f2"),
    /프로젝트를 찾을 수 없습니다/u,
  );
});
