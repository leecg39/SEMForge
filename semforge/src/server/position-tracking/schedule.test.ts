import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

/**
 * 주기 수집 스케줄의 통합 테스트.
 *
 * 0008 마이그레이션은 drizzle 저널에 등록되어 migrate() 직후 컬럼이 존재한다.
 * 이 상태에서 migrated=true 가 보고되고 스케줄 설정/due 판정 흐름이
 * 동작하는지 검증한다. (미적용 가드의 migrated=false 경로는 collect-due
 * 라우트 테스트 등 별도 저널 없는 환경에서 다룬다.)
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-schedule-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

type ScheduleModule = typeof import("@/server/position-tracking/schedule");
let getCampaignSchedule: ScheduleModule["getCampaignSchedule"];
let setCampaignSchedule: ScheduleModule["setCampaignSchedule"];
let collectCampaignIfDue: ScheduleModule["collectCampaignIfDue"];
let collectDueCampaigns: ScheduleModule["collectDueCampaigns"];

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
  sqlite.exec("INSERT INTO workspaces (id, name, slug) VALUES ('w1','테스트 워크스페이스','test-ws')");
  sqlite.exec(
    "INSERT INTO position_tracking_campaigns (id, workspace_id, name, domain) VALUES ('c1','w1','테스트','example.com')"
  );
  sqlite.close();

  ({
    getCampaignSchedule,
    setCampaignSchedule,
    collectCampaignIfDue,
    collectDueCampaigns,
  } = await import("@/server/position-tracking/schedule"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("저널 등록된 0008이 migrate()로 적용되어 migrated=true 를 돌려준다", async () => {
  const state = await getCampaignSchedule(auth, "c1");
  assert.equal(state.migrated, true);
  assert.equal(state.schedule, "off");
  assert.equal(state.nextRunAt, null);

  const due = await collectDueCampaigns();
  assert.equal(due.migrated, true);
  assert.equal(due.checked, 0);
});

test("스케줄 설정/조회와 due 판정이 동작한다", async () => {
  const set = await setCampaignSchedule(auth, "c1", "daily");
  assert.equal(set.migrated, true);
  assert.equal(set.schedule, "daily");
  assert.ok(set.nextRunAt !== null && set.nextRunAt > Date.now());

  // 다음 실행 시각이 미래라서 아직 수집 대상이 아니다.
  const notDue = await collectCampaignIfDue(auth, "c1");
  assert.equal(notDue.skipped, true);
  assert.equal(notDue.reason, "not_due");

  // 실행 시각을 과거로 돌리면 due 수집 대상이 된다. 추적 키워드가 없으므로
  // 수집은 실패하지만 다음 실행 시각은 전진하고 결과에 실패가 기록된다.
  const { default: Database2 } = await import("better-sqlite3");
  const past = new Database2(process.env.DATABASE_PATH!);
  past.exec("UPDATE position_tracking_campaigns SET next_run_at = 1 WHERE id = 'c1'");
  past.close();

  const due = await collectDueCampaigns();
  assert.equal(due.migrated, true);
  assert.equal(due.checked, 1);
  assert.equal(due.failed, 1);
  const result = due.results[0];
  assert.equal(result?.ok, false);
  assert.equal(result?.campaignId, "c1");

  const after = await getCampaignSchedule(auth, "c1");
  assert.ok(after.nextRunAt !== null && after.nextRunAt > Date.now());

  // off 로 돌리면 next_run_at 이 지워지고 스킵 사유가 schedule_off 가 된다.
  const off = await setCampaignSchedule(auth, "c1", "off");
  assert.equal(off.nextRunAt, null);
  const skipped = await collectCampaignIfDue(auth, "c1");
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.reason, "schedule_off");
});

test("다른 워크스페이스의 캠페인 스케줄은 404 를 던진다", async () => {
  const outsider = { ...auth, workspaceId: "w-other" };
  await assert.rejects(() => getCampaignSchedule(outsider, "c1"), /찾을 수 없습니다/);
  await assert.rejects(() => setCampaignSchedule(outsider, "c1", "daily"), /찾을 수 없습니다/);
});
