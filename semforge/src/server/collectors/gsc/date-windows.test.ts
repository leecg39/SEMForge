// @TASK P3-C2-T1 - GSC mature PT reporting windows
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/collectors/gsc/date-windows.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateMatureGscWindows } from "@/server/collectors/gsc/date-windows";

test("월요일 08:00 KST 실행은 PT 이전 목요일까지의 7일과 직전 7일을 계산한다", () => {
  assert.deepEqual(
    calculateMatureGscWindows(new Date("2026-08-09T23:00:00.000Z")),
    {
      current: { startDate: "2026-07-31", endDate: "2026-08-06" },
      comparison: { startDate: "2026-07-24", endDate: "2026-07-30" },
    },
  );
});

test("미국 DST 시작·종료 주에도 PT 달력 기준으로 정확히 7일을 유지한다", () => {
  assert.deepEqual(
    calculateMatureGscWindows(new Date("2026-03-08T23:00:00.000Z")),
    {
      current: { startDate: "2026-02-27", endDate: "2026-03-05" },
      comparison: { startDate: "2026-02-20", endDate: "2026-02-26" },
    },
  );
  assert.deepEqual(
    calculateMatureGscWindows(new Date("2026-11-01T23:00:00.000Z")),
    {
      current: { startDate: "2026-10-23", endDate: "2026-10-29" },
      comparison: { startDate: "2026-10-16", endDate: "2026-10-22" },
    },
  );
});

test("일요일에서 월요일로 넘어가는 KST 경계는 아직 같은 PT 일요일이므로 기간을 앞당기지 않는다", () => {
  const beforeMondayKst = calculateMatureGscWindows(
    new Date("2026-08-09T14:59:59.999Z"),
  );
  const mondayKst = calculateMatureGscWindows(
    new Date("2026-08-09T15:00:00.000Z"),
  );

  assert.deepEqual(mondayKst, beforeMondayKst);
  assert.equal(mondayKst.current.endDate, "2026-08-06");
});
