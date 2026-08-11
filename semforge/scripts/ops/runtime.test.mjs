// @TASK P4-O1-T1 - Startup preflight and graceful signal contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/runtime.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  RuntimeConfigurationError,
  installShutdownSignalBridge,
  validateRuntimeEnvironment,
} from "./runtime.mjs";

const validWebEnvironment = {
  NODE_ENV: "production",
  SEMFORGE_SERVICE: "web",
  PGSSLMODE: "verify-full",
  DATABASE_URL: "postgresql://web:password@db.example.com/semforge",
  AUTH_DATABASE_URL: "postgresql://auth:password@db.example.com/semforge",
  OPERATOR_DATABASE_URL: "postgresql://operator:password@db.example.com/semforge",
  WORKER_DATABASE_URL: "postgresql://worker:password@db.example.com/semforge",
  DISPATCHER_DATABASE_URL: "postgresql://dispatcher:password@db.example.com/semforge",
  SCHEDULER_DATABASE_URL: "postgresql://scheduler:password@db.example.com/semforge",
  BILLING_DATABASE_URL: "postgresql://billing:password@db.example.com/semforge",
  MIGRATION_DATABASE_URL: "postgresql://owner:password@db.example.com/semforge",
  APP_PUBLIC_URL: "https://app.semforge.example",
  APP_SECRET: "app-secret-material-that-is-at-least-32-bytes",
  APP_SECRET_CURRENT_KEY_ID: "key-2026-08",
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
};

test("web preflight는 필수 secret 누락을 값 없이 한 번에 보고한다", () => {
  const candidate = { ...validWebEnvironment };
  delete candidate.APP_SECRET;
  delete candidate.TOSS_SECRET_KEY;

  assert.throws(
    () => validateRuntimeEnvironment("web", candidate),
    (error) => {
      assert.ok(error instanceof RuntimeConfigurationError);
      assert.deepEqual(error.issues, [
        "APP_SECRET is required",
        "TOSS_SECRET_KEY is required",
      ]);
      assert.doesNotMatch(error.message, /password|google-client-id|talordata-token/u);
      return true;
    },
  );
});

test("production preflight는 PostgreSQL verify-full 외 TLS 설정을 거부한다", () => {
  assert.throws(
    () => validateRuntimeEnvironment("worker", {
      ...validWebEnvironment,
      SEMFORGE_SERVICE: "worker",
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
      ...validWebEnvironment,
      SEMFORGE_SERVICE: "worker",
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
    ...validWebEnvironment,
    SEMFORGE_SERVICE: "worker",
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
    () => validateRuntimeEnvironment("worker", validWebEnvironment),
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
