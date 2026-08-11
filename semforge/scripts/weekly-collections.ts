// @TASK P3-P1-FIX - Production weekly collection scheduler entrypoint
import { createProductionSchedulerComposition } from "@/worker/production";

async function main(): Promise<void> {
  const composition = createProductionSchedulerComposition();
  try {
    const result = await composition.scheduler.schedule({ executedAt: new Date() });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await composition.close();
  }
}

void main();
