// @TASK P1-D1-T1 - Fail-fast server environment validation
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import { z } from "zod";

const keyIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);
const secretSchema = z
  .string()
  .min(32)
  .refine((value) => value === value.trim(), "must not contain leading or trailing whitespace");
const booleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().trim().startsWith("postgresql://").optional(),
  // @TASK P1-D3 - Never reuse the migration owner DSN for auth or operator runtime access.
  AUTH_DATABASE_URL: z.string().trim().startsWith("postgresql://").optional(),
  OPERATOR_DATABASE_URL: z.string().trim().startsWith("postgresql://").optional(),
  WORKER_DATABASE_URL: z.string().trim().startsWith("postgresql://").optional(),
  BILLING_DATABASE_URL: z.string().trim().startsWith("postgresql://").optional(),
  MIGRATION_DATABASE_URL: z.string().trim().startsWith("postgresql://").optional(),
  APP_PUBLIC_URL: z.string().trim().url().optional(),
  AUTH_TRUST_PROXY_HEADERS: booleanStringSchema,
  APP_SECRET: secretSchema.optional(),
  APP_SECRET_CURRENT_KEY_ID: keyIdSchema.optional(),
  APP_SECRET_PREVIOUS_KEYS: z.string().optional(),
  TOSS_SECRET_KEY: z.string().trim().min(1).optional(),
  BILLING_FINGERPRINT_SECRET: secretSchema.optional(),
  PGPOOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PGPOOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  PGPOOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(30_000),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(30_000),
  PGSSLMODE: z.enum(["disable", "prefer", "require", "verify-full"]).default("verify-full"),
});

export type PreviousSecretKeys = Readonly<Record<string, string>>;

export class EnvironmentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`서버 환경변수 검증 실패: ${issues.join(", ")}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

export function parsePreviousSecretKeys(raw: string | undefined): PreviousSecretKeys {
  if (!raw?.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EnvironmentValidationError(["APP_SECRET_PREVIOUS_KEYS must be valid JSON"]);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new EnvironmentValidationError(["APP_SECRET_PREVIOUS_KEYS must be a JSON object"]);
  }

  const result: Record<string, string> = {};
  for (const [keyId, secret] of Object.entries(parsed)) {
    const keyResult = keyIdSchema.safeParse(keyId);
    const secretResult = secretSchema.safeParse(secret);
    if (!keyResult.success || !secretResult.success) {
      throw new EnvironmentValidationError([
        `APP_SECRET_PREVIOUS_KEYS.${keyId} must use a valid key id and a secret of at least 32 characters`,
      ]);
    }
    result[keyResult.data] = secretResult.data;
  }
  return result;
}

export type ServerEnv = Omit<z.infer<typeof rawServerEnvSchema>, "APP_SECRET_PREVIOUS_KEYS"> & {
  APP_SECRET_PREVIOUS_KEYS: PreviousSecretKeys;
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = rawServerEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvironmentValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const issues: string[] = [];
  if (parsed.data.NODE_ENV === "production") {
    for (const required of [
      "DATABASE_URL",
      "AUTH_DATABASE_URL",
      "OPERATOR_DATABASE_URL",
      "WORKER_DATABASE_URL",
      "BILLING_DATABASE_URL",
      "MIGRATION_DATABASE_URL",
      "APP_PUBLIC_URL",
      "APP_SECRET",
      "APP_SECRET_CURRENT_KEY_ID",
      "TOSS_SECRET_KEY",
      "BILLING_FINGERPRINT_SECRET",
    ] as const) {
      if (!parsed.data[required]) issues.push(`${required} is required in production`);
    }
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data.APP_PUBLIC_URL &&
    !parsed.data.APP_PUBLIC_URL.startsWith("https://")
  ) {
    issues.push("APP_PUBLIC_URL must use https in production");
  }
  if (issues.length > 0) throw new EnvironmentValidationError(issues);

  return {
    ...parsed.data,
    APP_SECRET_PREVIOUS_KEYS: parsePreviousSecretKeys(parsed.data.APP_SECRET_PREVIOUS_KEYS),
  };
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

export function resetServerEnvForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetServerEnvForTests는 NODE_ENV=test에서만 사용할 수 있습니다.");
  }
  cachedEnv = undefined;
}
