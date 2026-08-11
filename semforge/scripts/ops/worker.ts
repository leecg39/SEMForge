// @TASK P4-O1-T1 - Production worker composition and graceful shutdown entrypoint
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/runtime.test.mjs
import { randomUUID } from "node:crypto";

import { getPool } from "@/db/client";
import { createSecretCrypto } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createGscSearchAnalyticsClient } from "@/server/collectors/gsc/client";
import { createGscWeeklyCollector } from "@/server/collectors/gsc/collector";
import {
  createDedicatedGscCollectionJobHandler,
  GSC_WEEKLY_COLLECTION_JOB,
} from "@/server/collectors/gsc/handler";
import { createPostgresGscObservationStore } from "@/server/collectors/gsc/observation-store";
import { loadGscCollectionTarget } from "@/server/collectors/gsc/target";
import { createGscTokenBroker } from "@/server/collectors/gsc/token-broker";
import { createGoogleCollectionJobHandler } from "@/server/collectors/google/collector";
import { createPostgresGoogleObservationRepository } from "@/server/collectors/google/observation-store";
import { createNaverCollectionJobHandler } from "@/server/collectors/naver/handler";
import { createPostgresNaverObservationStore } from "@/server/collectors/naver/postgres-store";
import { createNaverProductionProvider } from "@/server/providers/naver/production";
import { createTalordataGoogleProvider } from "@/server/providers/talordata/provider";
import { createJsonLogger } from "@/server/observability/logger";
import { WorkerRuntime } from "@/worker/runtime";

import { installShutdownSignalBridge } from "./runtime.mjs";

function positiveInteger(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

async function main(): Promise<void> {
  const logger = createJsonLogger({ service: "worker" });
  const env = getServerEnv();
  if (
    env.SEMFORGE_SERVICE !== "worker" ||
    !env.APP_SECRET ||
    !env.APP_SECRET_CURRENT_KEY_ID ||
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET
  ) {
    throw new Error("worker environment profile is invalid");
  }

  const pool = getPool("worker");
  const crypto = createSecretCrypto({
    currentKeyId: env.APP_SECRET_CURRENT_KEY_ID,
    currentSecret: env.APP_SECRET,
    previousKeys: env.APP_SECRET_PREVIOUS_KEYS,
  });
  const oauthConfig = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      env.GSC_REDIRECT_URI ?? "https://app.semforge.invalid/api/v1/integrations/gsc/callback",
  };
  const googleHandler = createGoogleCollectionJobHandler({
    provider: createTalordataGoogleProvider(),
    observations: createPostgresGoogleObservationRepository(pool),
  });
  const naverHandler = createNaverCollectionJobHandler({
    provider: createNaverProductionProvider(),
    store: createPostgresNaverObservationStore(pool),
  });
  const gscHandler = createDedicatedGscCollectionJobHandler({
    pool,
    createCollector: (client) => createGscWeeklyCollector({
      targetLoader: (input) => loadGscCollectionTarget(client, input),
      tokenBroker: createGscTokenBroker({ db: client, crypto, oauthConfig }),
      searchAnalyticsClient: createGscSearchAnalyticsClient(),
      observationStore: createPostgresGscObservationStore(client),
    }),
  });
  const runtime = new WorkerRuntime({
    database: pool,
    handlers: {
      "collect.google": googleHandler,
      "collect.naver": naverHandler,
      [GSC_WEEKLY_COLLECTION_JOB]: gscHandler,
    },
    workerId: process.env.WORKER_ID?.trim() || process.env.HOSTNAME?.trim() || randomUUID(),
    concurrency: positiveInteger("WORKER_CONCURRENCY", 2, 100),
    leaseMs: positiveInteger("WORKER_LEASE_MS", 60_000, 3_600_000),
    heartbeatMs: positiveInteger("WORKER_HEARTBEAT_MS", 20_000, 3_599_999),
    pollMs: positiveInteger("WORKER_POLL_MS", 1_000, 60_000),
    shutdownGraceMs: positiveInteger("WORKER_SHUTDOWN_GRACE_MS", 30_000, 600_000),
  });
  const controller = new AbortController();
  const cleanupSignals = installShutdownSignalBridge(
    process,
    controller,
    (signal: string) => logger.info("worker shutdown requested", { signal }),
  );

  logger.info("worker started");
  try {
    await runtime.start(controller.signal);
    logger.info("worker stopped");
  } finally {
    cleanupSignals();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  createJsonLogger({ service: "worker" }).error("worker failed", { error });
  process.exitCode = 1;
});
