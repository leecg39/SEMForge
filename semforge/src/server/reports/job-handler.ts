// @TASK P3-R1-T1 - Weekly report snapshot job adapter
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST src/server/reports/job-handler.test.ts
import { z } from "zod";

import {
  defineJobHandler,
  jobDead,
  jobRetryable,
  jobSucceeded,
  type JobHandler,
} from "@/server/jobs/contracts";
import { buildWeeklyReportSchedule } from "@/server/reports/schedule";
import type { WeeklyReportGenerator } from "@/server/reports/types";

const ReportGenerationPayloadSchema = z.object({
  siteId: z.uuid(),
  cycleMonday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ReportGenerationPayload = z.infer<typeof ReportGenerationPayloadSchema> &
  Record<string, unknown>;

export function createReportGenerationJobHandler(
  generator: WeeklyReportGenerator,
): JobHandler<ReportGenerationPayload> {
  return defineJobHandler<ReportGenerationPayload>(async (job, context) => {
    if (job.workspaceId !== context.workspaceId) {
      return jobDead("REPORT_SNAPSHOT_WORKSPACE_MISMATCH");
    }
    if (job.type !== "report.snapshot") return jobDead("REPORT_SNAPSHOT_INVALID_TYPE");

    const parsed = ReportGenerationPayloadSchema.safeParse(job.payload);
    if (!parsed.success) return jobDead("REPORT_SNAPSHOT_INVALID_PAYLOAD");

    let schedule;
    try {
      schedule = buildWeeklyReportSchedule(parsed.data.cycleMonday);
    } catch {
      return jobDead("REPORT_SNAPSHOT_INVALID_PAYLOAD");
    }
    const now = context.now();
    if (now < schedule.snapshotAt) {
      return jobRetryable("REPORT_SNAPSHOT_NOT_READY", schedule.snapshotAt);
    }
    if (context.signal.aborted) return jobRetryable("REPORT_SNAPSHOT_ABORTED");

    await context.audit("report.snapshot.started", {
      siteId: parsed.data.siteId,
      cycleMonday: parsed.data.cycleMonday,
    });
    try {
      const report = await generator.generate({
        workspaceId: job.workspaceId,
        siteId: parsed.data.siteId,
        cycleMonday: parsed.data.cycleMonday,
      });
      await context.audit("report.snapshot.completed", {
        reportId: report.id,
        reportStatus: report.status,
      });
      return jobSucceeded({ reportId: report.id, reportStatus: report.status });
    } catch {
      return jobRetryable("REPORT_SNAPSHOT_FAILED");
    }
  });
}

