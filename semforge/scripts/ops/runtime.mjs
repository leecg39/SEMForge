// @TASK P4-O1-T1 - Runtime preflight and graceful OS signal bridge
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/runtime.test.mjs

const REQUIRED_BY_PROFILE = Object.freeze({
  web: Object.freeze([
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "BILLING_DATABASE_URL",
    "BILLING_TENANT_DATABASE_URL",
    "LEGAL_RELEASE_MANIFEST",
    "APP_PUBLIC_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "TOSS_CLIENT_KEY",
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
  privacy: Object.freeze([
    "PRIVACY_DATABASE_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]),
  retention: Object.freeze([
    "PRIVACY_RETENTION_DATABASE_URL",
    "PRIVACY_RETENTION_POLICY",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]),
  operator: Object.freeze(["OPERATOR_DATABASE_URL"]),
  migrate: Object.freeze(["MIGRATION_DATABASE_URL"]),
});

const NON_PRIVACY_RUNTIME_SECRETS = Object.freeze([
  "APP_PUBLIC_URL",
  "AUTH_TRUST_PROXY_HEADERS",
  "LEGAL_RELEASE_MANIFEST",
  "GSC_REDIRECT_URI",
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "DISPATCHER_DATABASE_URL",
  "SCHEDULER_DATABASE_URL",
  "BILLING_DATABASE_URL",
  "BILLING_TENANT_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "TOSS_CLIENT_KEY",
  "TOSS_SECRET_KEY",
  "BILLING_FINGERPRINT_SECRET",
  "NAVER_OPEN_API_CLIENT_ID",
  "NAVER_OPEN_API_CLIENT_SECRET",
  "NAVER_SEARCH_AD_ACCESS_LICENSE",
  "NAVER_SEARCH_AD_SECRET_KEY",
  "NAVER_SEARCH_AD_CUSTOMER_ID",
  "TALORDATA_API_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "CHROMIUM_EXECUTABLE_PATH",
]);

const FORBIDDEN_BY_PROFILE = Object.freeze({
  privacy: Object.freeze([
    ...NON_PRIVACY_RUNTIME_SECRETS,
    "PRIVACY_RETENTION_DATABASE_URL",
    "PRIVACY_RETENTION_POLICY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]),
  retention: Object.freeze([
    ...NON_PRIVACY_RUNTIME_SECRETS,
    "PRIVACY_DATABASE_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "APP_SECRET_PREVIOUS_KEYS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]),
  operator: Object.freeze([
    ...NON_PRIVACY_RUNTIME_SECRETS,
    "PRIVACY_DATABASE_URL",
    "PRIVACY_RETENTION_DATABASE_URL",
    "PRIVACY_RETENTION_POLICY",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "APP_SECRET_PREVIOUS_KEYS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]),
});

const DATABASE_KEYS = new Set([
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "OPERATOR_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "DISPATCHER_DATABASE_URL",
  "SCHEDULER_DATABASE_URL",
  "BILLING_DATABASE_URL",
  "BILLING_TENANT_DATABASE_URL",
  "PRIVACY_DATABASE_URL",
  "PRIVACY_RETENTION_DATABASE_URL",
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

const LEGAL_PLACEHOLDER_PATTERN =
  /(?:<[^>]+>|\b(?:todo|tbd|placeholder|change-me)\b|미정|추후\s*확정|법률\s*검토\s*후|최종\s*문서가\s*아님|example\.(?:com|org|net))/iu;

function isPublishedText(value, minimum = 2) {
  return isPresent(value) && value.trim().length >= minimum &&
    !LEGAL_PLACEHOLDER_PATTERN.test(value);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index]);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function isPublishedEmail(value) {
  return isPublishedText(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function everyExactPublishedItem(items, keys) {
  return Array.isArray(items) && items.every((item) =>
    hasExactKeys(item, keys) && keys.every((key) => isPublishedText(item[key]))
  );
}

function hasApprovedLegalReleaseManifest(raw) {
  if (!isPresent(raw) || raw.length > 64 * 1024) return false;
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return false;
  }
  const release = manifest?.release;
  const operator = manifest?.operator;
  const privacy = manifest?.privacy;
  const terms = manifest?.terms;
  if (
    !hasExactKeys(manifest, ["schemaVersion", "release", "operator", "privacy", "terms"]) ||
    !hasExactKeys(release, ["status", "documentVersion", "approvedAt", "approvedBy", "attestation"]) ||
    !hasExactKeys(operator, [
      "businessName",
      "representativeName",
      "businessRegistrationNumber",
      "mailOrderRegistration",
      "businessAddress",
      "supportEmail",
      "supportPhone",
    ]) ||
    !hasExactKeys(privacy, [
      "effectiveDate",
      "officerName",
      "contactEmail",
      "rightsRequestMethod",
      "deletionProcedure",
      "securityMeasures",
      "retentionRules",
      "processors",
      "thirdPartyDisclosures",
      "overseasTransfers",
    ]) ||
    !hasExactKeys(terms, [
      "effectiveDate",
      "priceKrw",
      "vatIncluded",
      "billingPeriod",
      "cancellationTiming",
      "refundPolicy",
      "withdrawalPolicy",
      "disputeProcedure",
    ]) ||
    manifest?.schemaVersion !== 1 ||
    release?.status !== "approved" ||
    release?.attestation !== "paid-beta-legal-review-approved" ||
    !/^\d{4}-\d{2}-\d{2}\.\d+$/u.test(release?.documentVersion ?? "") ||
    !isPublishedText(release?.approvedAt) || Number.isNaN(Date.parse(release?.approvedAt)) ||
    !isPublishedText(release?.approvedBy) ||
    !isPublishedText(operator?.businessName) ||
    !isPublishedText(operator?.representativeName) ||
    !/^\d{3}-\d{2}-\d{5}$/u.test(operator?.businessRegistrationNumber ?? "") ||
    !(operator?.mailOrderRegistration === null || (
      hasExactKeys(operator?.mailOrderRegistration, ["number", "authority"]) &&
      isPublishedText(operator.mailOrderRegistration.number) &&
      isPublishedText(operator.mailOrderRegistration.authority)
    )) ||
    !isPublishedText(operator?.businessAddress, 8) ||
    !isPublishedEmail(operator?.supportEmail) ||
    !/^[+0-9][0-9()+.\-\s]{6,30}$/u.test(operator?.supportPhone ?? "") ||
    !isIsoDate(privacy?.effectiveDate) ||
    !isPublishedText(privacy?.officerName) ||
    !isPublishedEmail(privacy?.contactEmail) ||
    !isPublishedText(privacy?.rightsRequestMethod, 10) ||
    !isPublishedText(privacy?.deletionProcedure, 10) ||
    !isPublishedText(privacy?.securityMeasures, 10) ||
    !everyExactPublishedItem(privacy?.retentionRules, ["category", "period", "basis"]) ||
    privacy?.retentionRules.length < 1 || privacy.retentionRules.length > 50 ||
    !everyExactPublishedItem(privacy?.processors, ["provider", "purpose", "retention"]) ||
    privacy?.processors.length > 50 ||
    !everyExactPublishedItem(privacy?.thirdPartyDisclosures, [
      "recipient",
      "purpose",
      "items",
      "retention",
    ]) ||
    privacy?.thirdPartyDisclosures.length > 50 ||
    !everyExactPublishedItem(privacy?.overseasTransfers, [
      "recipient",
      "country",
      "purpose",
      "items",
      "method",
      "timing",
      "retention",
    ]) ||
    privacy?.overseasTransfers.length > 50 ||
    terms?.priceKrw !== 49_000 ||
    terms?.vatIncluded !== true ||
    terms?.billingPeriod !== "monthly" ||
    terms?.cancellationTiming !== "end_of_current_period" ||
    !isIsoDate(terms?.effectiveDate) ||
    !isPublishedText(terms?.refundPolicy, 10) ||
    !isPublishedText(terms?.withdrawalPolicy, 10) ||
    !isPublishedText(terms?.disputeProcedure, 10)
  ) return false;
  return true;
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
  if (profile === "web" && environment.AUTH_TRUST_PROXY_HEADERS !== "true") {
    issues.push("AUTH_TRUST_PROXY_HEADERS must equal true for web");
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
  for (const key of FORBIDDEN_BY_PROFILE[profile] ?? []) {
    if (isPresent(environment[key])) {
      issues.push(`${key} is forbidden for ${profile}`);
    }
  }
  if (profile !== "operator" && isPresent(environment.OPERATOR_DATABASE_URL)) {
    issues.push("OPERATOR_DATABASE_URL is only allowed for the operator service");
  }
  if (
    profile === "web" &&
    isPresent(environment.LEGAL_RELEASE_MANIFEST) &&
    !hasApprovedLegalReleaseManifest(environment.LEGAL_RELEASE_MANIFEST)
  ) {
    issues.push("LEGAL_RELEASE_MANIFEST is not approved for paid beta");
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
