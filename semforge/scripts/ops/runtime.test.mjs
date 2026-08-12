// @TASK P4-O1-T1 - Startup preflight and graceful signal contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/runtime.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  RuntimeConfigurationError,
  installShutdownSignalBridge,
  validateRuntimeEnvironment,
} from "./runtime.mjs";

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

const validWebEnvironment = {
  NODE_ENV: "production",
  SEMFORGE_SERVICE: "web",
  PGSSLMODE: "verify-full",
  DATABASE_URL: "postgresql://web:password@db.example.com/semforge",
  AUTH_DATABASE_URL: "postgresql://auth:password@db.example.com/semforge",
  WORKER_DATABASE_URL: "postgresql://worker:password@db.example.com/semforge",
  DISPATCHER_DATABASE_URL: "postgresql://dispatcher:password@db.example.com/semforge",
  SCHEDULER_DATABASE_URL: "postgresql://scheduler:password@db.example.com/semforge",
  BILLING_DATABASE_URL: "postgresql://billing:password@db.example.com/semforge",
  BILLING_TENANT_DATABASE_URL:
    "postgresql://billing-tenant:password@db.example.com/semforge",
  PRIVACY_DATABASE_URL: "postgresql://privacy:password@db.example.com/semforge",
  MIGRATION_DATABASE_URL: "postgresql://owner:password@db.example.com/semforge",
  APP_PUBLIC_URL: "https://app.semforge.example",
  AUTH_TRUST_PROXY_HEADERS: "true",
  APP_SECRET: "app-secret-material-that-is-at-least-32-bytes",
  APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
  TOSS_CLIENT_KEY: "test_ck_semforge_toss_client",
  TOSS_SECRET_KEY: "test-toss-secret",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  NAVER_OPEN_API_CLIENT_ID: "naver-client-id",
  NAVER_OPEN_API_CLIENT_SECRET: "naver-client-secret",
  NAVER_SEARCH_AD_ACCESS_LICENSE: "naver-license",
  NAVER_SEARCH_AD_SECRET_KEY: "naver-search-secret",
  NAVER_SEARCH_AD_CUSTOMER_ID: "naver-customer",
  TALORDATA_API_TOKEN: "talordata-token",
  BILLING_FINGERPRINT_SECRET: "billing-fingerprint-secret-at-least-32-bytes",
  S3_ENDPOINT: "https://objects.semforge.example",
  S3_REGION: "ap-northeast-2",
  S3_BUCKET: "semforge-private",
  S3_ACCESS_KEY_ID: "semforge-web-access-key",
  S3_SECRET_ACCESS_KEY: "semforge-web-secret-key",
  LEGAL_RELEASE_MANIFEST: approvedLegalReleaseManifest,
  PRIVACY_RETENTION_POLICY: JSON.stringify({
    expiredSessionsDays: 30,
    consumedInvitesDays: 30,
    passwordResetsDays: 7,
    oauthStatesDays: 7,
    publishedOutboxDays: 30,
    terminalJobsDays: 30,
    providerRawMetadataDays: 30,
    deliveryRecipientDays: 90,
  }),
};

const validWorkerEnvironment = {
  ...validWebEnvironment,
  SEMFORGE_SERVICE: "worker",
  RESEND_API_KEY: "re_worker_delivery_key",
  RESEND_FROM_EMAIL: "SEMForge <reports@semforge.example>",
  CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",
};

const validPrivacyEnvironment = {
  NODE_ENV: "production",
  SEMFORGE_SERVICE: "privacy",
  PGSSLMODE: "verify-full",
  PRIVACY_DATABASE_URL: "postgresql://privacy:password@db.example.com/semforge",
  PRIVACY_RETENTION_POLICY: validWebEnvironment.PRIVACY_RETENTION_POLICY,
  APP_SECRET: "privacy-secret-material-that-is-at-least-32-bytes",
  APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
  S3_ENDPOINT: "https://objects.semforge.example",
  S3_REGION: "ap-northeast-2",
  S3_BUCKET: "semforge-private",
  S3_ACCESS_KEY_ID: "semforge-privacy-access-key",
  S3_SECRET_ACCESS_KEY: "semforge-privacy-secret-key",
};

test("web preflight는 필수 secret 누락을 값 없이 한 번에 보고한다", () => {
  const candidate = { ...validWebEnvironment };
  delete candidate.APP_SECRET;
  delete candidate.TOSS_SECRET_KEY;
  delete candidate.LEGAL_RELEASE_MANIFEST;

  assert.throws(
    () => validateRuntimeEnvironment("web", candidate),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, [
        "LEGAL_RELEASE_MANIFEST is required",
        "APP_SECRET is required",
        "TOSS_SECRET_KEY is required",
      ]);
      assert.doesNotMatch(error.message, /password|google-client-id|talordata-token/u);
      return true;
    },
  );
});

test("privacy preflight는 DB·retention·암호화·객체 삭제 자격증명을 요구한다", () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment("privacy", validPrivacyEnvironment));

  for (const missing of [
    "PRIVACY_DATABASE_URL",
    "PRIVACY_RETENTION_POLICY",
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) {
    const candidate = { ...validPrivacyEnvironment };
    delete candidate[missing];
    assert.throws(
      () => validateRuntimeEnvironment("privacy", candidate),
      (error) => {
        assert.ok(error instanceof RuntimeConfigurationError);
        assert.deepEqual(error.issues, [`${missing} is required`]);
        return true;
      },
    );
  }
});

test("privacy preflight는 Google client credential 없이 token revoke를 허용한다", () => {
  const candidate = { ...validPrivacyEnvironment };
  delete candidate.GOOGLE_CLIENT_ID;
  delete candidate.GOOGLE_CLIENT_SECRET;
  assert.doesNotThrow(() => validateRuntimeEnvironment("privacy", candidate));
});

test("privacy entrypoint는 필수 secret 누락 시 EX_CONFIG로 종료한다", () => {
  const candidate = { ...validPrivacyEnvironment };
  delete candidate.APP_SECRET;
  const result = spawnSync(
    "/bin/sh",
    ["scripts/ops/docker-entrypoint.sh", "privacy-retention"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...candidate },
    },
  );

  assert.equal(result.status, 78);
  assert.match(result.stderr, /runtime preflight failed/u);
  assert.match(result.stderr, /APP_SECRET is required/u);
});

test("web preflight는 signed URL용 S3 credentials만 report secret으로 요구한다", () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment("web", validWebEnvironment));
  for (const missing of [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) {
    const candidate = { ...validWebEnvironment };
    delete candidate[missing];
    assert.throws(
      () => validateRuntimeEnvironment("web", candidate),
      (error) => {
        assert.ok(error instanceof RuntimeConfigurationError);
        assert.deepEqual(error.issues, [`${missing} is required`]);
        return true;
      },
    );
  }
});

test("web preflight는 operator CLI DSN을 받지 않고 tenant/global billing DSN을 분리한다", () => {
  const withoutOperator = { ...validWebEnvironment };
  delete withoutOperator.OPERATOR_DATABASE_URL;
  assert.doesNotThrow(() => validateRuntimeEnvironment("web", withoutOperator));
  assert.throws(
    () => validateRuntimeEnvironment("web", {
      ...validWebEnvironment,
      OPERATOR_DATABASE_URL: "postgresql://operator:password@db.example.com/semforge",
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, [
        "OPERATOR_DATABASE_URL is only allowed for the operator service",
      ]);
      return true;
    },
  );

  for (const missing of ["BILLING_DATABASE_URL", "BILLING_TENANT_DATABASE_URL"]) {
    const candidate = { ...withoutOperator };
    delete candidate[missing];
    assert.throws(
      () => validateRuntimeEnvironment("web", candidate),
      (error) => {
        assert.ok(error instanceof RuntimeConfigurationError);
        assert.deepEqual(error.issues, [`${missing} is required`]);
        return true;
      },
    );
  }
});

test("web preflight는 Toss 자동결제 client key를 시작 전에 요구한다", () => {
  const candidate = { ...validWebEnvironment };
  delete candidate.TOSS_CLIENT_KEY;

  assert.throws(
    () => validateRuntimeEnvironment("web", candidate),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["TOSS_CLIENT_KEY is required"]);
      return true;
    },
  );
});

test("web preflight는 승인된 법률 manifest가 없거나 placeholder이면 유료 런타임을 차단한다", () => {
  const missing = { ...validWebEnvironment };
  delete missing.LEGAL_RELEASE_MANIFEST;
  assert.throws(
    () => validateRuntimeEnvironment("web", missing),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["LEGAL_RELEASE_MANIFEST is required"]);
      return true;
    },
  );

  assert.throws(
    () => validateRuntimeEnvironment("web", {
      ...validWebEnvironment,
      LEGAL_RELEASE_MANIFEST: approvedLegalReleaseManifest.replace(
        "검증용 주식회사",
        "미정",
      ),
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["LEGAL_RELEASE_MANIFEST is not approved for paid beta"]);
      return true;
    },
  );

  const incomplete = JSON.parse(approvedLegalReleaseManifest);
  incomplete.privacy.retentionRules = [{ category: "계정 정보" }];
  assert.throws(
    () => validateRuntimeEnvironment("web", {
      ...validWebEnvironment,
      LEGAL_RELEASE_MANIFEST: JSON.stringify(incomplete),
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["LEGAL_RELEASE_MANIFEST is not approved for paid beta"]);
      return true;
    },
  );

  const unknownField = JSON.parse(approvedLegalReleaseManifest);
  unknownField.release.unreviewedOverride = true;
  assert.throws(
    () => validateRuntimeEnvironment("web", {
      ...validWebEnvironment,
      LEGAL_RELEASE_MANIFEST: JSON.stringify(unknownField),
    }),
    RuntimeConfigurationError,
  );
});

test("web preflight는 trusted nginx proxy header mode를 명시적으로 요구한다", () => {
  assert.throws(
    () => validateRuntimeEnvironment("web", {
      ...validWebEnvironment,
      AUTH_TRUST_PROXY_HEADERS: "false",
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, [
        "AUTH_TRUST_PROXY_HEADERS must equal true for web",
      ]);
      return true;
    },
  );
});

test("production preflight는 PostgreSQL verify-full 외 TLS 설정을 거부한다", () => {
  assert.throws(
    () => validateRuntimeEnvironment("worker", {
      ...validWorkerEnvironment,
      PGSSLMODE: "require",
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["PGSSLMODE must be verify-full in production"]);
      return true;
    },
  );
});

test("production preflight는 DSN query의 sslmode 우회를 거부한다", () => {
  assert.throws(
    () => validateRuntimeEnvironment("worker", {
      ...validWorkerEnvironment,
      WORKER_DATABASE_URL:
        "postgresql://worker:password@db.example.com/semforge?sslmode=disable",
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, [
        "WORKER_DATABASE_URL sslmode must be verify-full when present",
      ]);
      return true;
    },
  );
});

test("migration preflight는 owner DSN만 요구하고 서비스 secret을 요구하지 않는다", () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment("migrate", {
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "migrate",
    PGSSLMODE: "verify-full",
    MIGRATION_DATABASE_URL: "postgresql://owner:password@db.example.com/semforge",
  }));
});

test("worker preflight는 dispatcher와 tenant DB를 요구하지만 scheduler DB는 요구하지 않는다", () => {
  const workerEnvironment = {
    ...validWorkerEnvironment,
  };
  delete workerEnvironment.SCHEDULER_DATABASE_URL;

  assert.doesNotThrow(() => validateRuntimeEnvironment("worker", workerEnvironment));

  delete workerEnvironment.DISPATCHER_DATABASE_URL;
  assert.throws(
    () => validateRuntimeEnvironment("worker", workerEnvironment),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["DISPATCHER_DATABASE_URL is required"]);
      return true;
    },
  );
});

test("worker preflight는 report 생성·전송에 필요한 auth·URL·Resend·S3·Chromium을 요구한다", () => {
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
  ]) {
    const candidate = { ...validWorkerEnvironment };
    delete candidate[missing];
    assert.throws(
      () => validateRuntimeEnvironment("worker", candidate),
      (error) => {
        assert.ok(error instanceof RuntimeConfigurationError);
        assert.deepEqual(error.issues, [`${missing} is required`]);
        return true;
      },
    );
  }
});

test("relay와 scheduler preflight는 분리된 DB role만으로 시작한다", () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment("relay", {
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "relay",
    PGSSLMODE: "verify-full",
    DISPATCHER_DATABASE_URL: "postgresql://dispatcher:password@db.example.com/semforge",
  }));
  assert.doesNotThrow(() => validateRuntimeEnvironment("scheduler", {
    NODE_ENV: "production",
    SEMFORGE_SERVICE: "scheduler",
    PGSSLMODE: "verify-full",
    SCHEDULER_DATABASE_URL: "postgresql://scheduler:password@db.example.com/semforge",
  }));
});

test("preflight는 image profile과 SEMFORGE_SERVICE 불일치를 거부한다", () => {
  assert.throws(
    () => validateRuntimeEnvironment("worker", {
      ...validWorkerEnvironment,
      SEMFORGE_SERVICE: "web",
    }),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, ["SEMFORGE_SERVICE must equal worker"]);
      return true;
    },
  );
});

test("SIGTERM과 SIGINT는 worker AbortSignal을 한 번만 중단하고 listener를 정리한다", () => {
  const processEvents = new EventEmitter();
  const controller = new AbortController();
  const received = [];
  const cleanup = installShutdownSignalBridge(
    processEvents,
    controller,
    (signal) => received.push(signal),
  );

  processEvents.emit("SIGTERM");
  processEvents.emit("SIGINT");

  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason, "SIGTERM");
  assert.deepEqual(received, ["SIGTERM"]);
  cleanup();
  assert.equal(processEvents.listenerCount("SIGTERM"), 0);
  assert.equal(processEvents.listenerCount("SIGINT"), 0);
});
