// @TASK P3-P1-FIX - Production collection outbox relay loop
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
// @TEST src/server/outbox/relay.integration.test.ts
import { PostgresOutboxRelay } from "@/server/outbox/relay";
import type { SqlQueryable } from "@/server/jobs/queue";
import {
  PRODUCTION_OUTBOX_TOPICS,
  PRODUCTION_TOPIC_TO_JOB_TYPE,
  type ProductionOutboxTopic,
} from "@/worker/topics";

export interface CollectionRelayRunResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

export interface CollectionOutboxRelayRuntimeOptions {
  readonly database: SqlQueryable;
  readonly relayId: string;
  readonly batchSize?: number;
  readonly leaseMs?: number;
  readonly pollMs?: number;
  readonly clock?: () => Date;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export class CollectionOutboxRelayRuntime {
  private readonly relay: PostgresOutboxRelay;
  private readonly relayId: string;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly pollMs: number;
  private readonly clock: () => Date;

  constructor(options: CollectionOutboxRelayRuntimeOptions) {
    if (!options.relayId.trim()) throw new TypeError("relayId is invalid");
    this.relayId = options.relayId.trim();
    this.batchSize = options.batchSize ?? 25;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.pollMs = options.pollMs ?? 1_000;
    this.clock = options.clock ?? (() => new Date());
    this.relay = new PostgresOutboxRelay(options.database, this.clock);
  }

  async runOnce(): Promise<CollectionRelayRunResult> {
    const now = this.clock();
    await this.relay.recoverExpired({ now, limit: this.batchSize * 2 });
    const events = await this.relay.claim({
      workerId: this.relayId,
      limit: this.batchSize,
      leaseMs: this.leaseMs,
      now,
      topics: PRODUCTION_OUTBOX_TOPICS,
    });
    let published = 0;
    let failed = 0;
    for (const event of events) {
      try {
        const topic = event.topic as ProductionOutboxTopic;
        await this.relay.publish(event, {
          jobType: PRODUCTION_TOPIC_TO_JOB_TYPE[topic],
          now: this.clock(),
        });
        published += 1;
      } catch {
        failed += 1;
      }
    }
    return { claimed: events.length, published, failed };
  }

  async start(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const result = await this.runOnce();
      if (result.claimed === 0) await delay(this.pollMs, signal);
    }
  }
}
