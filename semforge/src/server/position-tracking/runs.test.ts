import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-runs-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.TALORDATA_API_TOKEN = "test-token";

type RunsModule = typeof import("@/server/position-tracking/runs");
let setupPositionTracking: RunsModule["setupPositionTracking"];
let getPositionTrackingRun: RunsModule["getPositionTrackingRun"];
let processNextPositionTrackingItem: RunsModule["processNextPositionTrackingItem"];
let cancelPositionTrackingRun: RunsModule["cancelPositionTrackingRun"];
let createPositionTrackingRun: RunsModule["createPositionTrackingRun"];
let retryFailedPositionTrackingItems: RunsModule["retryFailedPositionTrackingItems"];

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
const previousFetch = globalThis.fetch;

before(async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DATABASE_PATH!);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  sqlite.exec("INSERT INTO users (id,email,name,password_hash,password_salt) VALUES ('u1','editor@example.com','에디터','x','x'),('u2','outside@example.com','외부','x','x')");
  sqlite.exec("INSERT INTO workspaces (id,name,slug) VALUES ('w1','워크스페이스','w1'),('w2','외부','w2')");
  sqlite.close();
  ({
    setupPositionTracking,
    getPositionTrackingRun,
    processNextPositionTrackingItem,
    cancelPositionTrackingRun,
    createPositionTrackingRun,
    retryFailedPositionTrackingItems,
  } = await import("@/server/position-tracking/runs"));
});

after(() => {
  globalThis.fetch = previousFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("설정 전체를 한 트랜잭션으로 만들고 idempotencyKey 재요청은 같은 실행을 반환한다", async () => {
  const input = {
    domain: "example.com",
    target: { type: "subdomain" as const, value: "www.example.com" },
    searchEngine: "google" as const,
    device: "desktop" as const,
    locationKey: "US-NEW-YORK",
    keywords: [
      { keyword: "first keyword", tags: ["core"] },
      { keyword: "second keyword", tags: [] },
    ],
    weeklyDigestEnabled: true,
    idempotencyKey: "setup-1",
  };
  const created = await setupPositionTracking(auth, input);
  const repeated = await setupPositionTracking(auth, input);
  assert.equal(created.total, 2);
  assert.equal(repeated.campaignId, created.campaignId);
  assert.equal(repeated.runId, created.runId);
  assert.equal(repeated.reused, true);
});

test("동시 process 요청은 서로 다른 대기 항목을 원자적으로 점유한다", async () => {
  const created = await setupPositionTracking(auth, {
    domain: "concurrent.example.com",
    target: { type: "root_domain", value: "example.com" },
    searchEngine: "google",
    device: "desktop",
    locationKey: "US-NEW-YORK",
    keywords: [
      { keyword: "alpha", tags: [] },
      { keyword: "beta", tags: [] },
    ],
    weeklyDigestEnabled: false,
    idempotencyKey: "setup-concurrent",
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({
      code: 0,
      data: {
        search_metadata: { id: `request-${calls}`, status: "Success" },
        organic: [{ title: "Target", link: "https://www.example.com/page" }],
      },
    });
  };
  await Promise.all([
    processNextPositionTrackingItem(auth, created.runId),
    processNextPositionTrackingItem(auth, created.runId),
  ]);
  const view = await getPositionTrackingRun(auth, created.runId);
  assert.equal(calls, 2);
  assert.equal(view.processed, 2);
  assert.equal(view.succeeded, 2);
  assert.equal(view.status, "completed");
  assert.deepEqual(view.items.map((item) => item.attempts), [1, 1]);
});

test("다른 워크스페이스는 실행 진행률을 읽을 수 없다", async () => {
  const created = await setupPositionTracking(auth, {
    domain: "private.example.com",
    target: { type: "subdomain", value: "private.example.com" },
    searchEngine: "google",
    device: "desktop",
    locationKey: "US-NEW-YORK",
    keywords: [{ keyword: "private", tags: [] }],
    weeklyDigestEnabled: false,
    idempotencyKey: "setup-private",
  });
  await assert.rejects(() => getPositionTrackingRun(outsider, created.runId), /찾을 수 없습니다/);
});

test("대기 실행을 취소하면 남은 항목을 공급자 호출 없이 종료한다", async () => {
  const created = await setupPositionTracking(auth, {
    domain: "cancel.example.com",
    target: { type: "subdomain", value: "cancel.example.com" },
    searchEngine: "google",
    device: "desktop",
    locationKey: "US-NEW-YORK",
    keywords: [{ keyword: "cancel one", tags: [] }, { keyword: "cancel two", tags: [] }],
    weeklyDigestEnabled: false,
    idempotencyKey: "setup-cancel",
  });
  const cancelled = await cancelPositionTrackingRun(auth, created.runId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.processed, 2);
  assert.deepEqual(cancelled.items.map((item) => item.status), ["cancelled", "cancelled"]);
});

test("같은 주의 자동 실행은 사용자별 앱 알림을 한 번만 만든다", async () => {
  globalThis.fetch = async () => Response.json({
    code: 0,
    data: {
      search_metadata: { id: "scheduled", status: "Success" },
      organic: [{ title: "Target", link: "https://digest.example.com/page" }],
    },
  });
  const created = await setupPositionTracking(auth, {
    domain: "digest.example.com",
    target: { type: "subdomain", value: "digest.example.com" },
    searchEngine: "google",
    device: "desktop",
    locationKey: "US-NEW-YORK",
    keywords: [{ keyword: "weekly", tags: [] }],
    weeklyDigestEnabled: true,
    idempotencyKey: "setup-digest",
  });
  await processNextPositionTrackingItem(auth, created.runId);
  const first = await createPositionTrackingRun(auth, created.campaignId, "scheduled");
  await processNextPositionTrackingItem(auth, first.runId);
  const second = await createPositionTrackingRun(auth, created.campaignId, "scheduled");
  await processNextPositionTrackingItem(auth, second.runId);

  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(process.env.DATABASE_PATH!, { readonly: true });
  const row = sqlite.prepare("SELECT count(*) AS count FROM app_notifications WHERE user_id = 'u1' AND type = 'position_tracking_weekly'").get() as { count: number };
  sqlite.close();
  assert.equal(row.count, 1);
});

test("부분 실패 재시도는 성공 항목을 건드리지 않고 실패 항목의 시도 횟수만 늘린다", async () => {
  const created = await setupPositionTracking(auth, {
    domain: "retry.example.com",
    target: { type: "subdomain", value: "retry.example.com" },
    searchEngine: "google",
    device: "desktop",
    locationKey: "US-NEW-YORK",
    keywords: [{ keyword: "retry me", tags: [] }],
    weeklyDigestEnabled: false,
    idempotencyKey: "setup-retry",
  });
  globalThis.fetch = async () => Response.json({ code: 1, message: "invalid query" });
  const failed = await processNextPositionTrackingItem(auth, created.runId);
  assert.equal(failed.status, "failed");
  assert.equal(failed.items[0]?.attempts, 1);

  globalThis.fetch = async () => Response.json({
    code: 0,
    data: {
      search_metadata: { id: "retry-success", status: "Success" },
      organic: [{ title: "Target", link: "https://retry.example.com/page" }],
    },
  });
  const retried = await retryFailedPositionTrackingItems(auth, created.runId);
  assert.equal(retried.items[0]?.status, "queued");
  const completed = await processNextPositionTrackingItem(auth, created.runId);
  assert.equal(completed.status, "completed");
  assert.equal(completed.items[0]?.attempts, 2);
});

test("브라우저가 처리하지 못한 대기 실행은 정기 크론이 이어받는다", async () => {
  globalThis.fetch = async () => Response.json({
    code: 0,
    data: {
      search_metadata: { id: "cron-recovery", status: "Success" },
      organic: [{ title: "Target", link: "https://recover.example.com/page" }],
    },
  });
  const created = await setupPositionTracking(auth, {
    domain: "recover.example.com",
    target: { type: "subdomain", value: "recover.example.com" },
    searchEngine: "google",
    device: "desktop",
    locationKey: "US-NEW-YORK",
    keywords: [{ keyword: "recover", tags: [] }],
    weeklyDigestEnabled: false,
    idempotencyKey: "setup-recovery",
  });
  const { collectDueCampaigns } = await import("@/server/position-tracking/schedule");
  await collectDueCampaigns({ limit: 20 });
  const recovered = await getPositionTrackingRun(auth, created.runId);
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.processed, 1);
});
