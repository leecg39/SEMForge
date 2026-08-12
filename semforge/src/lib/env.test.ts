// @TASK P1-D1-T1 - Production startup environment validation contract
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
// @TASK P3-C2-T1 - NAVER production runtime credential validation contract
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
import assert from "node:assert/strict";
import { test } from "node:test";

import { EnvironmentValidationError, parseServerEnv } from "@/lib/env";

const approvedLegalReleaseManifest = JSON.stringify({
  schemaVersion: 1,
  release: {
    status: "approved",
    documentVersion: "2026-08-12.1",
    approvedAt: "2026-08-12T09:00:00+09:00",
    approvedBy: "법무 검토 책임자",
    attestation: "paid-beta-legal-review-approved",
  },
  operator: {
    businessName: "검증용 주식회사",
    representativeName: "검증 책임자",
    businessRegistrationNumber: "123-45-67890",
    mailOrderRegistration: null,
    businessAddress: "서울특별시 검증구 검증로 100",
    supportEmail: "support@approved-fixture.co.kr",
    supportPhone: "02-1234-5678",
  },
  privacy: {
    effectiveDate: "2026-08-19",
    officerName: "개인정보 보호책임자",
    contactEmail: "privacy@approved-fixture.co.kr",
    rightsRequestMethod: "개인정보 문의 이메일로 본인 확인 후 요청합니다.",
    deletionProcedure: "목적 달성 후 복구할 수 없는 방식으로 지체 없이 파기합니다.",
    securityMeasures: "접근 권한 통제, 전송구간 보호, 암호화와 감사 로그를 운영합니다.",
    retentionRules: [{ category: "계정 정보", period: "계약 종료 후 30일", basis: "계약 이행" }],
    processors: [],
    thirdPartyDisclosures: [],
    overseasTransfers: [],
  },
  terms: {
    effectiveDate: "2026-08-19",
    priceKrw: 49000,
    vatIncluded: true,
    billingPeriod: "monthly",
    cancellationTiming: "end_of_current_period",
    refundPolicy: "중복·오류 결제와 법정 환불 사유를 확인한 뒤 처리합니다.",
    withdrawalPolicy: "관련 법령상 청약철회 가능 여부와 절차를 개별 안내합니다.",
    disputeProcedure: "고객지원 문의 후 합의가 되지 않으면 관할 절차를 따릅니다.",
  },
});

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://semforge_web_login:test@db.example.com:5432/semforge",
  AUTH_DATABASE_URL: "postgresql://semforge_auth_login:test@db.example.com:5432/semforge",
  OPERATOR_DATABASE_URL: "postgresql://semforge_operator_login:test@db.example.com:5432/semforge",
  WORKER_DATABASE_URL: "postgresql://semforge_worker_login:test@db.example.com:5432/semforge",
  DISPATCHER_DATABASE_URL: "postgresql://semforge_dispatcher_login:test@db.example.com:5432/semforge",
  SCHEDULER_DATABASE_URL: "postgresql://semforge_scheduler_login:test@db.example.com:5432/semforge",
  BILLING_DATABASE_URL: "postgresql://semforge_billing_login:test@db.example.com:5432/semforge",
  MIGRATION_DATABASE_URL: "postgresql://semforge_owner_login:test@db.example.com:5432/semforge",
  APP_PUBLIC_URL: "https://app.semforge.example",
  APP_SECRET: "production-secret-material-that-is-at-least-32-bytes",
  APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
  TOSS_CLIENT_KEY: "test_ck_semforge_toss_client",
  TOSS_SECRET_KEY: "test_sk_semforge_toss_secret",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  TALORDATA_API_TOKEN: "test-talordata-api-token",
  NAVER_OPEN_API_CLIENT_ID: "test-naver-open-api-client-id",
  NAVER_OPEN_API_CLIENT_SECRET: "test-naver-open-api-client-secret",
  NAVER_SEARCH_AD_ACCESS_LICENSE: "test-naver-search-ad-access-license",
  NAVER_SEARCH_AD_SECRET_KEY: "test-naver-search-ad-secret-key",
  NAVER_SEARCH_AD_CUSTOMER_ID: "test-naver-search-ad-customer-id",
  BILLING_FINGERPRINT_SECRET: "billing-fingerprint-secret-at-least-32-bytes",
  RESEND_API_KEY: "re_production_delivery_key",
  RESEND_FROM_EMAIL: "SEMForge <reports@semforge.example>",
  S3_ENDPOINT: "https://objects.semforge.example",
  S3_REGION: "ap-northeast-2",
  S3_BUCKET: "semforge-private",
  S3_ACCESS_KEY_ID: "semforge-production-access-key",
  S3_SECRET_ACCESS_KEY: "semforge-production-secret-key-material",
  CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",
  LEGAL_RELEASE_MANIFEST: approvedLegalReleaseManifest,
};

test("production은 database, encryption, billing, Google, NAVER 자격증명을 모두 요구한다", () => {
  for (const missing of [
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "OPERATOR_DATABASE_URL",
    "WORKER_DATABASE_URL",
    "DISPATCHER_DATABASE_URL",
    "SCHEDULER_DATABASE_URL",
    "BILLING_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "APP_PUBLIC_URL",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "TOSS_CLIENT_KEY",
    "TOSS_SECRET_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "TALORDATA_API_TOKEN",
    "NAVER_OPEN_API_CLIENT_ID",
    "NAVER_OPEN_API_CLIENT_SECRET",
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
    "BILLING_FINGERPRINT_SECRET",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHROMIUM_EXECUTABLE_PATH",
    "LEGAL_RELEASE_MANIFEST",
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

test("worker profile은 dispatcher claim DB와 tenant worker DB를 분리해 요구한다", () => {
  const workerEnv = {
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "worker",
    AUTH_DATABASE_URL: "postgresql://auth:test@db.example.com:5432/semforge",
    WORKER_DATABASE_URL: "postgresql://worker:test@db.example.com:5432/semforge",
    DISPATCHER_DATABASE_URL: "postgresql://dispatcher:test@db.example.com:5432/semforge",
    APP_PUBLIC_URL: "https://app.semforge.example",
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
    RESEND_API_KEY: "re_test_worker_key",
    RESEND_FROM_EMAIL: "SEMForge <reports@semforge.example>",
    S3_ENDPOINT: "https://objects.semforge.example",
    S3_REGION: "ap-northeast-2",
    S3_BUCKET: "semforge-private",
    S3_ACCESS_KEY_ID: "semforge-worker-access-key",
    S3_SECRET_ACCESS_KEY: "semforge-worker-secret-key",
    CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",
    PGSSLMODE: "verify-full",
  };
  assert.equal(parseServerEnv(workerEnv).SEMFORGE_SERVICE, "worker");

  for (const missing of [
    "AUTH_DATABASE_URL",
    "APP_PUBLIC_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHROMIUM_EXECUTABLE_PATH",
  ] as const) {
    const candidate: Record<string, string | undefined> = { ...workerEnv };
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

  const missingDispatcher: Record<string, string | undefined> = { ...workerEnv };
  delete missingDispatcher.DISPATCHER_DATABASE_URL;
  assert.throws(
    () => parseServerEnv(missingDispatcher),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentValidationError);
      assert.deepEqual(error.issues, ["DISPATCHER_DATABASE_URL is required in production"]);
      return true;
    },
  );

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

  assert.throws(
    () => parseServerEnv({
      ...workerEnv,
      WORKER_DATABASE_URL:
        "postgresql://worker:test@db.example.com:5432/semforge?sslmode=disable",
    }),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentValidationError);
      assert.deepEqual(error.issues, [
        "WORKER_DATABASE_URL sslmode must be verify-full when present",
      ]);
      return true;
    },
  );
});

test("web profile은 signed URL용 S3 credentials만 요구하고 email·Chromium secret은 요구하지 않는다", () => {
  const webEnv: Record<string, string | undefined> = {
    ...productionEnv,
    SEMFORGE_SERVICE: "web",
  };
  for (const unnecessary of [
    "WORKER_DATABASE_URL",
    "DISPATCHER_DATABASE_URL",
    "SCHEDULER_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "TALORDATA_API_TOKEN",
    "NAVER_OPEN_API_CLIENT_ID",
    "NAVER_OPEN_API_CLIENT_SECRET",
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "CHROMIUM_EXECUTABLE_PATH",
  ] as const) {
    delete webEnv[unnecessary];
  }

  const parsed = parseServerEnv(webEnv);
  assert.equal(parsed.SEMFORGE_SERVICE, "web");
  assert.equal(parsed.RESEND_API_KEY, undefined);
  assert.equal(parsed.CHROMIUM_EXECUTABLE_PATH, undefined);

  for (const missing of [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const) {
    const candidate = { ...webEnv };
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

test("relay와 scheduler profile은 각자의 최소권한 PostgreSQL 역할만 요구한다", () => {
  const relay = parseServerEnv({
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "relay",
    DISPATCHER_DATABASE_URL: "postgresql://dispatcher:test@db.example.com:5432/semforge",
    PGSSLMODE: "verify-full",
  });
  assert.equal(relay.SEMFORGE_SERVICE, "relay");
  assert.equal(relay.WORKER_DATABASE_URL, undefined);
  assert.equal(relay.SCHEDULER_DATABASE_URL, undefined);

  const scheduler = parseServerEnv({
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "scheduler",
    SCHEDULER_DATABASE_URL: "postgresql://scheduler:test@db.example.com:5432/semforge",
    PGSSLMODE: "verify-full",
  });
  assert.equal(scheduler.SEMFORGE_SERVICE, "scheduler");
  assert.equal(scheduler.WORKER_DATABASE_URL, undefined);
  assert.equal(scheduler.DISPATCHER_DATABASE_URL, undefined);
});

test("build profile은 image build 중 운영 secret을 읽지 않는다", () => {
  const env = parseServerEnv({
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "build",
    PGSSLMODE: "verify-full",
  });

  assert.equal(env.SEMFORGE_SERVICE, "build");
  assert.equal(env.DATABASE_URL, undefined);
});

test("production web과 all은 승인된 법률 release manifest 없이는 시작하지 않는다", () => {
  for (const service of ["web", "all"] as const) {
    const candidate: Record<string, string | undefined> = {
      ...productionEnv,
      SEMFORGE_SERVICE: service,
    };
    delete candidate.LEGAL_RELEASE_MANIFEST;
    assert.throws(
      () => parseServerEnv(candidate),
      (error: unknown) => {
        assert.ok(error instanceof EnvironmentValidationError);
        assert.deepEqual(error.issues, [
          "LEGAL_RELEASE_MANIFEST is required in production",
        ]);
        return true;
      },
    );
  }
});

test("production web은 손상되거나 placeholder인 법률 manifest를 거부한다", () => {
  for (const invalid of [
    "{",
    approvedLegalReleaseManifest.replace("검증용 주식회사", "TODO"),
  ]) {
    assert.throws(
      () => parseServerEnv({
        ...productionEnv,
        SEMFORGE_SERVICE: "web",
        LEGAL_RELEASE_MANIFEST: invalid,
      }),
      EnvironmentValidationError,
    );
  }
});

test("production object storage endpoint는 https만 허용한다", () => {
  assert.throws(
    () => parseServerEnv({ ...productionEnv, S3_ENDPOINT: "http://objects.semforge.example" }),
    EnvironmentValidationError,
  );
});
