// @TASK P5-PRIVACY - Privacy operator CLI fail-closed contract
// @SPEC paid-beta privacy lifecycle blockers
// @TEST scripts/privacy/privacy.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("delete CLI는 production processor 자격증명 누락 시 DB erasure 전에 exit 78 한다", () => {
  const environment = { ...process.env };
  for (const key of [
    "APP_SECRET",
    "APP_SECRET_CURRENT_KEY_ID",
    "APP_SECRET_PREVIOUS_KEYS",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) delete environment[key];
  environment.NODE_ENV = "test";
  environment.PRIVACY_DATABASE_URL = "postgresql://privacy:password@127.0.0.1:1/semforge";

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/privacy/privacy.ts",
      "delete",
      "--workspace",
      "10000000-0000-4000-8000-000000000001",
      "--request",
      "operator-request-1",
      "--operator",
      "privacy-operator",
    ],
    { cwd: process.cwd(), env: environment, encoding: "utf8", timeout: 10_000 },
  );

  assert.equal(result.status, 78);
  assert.match(result.stderr, /privacy processor configuration invalid/u);
  assert.doesNotMatch(result.stderr, /postgresql:\/\/privacy:password/u);
  assert.equal(result.stdout, "");
});
