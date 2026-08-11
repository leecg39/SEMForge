// @TASK P1-D1-T1 - Production startup environment validation contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import assert from "node:assert/strict";
import { test } from "node:test";

import { EnvironmentValidationError, parseServerEnv } from "@/lib/env";

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://semforge_web_login:test@db.example.com:5432/semforge",
  AUTH_DATABASE_URL: "postgresql://semforge_auth_login:test@db.example.com:5432/semforge",
  OPERATOR_DATABASE_URL: "postgresql://semforge_operator_login:test@db.example.com:5432/semforge",
  WORKER_DATABASE_URL: "postgresql://semforge_worker_login:test@db.example.com:5432/semforge",
  MIGRATION_DATABASE_URL: "postgresql://semforge_owner_login:test@db.example.com:5432/semforge",
  APP_PUBLIC_URL: "https://app.semforge.example",
  APP_SECRET: "production-secret-material-that-is-at-least-32-bytes",
  APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
};

test("production은 database, public URL, current encryption key를 모두 요구한다", () => {
  for (const missing of [
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "OPERATOR_DATABASE_URL",
    "WORKER_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "APP_PUBLIC_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
  ] as const) {
    const candidate = { ...productionEnv };
    delete candidate[missing];
    assert.throws(() => parseServerEnv(candidate), EnvironmentValidationError, missing);
  }
});

test("test mode는 외부 키 없이 명시적으로 실행할 수 있다", () => {
  const env = parseServerEnv({ NODE_ENV: "test" });
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.DATABASE_URL, undefined);
});

test("previous key map은 유효한 JSON object와 32-byte secret만 허용한다", () => {
  assert.throws(
    () => parseServerEnv({ ...productionEnv, APP_SECRET_PREVIOUS_KEYS: "[]" }),
    EnvironmentValidationError,
  );
  assert.throws(
    () =>
      parseServerEnv({
        ...productionEnv,
        APP_SECRET_PREVIOUS_KEYS: JSON.stringify({ old: "short" }),
      }),
    EnvironmentValidationError,
  );
});

test("production public URL은 https만 허용한다", () => {
  assert.throws(
    () => parseServerEnv({ ...productionEnv, APP_PUBLIC_URL: "http://app.semforge.example" }),
    EnvironmentValidationError,
  );
});
