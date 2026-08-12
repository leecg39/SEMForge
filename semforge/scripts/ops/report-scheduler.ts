// @TASK P4-P1-FIX - Dedicated Monday 08:00 KST report snapshot scheduler
// @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
// @TEST scripts/ops/deployment.contract.test.ts
import { createJsonLogger } from "@/server/observability/logger";
import { createProductionReportSchedulerComposition } from "@/worker/production";

async function main(): Promise<void> {
  const logger = createJsonLogger({ service: "report-scheduler" });
  const composition = createProductionReportSchedulerComposition();
  logger.info("weekly report snapshot scheduling started");
  try {
    const result = await composition.scheduler.schedule({ executedAt: new Date() });
    logger.info("weekly report snapshot scheduling completed", { ...result });
  } finally {
    await composition.close();
  }
}

main().catch((error: unknown) => {
  createJsonLogger({ service: "report-scheduler" }).error(
    "weekly report snapshot scheduling failed",
    { error },
  );
  process.exitCode = 1;
});
