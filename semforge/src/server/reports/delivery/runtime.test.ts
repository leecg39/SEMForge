// @TASK P4-R1-T1 - Report delivery runtime registry contract
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REPORT_EMAIL_DELIVERY_JOB,
  REPORT_PDF_RENDER_JOB,
} from "@/server/reports/delivery/job-handler";
import { createReportDeliveryJobHandlers } from "@/server/reports/delivery/runtime";
import type { ReportDeliveryService } from "@/server/reports/delivery/service";

test("worker registry는 PDF와 email handler를 고정 job type으로 자동 연결한다", () => {
  const service = {} as ReportDeliveryService;
  const handlers = createReportDeliveryJobHandlers(service);
  assert.deepEqual(Object.keys(handlers).sort(), [REPORT_EMAIL_DELIVERY_JOB, REPORT_PDF_RENDER_JOB]);
  assert.equal(typeof handlers[REPORT_PDF_RENDER_JOB], "function");
  assert.equal(typeof handlers[REPORT_EMAIL_DELIVERY_JOB], "function");
});
