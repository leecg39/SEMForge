// @TASK P3-P1-FIX - Production collector worker entrypoint
import { createProductionWorkerComposition } from "@/worker/production";

async function main(): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  const composition = createProductionWorkerComposition();
  try {
    await composition.runtime.start(controller.signal);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await composition.close();
  }
}

void main();
