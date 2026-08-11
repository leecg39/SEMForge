// @TASK P1-D1-T1 - Production startup environment validation contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
// @TASK P3-C2-T1 - NAVER production runtime credential validation contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
import assert from "node:assert/strict";
import { test } from "node:test";

import { EnvironmentValidationError, parseServerEnv } from "@/lib/env";

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://semforge_web_login:test@db.example.com:5432/semforge",
  AUTH_DATABASE_URL: "postgresql://semforge_auth_login:test@db.example.com:5432/semforge",
  OPERATOR_DATABASE_URL: "postgresql://semforge_operator_login:test@db.example.com:5432/semforge",
  WORKER_DATABASE_URL: "postgresql://semforge_worker_login:test@db.example.com:5432/semforge",
  BILLING_DATABASE_URL: "postgresql://semforge_billing_login:test@db.example.com:5432/semforge",
  MIGRATION_DATABASE_URL: "postgresql://semforge_owner_login:test@db.example.com:5432/semforge",
  APP_PUBLIC_URL: "https://app.semforge.example",
  APP_SECRET: "production-secret-material-that-is-at-least-32-bytes",
  APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
  TOSS_SECRET_KEY: "test_sk_semforge_toss_secret",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  NAVER_OPEN_API_CLIENT_ID: "test-naver-open-api-client-id",
  NAVER_OPEN_API_CLIENT_SECRET: "test-naver-open-api-client-secret",
  NAVER_SEARCH_AD_ACCESS_LICENSE: "test-naver-search-ad-access-license",
  NAVER_SEARCH_AD_SECRET_KEY: "test-naver-search-ad-secret-key",
  NAVER_SEARCH_AD_CUSTOMER_ID: "test-naver-search-ad-customer-id",
  BILLING_FINGERPRINT_SECRET: "billing-fingerprint-secret-at-least-32-bytes",
};

test("production은 database, encryption, billing, Google, NAVER 자격증명을 모두 요구한다", () => {
  for (const missing of [
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
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NAVER_OPEN_API_CLIENT_ID",
    "NAVER_OPEN_API_CLIENT_SECRET",
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
    "BILLING_FINGERPRINT_SECRET",
  ] as const) {
    const candidate = { ...productionEnv };
    delete candidate[missing];
    assert.throws(
      () => parseServerEnv(candidate),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.deepEqual(error.issues, [`${missing} is required in production`]);
        return true;
      },
    );
  }
});

test("test mode는 외부 키 없이 명시적으로 실행할 수 있다", () => {
  const env = parseServerEnv({ NODE_ENV: "test" });
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.AUTH_TRUST_PROXY_HEADERS, false);
  for (const optional of [
    "NAVER_OPEN_API_CLIENT_ID",
    "NAVER_OPEN_API_CLIENT_SECRET",
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
  ] as const) {
    assert.equal(env[optional], undefined);
  }
});

test("AUTH_TRUST_PROXY_HEADERS는 명시적인 true/false만 허용한다", () => {
  assert.equal(
    parseServerEnv({ NODE_ENV: "test", AUTH_TRUST_PROXY_HEADERS: "true" })
      .AUTH_TRUST_PROXY_HEADERS,
    true,
  );
  assert.throws(
    () => parseServerEnv({ NODE_ENV: "test", AUTH_TRUST_PROXY_HEADERS: "yes" }),
    EnvironmentValidationError,
  );
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

// @TASK P4-O1-T1 - Least-privilege production service startup profiles
test("migrate profile은 migration owner DSN과 verify-full TLS만으로 시작할 수 있다", () => {
  const env = parseServerEnv({
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "migrate",
    MIGRATION_DATABASE_URL: "postgresql://owner:test@db.example.com:5432/semforge",
    PGSSLMODE: "verify-full",
  });

  assert.equal(env.SEMFORGE_SERVICE, "migrate");
  assert.equal(env.MIGRATION_DATABASE_URL?.includes("owner"), true);
});

test("worker profile은 worker DB와 collector secret만 요구한다", () => {
  const workerEnv = {
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "worker",
    WORKER_DATABASE_URL: "postgresql://worker:test@db.example.com:5432/semforge",
    APP_SECRET: "production-secret-material-that-is-at-least-32-bytes",
    APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    NAVER_OPEN_API_CLIENT_ID: "test-naver-open-api-client-id",
    NAVER_OPEN_API_CLIENT_SECRET: "test-naver-open-api-client-secret",
    NAVER_SEARCH_AD_ACCESS_LICENSE: "test-naver-search-ad-access-license",
    NAVER_SEARCH_AD_SECRET_KEY: "test-naver-search-ad-secret-key",
    NAVER_SEARCH_AD_CUSTOMER_ID: "test-naver-search-ad-customer-id",
    TALORDATA_API_TOKEN: "test-talordata-token",
    PGSSLMODE: "verify-full",
  };
  assert.equal(parseServerEnv(workerEnv).SEMFORGE_SERVICE, "worker");

  const missingToken: Record<string, string | undefined> = { ...workerEnv };
  delete missingToken.TALORDATA_API_TOKEN;
  assert.throws(
    () => parseServerEnv(missingToken),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentValidationError);
      assert.deepEqual(error.issues, ["TALORDATA_API_TOKEN is required in production"]);
      return true;
    },
  );
});
