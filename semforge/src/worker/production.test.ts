// @TASK P4-R1-T1 - Production worker report delivery registry contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { defineJobHandler, jobSucceeded } from "@/server/jobs/contracts";
import {
  REPORT_EMAIL_DELIVERY_JOB,
  REPORT_PDF_RENDER_JOB,
} from "@/server/reports/delivery/job-handler";
import { composeProductionWorkerJobHandlers } from "@/worker/production";

test("production worker는 collection과 snapshot·PDF·email report jobs를 모두 등록한다", () => {
  const handler = defineJobHandler(async () => jobSucceeded());
  const handlers = composeProductionWorkerJobHandlers({
    google: handler,
    naver: handler,
    gsc: handler,
    reports: {
      "report.snapshot": handler,
      [REPORT_PDF_RENDER_JOB]: handler,
      [REPORT_EMAIL_DELIVERY_JOB]: handler,
    },
  });

  assert.deepEqual(Object.keys(handlers).sort(), [
    "collect.google",
    "collect.gsc.weekly",
    "collect.naver",
    "report.email.deliver",
    "report.pdf.render",
    "report.snapshot",
  ]);
});
