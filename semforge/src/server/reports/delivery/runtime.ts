// @TASK P4-R1-T1 - Production composition for report PDF and email jobs
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { getPool } from "@/db/client";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import {
  createReportEmailDeliveryJobHandler,
  createReportPdfRenderJobHandler,
  REPORT_EMAIL_DELIVERY_JOB,
  REPORT_PDF_RENDER_JOB,
} from "@/server/reports/delivery/job-handler";
import { ResendEmailSender } from "@/server/reports/delivery/resend";
import { createReportPdfDownloadRouteHandler } from "@/server/reports/delivery/routes";
import {
  createReportDeliveryService,
  type ReportDeliveryService,
} from "@/server/reports/delivery/service";
import {
  PostgresReportDeliveryStore,
  type DeliverySqlSource,
} from "@/server/reports/delivery/store";
import { createChromiumReportRenderer } from "@/server/reports/rendering/pdf";
import { S3PrivateObjectStorage } from "@/server/storage/s3";

function required(env: ServerEnv, key: keyof ServerEnv): string {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${String(key)}이 필요합니다.`);
  return value;
}

export function createReportDeliveryJobHandlers(service: ReportDeliveryService) {
  return {
    [REPORT_PDF_RENDER_JOB]: createReportPdfRenderJobHandler(service),
    [REPORT_EMAIL_DELIVERY_JOB]: createReportEmailDeliveryJobHandler(service),
  } as const;
}

function runtimeStorage(env: ServerEnv, options: {
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
} = {}) {
  return new S3PrivateObjectStorage({
    endpoint: required(env, "S3_ENDPOINT"),
    region: required(env, "S3_REGION"),
    bucket: required(env, "S3_BUCKET"),
    accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
    fetch: options.fetch,
    clock: options.clock,
    allowInsecureEndpoint: env.NODE_ENV !== "production",
  });
}

export function createRuntimeReportDeliveryService(options: {
  database?: DeliverySqlSource;
  env?: ServerEnv;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
} = {}): ReportDeliveryService {
  const env = options.env ?? getServerEnv();
  const database = options.database ?? (getPool("worker") as unknown as DeliverySqlSource);
  const storage = runtimeStorage(env, options);
  return createReportDeliveryService({
    store: new PostgresReportDeliveryStore(database),
    storage,
    renderer: createChromiumReportRenderer({
      executablePath: required(env, "CHROMIUM_EXECUTABLE_PATH"),
      fetch: options.fetch,
    }),
    email: new ResendEmailSender({
      apiKey: required(env, "RESEND_API_KEY"),
      from: required(env, "RESEND_FROM_EMAIL"),
      fetch: options.fetch,
    }),
    appPublicUrl: required(env, "APP_PUBLIC_URL"),
    clock: options.clock,
  });
}

export function createRuntimeReportDeliveryJobHandlers() {
  return createReportDeliveryJobHandlers(createRuntimeReportDeliveryService());
}

export function createRuntimeReportPdfDownloadRouteHandler() {
  const env = getServerEnv();
  return createReportPdfDownloadRouteHandler({
    store: new PostgresReportDeliveryStore(
      getPool("web") as unknown as DeliverySqlSource,
    ),
    storage: runtimeStorage(env),
  });
}
