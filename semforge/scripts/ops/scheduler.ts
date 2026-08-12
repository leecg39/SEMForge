// @TASK P4-O1-T1 - Least-privilege weekly collection scheduler entrypoint
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/deployment.contract.test.ts
import { createJsonLogger } from "@/server/observability/logger";
import { createProductionSchedulerComposition } from "@/worker/production";

async function main(): Promise<void> {
  const logger = createJsonLogger({ service: "scheduler" });
  const composition = createProductionSchedulerComposition();
  logger.info("weekly collection scheduling started");
  try {
    const result = await composition.scheduler.schedule({ executedAt: new Date() });
    logger.info("weekly collection scheduling completed", {
      google: result.google,
      naver: result.naver,
      gsc: result.gsc,
    });
  } finally {
    await composition.close();
  }
}

main().catch((error: unknown) => {
  createJsonLogger({ service: "scheduler" }).error("weekly collection scheduling failed", { error });
  process.exitCode = 1;
});
