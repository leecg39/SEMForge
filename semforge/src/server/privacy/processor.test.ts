// @TASK P5-PRIVACY - Production privacy processor contract
// @SPEC paid-beta privacy lifecycle blockers
// @TEST src/server/privacy/processor.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretCrypto } from "@/lib/crypto";
import {
  createPrivacyProcessor,
  createProductionPrivacyProcessor,
  createProductionPrivacyRetentionProcessor,
  PrivacyProcessorConfigurationError,
} from "@/server/privacy/processor";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const connectionId = "20000000-0000-4000-8000-000000000002";
const requestUuid = "30000000-0000-4000-8000-000000000003";
const emailHash = "a".repeat(64);
const currentSecret = "privacy-processor-test-secret-value-0000000000000001";

test("GSC refresh token을 workspace/connection AAD로만 복호화해 Google revoke에 전달한다", async () => {
  const crypto = createSecretCrypto({ currentKeyId: "privacy-test-key", currentSecret });
  const revoked: string[] = [];
  const processor = createPrivacyProcessor({
    db: { async query() { return { rows: [] }; } },
    crypto,
    google: {
      async revokeToken(token) { revoked.push(token); },
    },
    storage: { async eraseAllVersions() {}, async eraseWorkspaceReportVersions() {} },
  });
  const encrypted = crypto.encrypt(
    "google-refresh-token",
    `workspace:${workspaceId}:gsc:${connectionId}:refresh-token`,
  );

  await processor.revokeGscConnection({
    workspaceId,
    connectionId,
    refreshTokenEncrypted: encrypted,
  });

  assert.deepEqual(revoked, ["google-refresh-token"]);
  await assert.rejects(
    processor.revokeGscConnection({
      workspaceId,
      connectionId: "20000000-0000-4000-8000-000000000099",
      refreshTokenEncrypted: encrypted,
    }),
    (error: unknown) => error instanceof Error && error.message === "PRIVACY_GSC_REVOKE_FAILED",
  );
  assert.deepEqual(revoked, ["google-refresh-token"]);
});

test("object 영구 삭제와 email_suppressions 저장을 실제 adapter seam에 위임한다", async () => {
  const erased: string[] = [];
  const statements: Array<{ text: string; values?: readonly unknown[] }> = [];
  const processor = createPrivacyProcessor({
    db: {
      async query(text, values) {
        statements.push({ text, values });
        return { rows: [] };
      },
    },
    crypto: { decryptOrThrow() { return "unused"; } },
    google: {
      async revokeToken() {},
    },
    storage: {
      async eraseAllVersions(key) { erased.push(key); },
      async eraseWorkspaceReportVersions(id) { erased.push(`workspace:${id}`); },
    },
  });

  await processor.deleteObject({ workspaceId, storageKey: "reports/workspace/report.pdf" });
  await processor.deleteWorkspaceObjects({ workspaceId });
  await processor.markEmailSuppressed({ workspaceId, emailHash, requestUuid });

  assert.deepEqual(erased, [
    "reports/workspace/report.pdf",
    `workspace:${workspaceId}`,
  ]);
  assert.equal(statements.length, 1);
  assert.match(statements[0]!.text, /privacy_add_email_suppression/u);
  assert.doesNotMatch(statements[0]!.text, /insert into email_suppressions/iu);
  assert.deepEqual(statements[0]!.values, [workspaceId, requestUuid, emailHash]);
});

test("provider와 DB 오류는 token, object key, recipient hash를 노출하지 않고 fail closed 한다", async () => {
  const secretToken = "private-google-refresh-token";
  const secretObject = "reports/private-customer/report.pdf";
  const processor = createPrivacyProcessor({
    db: { async query() { throw new Error(`db leaked ${emailHash}`); } },
    crypto: { decryptOrThrow() { return secretToken; } },
    google: {
      async revokeToken() { throw new Error(`google leaked ${secretToken}`); },
    },
    storage: {
      async eraseAllVersions() { throw new Error(`s3 leaked ${secretObject}`); },
      async eraseWorkspaceReportVersions() { throw new Error(`s3 leaked ${secretObject}`); },
    },
  });

  for (const [operation, expected] of [
    [processor.revokeGscConnection({ workspaceId, connectionId, refreshTokenEncrypted: "enc:v1" }), "PRIVACY_GSC_REVOKE_FAILED"],
    [processor.deleteObject({ workspaceId, storageKey: secretObject }), "PRIVACY_OBJECT_DELETE_FAILED"],
    [processor.markEmailSuppressed({ workspaceId, emailHash, requestUuid }), "PRIVACY_EMAIL_SUPPRESSION_FAILED"],
  ] as const) {
    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, expected);
      assert.doesNotMatch(error.message, /private|reports|aaaa/u);
      return true;
    });
  }
});

test("production processor는 필수 암호화/S3 설정이 하나라도 없으면 명확한 config 오류로 중단한다", () => {
  assert.throws(
    () => createProductionPrivacyProcessor({
      db: { async query() { return { rows: [] }; } },
      env: {},
    }),
    (error: unknown) => {
      assert.ok(error instanceof PrivacyProcessorConfigurationError);
      assert.deepEqual(error.issues, [
        "APP_SECRET",
        "APP_SECRET_CURRENT_KEY_ID",
        "S3_ACCESS_KEY_ID",
        "S3_BUCKET",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_SECRET_ACCESS_KEY",
      ]);
      assert.doesNotMatch(error.message, /secret-value|access-key-value/u);
      return true;
    },
  );
});

test("retention processor는 APP_SECRET 없이 S3 version erasure만 구성한다", async () => {
  const requests: Request[] = [];
  const processor = createProductionPrivacyRetentionProcessor({
    env: {
      S3_ENDPOINT: "https://objects.example.test",
      S3_REGION: "ap-northeast-2",
      S3_BUCKET: "semforge-private",
      S3_ACCESS_KEY_ID: "privacy-access-key",
      S3_SECRET_ACCESS_KEY: "privacy-secret-access-key",
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(
        "<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>",
        { status: 200 },
      );
    },
  });

  await processor.deleteWorkspaceObjects({ workspaceId });

  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => /versions=/u.test(request.url)));
});

test("retention processor 설정 오류에는 APP_SECRET가 포함되지 않는다", () => {
  assert.throws(
    () => createProductionPrivacyRetentionProcessor({ env: {} }),
    (error: unknown) => {
      assert.ok(error instanceof PrivacyProcessorConfigurationError);
      assert.deepEqual(error.issues, [
        "S3_ACCESS_KEY_ID",
        "S3_BUCKET",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_SECRET_ACCESS_KEY",
      ]);
      assert.equal(error.issues.includes("APP_SECRET"), false);
      return true;
    },
  );
});

test("production 조립은 Google 공식 revoke URL과 SigV4 version-list 경계를 사용한다", async () => {
  const requests: Request[] = [];
  const env = {
    APP_SECRET: currentSecret,
    APP_SECRET_CURRENT_KEY_ID: "privacy-test-key",
    S3_ENDPOINT: "https://objects.example.test",
    S3_REGION: "ap-northeast-2",
    S3_BUCKET: "semforge-private",
    S3_ACCESS_KEY_ID: "privacy-access-key",
    S3_SECRET_ACCESS_KEY: "privacy-secret-access-key",
  };
  const processor = createProductionPrivacyProcessor({
    db: { async query() { return { rows: [] }; } },
    env,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).hostname === "oauth2.googleapis.com") {
        return new Response(null, { status: 200 });
      }
      return new Response(
        "<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>",
        { status: 200 },
      );
    },
  });
  const crypto = createSecretCrypto({
    currentKeyId: env.APP_SECRET_CURRENT_KEY_ID,
    currentSecret: env.APP_SECRET,
  });

  await processor.revokeGscConnection({
    workspaceId,
    connectionId,
    refreshTokenEncrypted: crypto.encrypt(
      "production-refresh-token",
      `workspace:${workspaceId}:gsc:${connectionId}:refresh-token`,
    ),
  });
  await processor.deleteObject({ workspaceId, storageKey: "reports/workspace/report.pdf" });

  assert.equal(requests[0]!.url, "https://oauth2.googleapis.com/revoke");
  assert.equal(await requests[0]!.clone().text(), "token=production-refresh-token");
  assert.equal(
    requests[1]!.url,
    "https://objects.example.test/semforge-private?prefix=reports%2Fworkspace%2Freport.pdf&versions=",
  );
  assert.match(requests[1]!.headers.get("authorization") ?? "", /Credential=privacy-access-key\//u);
  assert.doesNotMatch(requests[1]!.headers.get("authorization") ?? "", /privacy-secret-access-key/u);
});
