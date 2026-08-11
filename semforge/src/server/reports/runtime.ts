// @TASK P3-R1-T1 - Runtime composition for report.snapshot jobs
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
import { getPool } from "@/db/client";
import type { JobHandler } from "@/server/jobs/contracts";
import {
  createReportGenerationJobHandler,
  type ReportGenerationPayload,
} from "@/server/reports/job-handler";
import { createRuntimeReportDeliveryJobHandlers } from "@/server/reports/delivery/runtime";
import {
  createPostgresWeeklyReportGenerator,
  type ReportSqlSource,
} from "@/server/reports/store";
import { loadReportOwnerRecipients } from "@/server/reports/delivery/outbox";

/** Worker registry가 직접 호출할 수 있으며 worker 내부 구현에는 의존하지 않는다. */
export function createRuntimeReportGenerationJobHandler(): JobHandler<ReportGenerationPayload> {
  const source = getPool("worker") as unknown as ReportSqlSource;
  const authSource = getPool("auth") as unknown as ReportSqlSource;
  return createReportGenerationJobHandler(createPostgresWeeklyReportGenerator(source, {
    loadOwnerRecipients: (workspaceId) => loadReportOwnerRecipients(authSource, workspaceId),
  }));
}

/** Worker entrypoint가 수동 갱신 없이 report snapshot→PDF/email jobs를 등록하는 고정 registry. */
export function createRuntimeReportJobHandlers() {
  return {
    "report.snapshot": createRuntimeReportGenerationJobHandler(),
    ...createRuntimeReportDeliveryJobHandlers(),
  } as const;
}
