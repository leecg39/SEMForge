// @TASK P5-PRIVACY - Privacy operator CLI fail-closed contract
// @SPEC paid-beta privacy lifecycle blockers
// @TEST scripts/privacy/privacy.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("privacy CLI는 retention, subject export/correction, workspace closure adapter를 분리 조립한다", async () => {
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
  assert.match(source, /command === "delete-workspace"[\s\S]*erasureFence:\s*new PostgresWorkspacePrivacyFence\(db\)/u);
  assert.match(source, /privacy\.ts delete --workspace <uuid> --request <id> --operator <id> --subject-user <uuid>/u);
  assert.match(source, /subjectUserId:\s*command === "delete-workspace" \? null : required\(input,\s*"subject-user"\)/u);
  assert.match(
    source,
    /processorFactory:\s*\(exclusiveDb\)\s*=>\s*createProductionPrivacyProcessor\(\{\s*db:\s*exclusiveDb,\s*env:\s*process\.env/u,
  );
});
