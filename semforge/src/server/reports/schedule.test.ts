// @TASK P3-R1-T1 - Weekly report schedule and mature GSC window contract
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/schedule.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWeeklyReportSchedule,
  nextCollectionRetryAt,
} from "@/server/reports/schedule";

test("KST 월요일 주기는 일요일 18시 수집, 월요일 07시 마감, 08시 snapshot으로 고정된다", () => {
  const schedule = buildWeeklyReportSchedule("2026-08-10");

  assert.equal(schedule.collectionAt.toISOString(), "2026-08-09T09:00:00.000Z");
  assert.equal(schedule.retryCutoffAt.toISOString(), "2026-08-09T22:00:00.000Z");
  assert.equal(schedule.snapshotAt.toISOString(), "2026-08-09T23:00:00.000Z");
  assert.deepEqual(schedule.gsc, {
    timezone: "America/Los_Angeles",
    current: { start: "2026-07-31", end: "2026-08-06" },
    comparison: { start: "2026-07-24", end: "2026-07-30" },
  });
});

test("GSC mature window는 PT DST 시작일에도 이전 목요일 포함 7일과 직전 7일을 유지한다", () => {
  const spring = buildWeeklyReportSchedule("2026-03-09");
  assert.equal(spring.snapshotAt.toISOString(), "2026-03-08T23:00:00.000Z");
  assert.deepEqual(spring.gsc.current, { start: "2026-02-27", end: "2026-03-05" });
  assert.deepEqual(spring.gsc.comparison, { start: "2026-02-20", end: "2026-02-26" });

  const autumn = buildWeeklyReportSchedule("2026-11-02");
  assert.equal(autumn.snapshotAt.toISOString(), "2026-11-01T23:00:00.000Z");
  assert.deepEqual(autumn.gsc.current, { start: "2026-10-23", end: "2026-10-29" });
  assert.deepEqual(autumn.gsc.comparison, { start: "2026-10-16", end: "2026-10-22" });
});

test("수집 retry는 월요일 07:00 KST 이전에만 예약된다", () => {
  const schedule = buildWeeklyReportSchedule("2026-08-10");
  assert.equal(
    nextCollectionRetryAt(new Date("2026-08-09T21:50:00.000Z"), 5 * 60_000, schedule)?.toISOString(),
    "2026-08-09T21:55:00.000Z",
  );
  assert.equal(nextCollectionRetryAt(new Date("2026-08-09T21:59:00.000Z"), 2 * 60_000, schedule), null);
  assert.equal(nextCollectionRetryAt(schedule.retryCutoffAt, 1, schedule), null);
});

