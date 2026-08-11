// @TASK P3-P1-FIX - Production worker/relay/scheduler composition root
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
import { hostname } from "node:os";

import type { Pool } from "pg";

import { getPool } from "@/db/client";
import { decryptSecret, decryptSecretOrThrow, encryptSecret, type SecretCrypto } from "@/lib/crypto";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { createGscSearchAnalyticsClient } from "@/server/collectors/gsc/client";
import { createGscWeeklyCollector } from "@/server/collectors/gsc/collector";
import { createDedicatedGscCollectionJobHandler } from "@/server/collectors/gsc/handler";
import { createPostgresGscObservationStore } from "@/server/collectors/gsc/observation-store";
import { createGscTokenBroker } from "@/server/collectors/gsc/token-broker";
import { loadGscCollectionTarget } from "@/server/collectors/gsc/target";
import { createGoogleCollectionJobHandler } from "@/server/collectors/google/collector";
import { createPostgresGoogleObservationRepository } from "@/server/collectors/google/observation-store";
import { createNaverCollectionJobHandler } from "@/server/collectors/naver/handler";
import { createPostgresNaverObservationStore } from "@/server/collectors/naver/postgres-store";
import { createNaverProductionProvider } from "@/server/providers/naver/production";
import { createTalordataGoogleProvider } from "@/server/providers/talordata/provider";
import { createRuntimeReportJobHandlers } from "@/server/reports/runtime";
import { CollectionOutboxRelayRuntime } from "@/worker/relay-runtime";
import { PostgresWeeklyCollectionScheduler } from "@/worker/scheduler";
import { WorkerRuntime, type WorkerRuntimeOptions } from "@/worker/runtime";

function requireEnv<K extends keyof ServerEnv>(env: ServerEnv, key: K): NonNullable<ServerEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") throw new Error(`${String(key)} is required`);
  return value as NonNullable<ServerEnv[K]>;
}

function runtimeCrypto(): SecretCrypto {
  return {
    encrypt: encryptSecret,
    decrypt: decryptSecret,
    decryptOrThrow: decryptSecretOrThrow,
  };
}

function processIdentity(kind: string): string {
  return `${kind}:${hostname()}:${process.pid}`;
}

export interface ProductionWorkerComposition {
  readonly runtime: WorkerRuntime;
  readonly authPool: Pool;
  readonly dispatcherPool: Pool;
  readonly workerPool: Pool;
  close(): Promise<void>;
}

type ProductionJobHandler = WorkerRuntimeOptions["handlers"][string];

export function composeProductionWorkerJobHandlers(input: {
  readonly google: ProductionJobHandler;
  readonly naver: ProductionJobHandler;
  readonly gsc: ProductionJobHandler;
  readonly reports: Readonly<Record<string, ProductionJobHandler>>;
}) {
  return {
    "collect.google": input.google,
    "collect.naver": input.naver,
    "collect.gsc.weekly": input.gsc,
    ...input.reports,
  };
}

export function createProductionWorkerComposition(
  env: ServerEnv = getServerEnv(),
): ProductionWorkerComposition {
  const authPool = getPool("auth");
  const dispatcherPool = getPool("dispatcher");
  const workerPool = getPool("worker");
  const google = createGoogleCollectionJobHandler({
    provider: createTalordataGoogleProvider({
      token: requireEnv(env, "TALORDATA_API_TOKEN"),
    }),
    observations: createPostgresGoogleObservationRepository(workerPool),
  });
  const naver = createNaverCollectionJobHandler({
    provider: createNaverProductionProvider({
      credentials: {
        clientId: requireEnv(env, "NAVER_OPEN_API_CLIENT_ID"),
        clientSecret: requireEnv(env, "NAVER_OPEN_API_CLIENT_SECRET"),
      },
      searchAdsOptions: {
        credentials: {
          accessLicense: requireEnv(env, "NAVER_SEARCH_AD_ACCESS_LICENSE"),
          secretKey: requireEnv(env, "NAVER_SEARCH_AD_SECRET_KEY"),
          customerId: requireEnv(env, "NAVER_SEARCH_AD_CUSTOMER_ID"),
        },
      },
    }),
    store: createPostgresNaverObservationStore(workerPool),
  });
  const gsc = createDedicatedGscCollectionJobHandler({
    pool: workerPool,
    createCollector: (client) => createGscWeeklyCollector({
      targetLoader: (input) => loadGscCollectionTarget(client, input),
      tokenBroker: createGscTokenBroker({
        db: client,
        crypto: runtimeCrypto(),
        oauthConfig: {
          clientId: requireEnv(env, "GOOGLE_CLIENT_ID"),
          clientSecret: requireEnv(env, "GOOGLE_CLIENT_SECRET"),
          redirectUri: env.GSC_REDIRECT_URI ??
            `${requireEnv(env, "APP_PUBLIC_URL")}/api/v1/integrations/gsc/callback`,
        },
      }),
      searchAnalyticsClient: createGscSearchAnalyticsClient(),
      observationStore: createPostgresGscObservationStore(client),
    }),
  });
  const reports = createRuntimeReportJobHandlers({
    workerDatabase: workerPool,
    authDatabase: authPool,
    env,
  });
  const runtime = new WorkerRuntime({
    database: dispatcherPool,
    tenantDatabase: workerPool,
    handlers: composeProductionWorkerJobHandlers({ google, naver, gsc, reports }),
    workerId: processIdentity("worker"),
    concurrency: Math.min(10, env.PGPOOL_MAX),
  });
  return {
    runtime,
    authPool,
    dispatcherPool,
    workerPool,
    async close() {
      await Promise.all([authPool.end(), dispatcherPool.end(), workerPool.end()]);
    },
  };
}

export function createProductionRelayComposition(env: ServerEnv = getServerEnv()) {
  void env;
  const dispatcherPool = getPool("dispatcher");
  return {
    runtime: new CollectionOutboxRelayRuntime({
      database: dispatcherPool,
      relayId: processIdentity("relay"),
    }),
    async close() { await dispatcherPool.end(); },
  };
}

export function createProductionSchedulerComposition(env: ServerEnv = getServerEnv()) {
  void env;
  const schedulerPool = getPool("scheduler");
  return {
    scheduler: new PostgresWeeklyCollectionScheduler(schedulerPool),
    async close() { await schedulerPool.end(); },
  };
}
