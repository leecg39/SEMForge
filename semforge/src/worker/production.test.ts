// @TASK P4-R1-T1 - Production worker report delivery registry contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import { defineJobHandler, jobSucceeded } from "@/server/jobs/contracts";
import { PASSWORD_RESET_EMAIL_JOB } from "@/server/auth/password-reset-email";
import {
  REPORT_EMAIL_DELIVERY_JOB,
  REPORT_PDF_RENDER_JOB,
} from "@/server/reports/delivery/job-handler";
import { composeProductionWorkerJobHandlers } from "@/worker/production";
import { PRODUCTION_OUTBOX_TOPICS, PRODUCTION_TOPIC_TO_JOB_TYPE } from "@/worker/topics";

test("production worker는 collection과 snapshot·PDF·email report jobs를 모두 등록한다", () => {
  const handler = defineJobHandler(async () => jobSucceeded());
  const handlers = composeProductionWorkerJobHandlers({
    google: handler,
    naver: handler,
    gsc: handler,
    passwordResetEmail: handler,
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
    PASSWORD_RESET_EMAIL_JOB,
    "report.email.deliver",
    "report.pdf.render",
    "report.snapshot",
  ]);
});

test("production relay는 password reset outbox를 같은 이름의 worker job으로 전달한다", () => {
  assert.equal(PRODUCTION_TOPIC_TO_JOB_TYPE[PASSWORD_RESET_EMAIL_JOB], PASSWORD_RESET_EMAIL_JOB);
  assert.equal(PRODUCTION_OUTBOX_TOPICS.includes(PASSWORD_RESET_EMAIL_JOB), true);
});
