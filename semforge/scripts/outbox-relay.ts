// @TASK P3-P1-FIX - Production collection outbox relay entrypoint
import { createProductionRelayComposition } from "@/worker/production";

async function main(): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  const composition = createProductionRelayComposition();
  try {
    await composition.runtime.start(controller.signal);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await composition.close();
  }
}

void main();
