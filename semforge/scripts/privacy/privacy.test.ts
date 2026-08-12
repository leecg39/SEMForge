// @TASK P5-PRIVACY - Privacy operator CLI fail-closed contract
// @SPEC paid-beta privacy lifecycle blockers
// @TEST scripts/privacy/privacy.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("privacy CLI는 retention adapter/DSN과 수동 삭제 exclusive fence를 분리 조립한다", async () => {
  const source = await readFile(
    path.join(process.cwd(), "scripts/privacy/privacy.ts"),
    "utf8",
  );

  assert.match(source, /createProductionPrivacyRetentionProcessor/u);
  assert.match(source, /PostgresWorkspacePrivacyFence/u);
  assert.match(source, /command === "retention"[\s\S]*getPool\("retention"\)/u);
  assert.match(
    source,
    /command === "retention"[\s\S]*createProductionPrivacyRetentionProcessor\(\{[^}]*env:\s*process\.env/u,
  );
  assert.match(
    source,
    /runPrivacyRetention\([\s\S]*processor:[\s\S]*deleteWorkspaceObjects/u,
  );
  assert.doesNotMatch(
    source.match(/if \(command === "retention"\)[\s\S]*?\n  \}/u)?.[0] ?? "",
    /createProductionPrivacyProcessor|APP_SECRET|deleteObject/u,
  );
  assert.match(source, /const db = getPool\("privacy"\)/u);
  assert.match(source, /erasureFence:\s*new PostgresWorkspacePrivacyFence\(db\)/u);
  assert.match(
    source,
    /processorFactory:\s*\(exclusiveDb\)\s*=>\s*createProductionPrivacyProcessor\(\{\s*db:\s*exclusiveDb,\s*env:\s*process\.env/u,
  );
});

test("delete entrypoint는 production processor 자격증명 누락 시 DB erasure 전에 exit 78 한다", () => {
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
  environment.NODE_ENV = "production";
  environment.SEMFORGE_SERVICE = "privacy";
  environment.PGSSLMODE = "verify-full";
  environment.PRIVACY_DATABASE_URL = "postgresql://privacy:password@127.0.0.1:1/semforge";

  const result = spawnSync(
    "/bin/sh",
    [
      "scripts/ops/docker-entrypoint.sh",
      "privacy-delete",
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
  assert.match(result.stderr, /runtime preflight failed/u);
  assert.match(result.stderr, /APP_SECRET is required/u);
  assert.doesNotMatch(result.stderr, /postgresql:\/\/privacy:password/u);
  assert.equal(result.stdout, "");
});
