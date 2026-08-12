// @TASK P4-O1-T1 - Least-privilege production outbox relay entrypoint
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/deployment.contract.test.ts
import { createJsonLogger } from "@/server/observability/logger";
import { createProductionRelayComposition } from "@/worker/production";

import { installShutdownSignalBridge } from "./runtime.mjs";

async function main(): Promise<void> {
  const logger = createJsonLogger({ service: "relay" });
  const composition = createProductionRelayComposition();
  const controller = new AbortController();
  const cleanupSignals = installShutdownSignalBridge(
    process,
    controller,
    (signal: string) => logger.info("relay shutdown requested", { signal }),
  );

  logger.info("relay started");
  try {
    await composition.runtime.start(controller.signal);
    logger.info("relay stopped");
  } finally {
    cleanupSignals();
    await composition.close();
  }
}

main().catch((error: unknown) => {
  createJsonLogger({ service: "relay" }).error("relay failed", { error });
  process.exitCode = 1;
});
