// @TASK P4-O1-T1 - Runtime preflight and graceful OS signal bridge
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/runtime.test.mjs

const REQUIRED_BY_PROFILE = Object.freeze({
  web: Object.freeze([
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "OPERATOR_DATABASE_URL",
    "BILLING_DATABASE_URL",
    "APP_PUBLIC_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "TOSS_SECRET_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "BILLING_FINGERPRINT_SECRET",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]),
  worker: Object.freeze([
    "AUTH_DATABASE_URL",
    "WORKER_DATABASE_URL",
    "DISPATCHER_DATABASE_URL",
    "APP_PUBLIC_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NAVER_OPEN_API_CLIENT_ID",
    "NAVER_OPEN_API_CLIENT_SECRET",
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
    "TALORDATA_API_TOKEN",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHROMIUM_EXECUTABLE_PATH",
  ]),
  relay: Object.freeze(["DISPATCHER_DATABASE_URL"]),
  scheduler: Object.freeze(["SCHEDULER_DATABASE_URL"]),
  migrate: Object.freeze(["MIGRATION_DATABASE_URL"]),
});

const DATABASE_KEYS = new Set([
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "OPERATOR_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "DISPATCHER_DATABASE_URL",
  "SCHEDULER_DATABASE_URL",
  "BILLING_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
]);

export class RuntimeConfigurationError extends Error {
  constructor(issues) {
    super(`runtime configuration invalid: ${issues.join(", ")}`);
    this.name = "RuntimeConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}

function isPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRuntimeEnvironment(profile, environment) {
  const required = REQUIRED_BY_PROFILE[profile];
  if (!required) {
    throw new RuntimeConfigurationError(["runtime profile is invalid"]);
  }
  const issues = [];
  if (environment.NODE_ENV !== "production") {
    issues.push("NODE_ENV must be production");
  }
  if (environment.SEMFORGE_SERVICE !== profile) {
    issues.push(`SEMFORGE_SERVICE must equal ${profile}`);
  }
  if ((environment.PGSSLMODE ?? "verify-full") !== "verify-full") {
    issues.push("PGSSLMODE must be verify-full in production");
  }
  for (const key of required) {
    const value = environment[key];
    if (!isPresent(value)) {
      issues.push(`${key} is required`);
      continue;
    }
    if (DATABASE_KEYS.has(key) && !value.trim().startsWith("postgresql://")) {
      issues.push(`${key} must use postgresql://`);
      continue;
    }
    if (DATABASE_KEYS.has(key)) {
      try {
        const sslMode = new URL(value).searchParams.get("sslmode");
        if (sslMode !== null && sslMode !== "verify-full") {
          issues.push(`${key} sslmode must be verify-full when present`);
        }
      } catch {
        issues.push(`${key} must be a valid PostgreSQL URL`);
      }
    }
  }
  if (
    isPresent(environment.APP_PUBLIC_URL) &&
    !environment.APP_PUBLIC_URL.trim().startsWith("https://")
  ) {
    issues.push("APP_PUBLIC_URL must use https in production");
  }
  if (isPresent(environment.APP_SECRET) && environment.APP_SECRET.length < 32) {
    issues.push("APP_SECRET must be at least 32 characters");
  }
  if (
    isPresent(environment.BILLING_FINGERPRINT_SECRET) &&
    environment.BILLING_FINGERPRINT_SECRET.length < 32
  ) {
    issues.push("BILLING_FINGERPRINT_SECRET must be at least 32 characters");
  }
  if (issues.length > 0) throw new RuntimeConfigurationError(issues);
}

/**
 * @param {{ once(event: string, listener: () => void): unknown; removeListener(event: string, listener: () => void): unknown }} processEvents
 * @param {AbortController} controller
 * @param {(signal: "SIGTERM" | "SIGINT") => void} [onSignal]
 */
export function installShutdownSignalBridge(processEvents, controller, onSignal = () => {}) {
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    onSignal(signal);
    controller.abort(signal);
  };
  const onTerm = () => stop("SIGTERM");
  const onInterrupt = () => stop("SIGINT");
  processEvents.once("SIGTERM", onTerm);
  processEvents.once("SIGINT", onInterrupt);
  return () => {
    processEvents.removeListener("SIGTERM", onTerm);
    processEvents.removeListener("SIGINT", onInterrupt);
  };
}
