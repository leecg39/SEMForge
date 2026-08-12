// @TASK P4-O1-T1 - Hardened production worker entrypoint
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/deployment.contract.test.ts
import { createJsonLogger } from "@/server/observability/logger";
import { createProductionWorkerComposition } from "@/worker/production";

import { installShutdownSignalBridge } from "./runtime.mjs";

async function main(): Promise<void> {
  const logger = createJsonLogger({ service: "worker" });
  const composition = createProductionWorkerComposition();
  const controller = new AbortController();
  const cleanupSignals = installShutdownSignalBridge(
    process,
    controller,
    (signal: string) => logger.info("worker shutdown requested", { signal }),
  );

  logger.info("worker started");
  try {
    await composition.runtime.start(controller.signal);
    logger.info("worker stopped");
  } finally {
    cleanupSignals();
    await composition.close();
  }
}

main().catch((error: unknown) => {
  createJsonLogger({ service: "worker" }).error("worker failed", { error });
  process.exitCode = 1;
});
