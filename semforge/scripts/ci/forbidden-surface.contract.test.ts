import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const scanner = path.join(process.cwd(), "scripts/ci/forbidden-surface.mjs");

function runScanner(source: string) {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "semforge-forbidden-surface-"));
  mkdirSync(path.join(projectRoot, "scripts/license"), { recursive: true });
  writeFileSync(path.join(projectRoot, "scripts/license/source.json"), source, "utf8");
  try {
    const result = spawnSync(process.execPath, [scanner], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    const evidence = JSON.parse(readFileSync(
      path.join(projectRoot, ".omo/evidence/phase5-ci/latest/forbidden-surface.json"),
      "utf8",
    )) as { status: string; forbiddenContents: readonly unknown[] };
    return { result, evidence };
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("외부 HTTPS source URL의 API 경로는 SEMForge legacy API로 오인하지 않는다", () => {
  const { result, evidence } = runScanner(JSON.stringify({
    url: "https://gitlab.com/api/v4/projects/4720790/repository/archive.tar.gz?sha=d01a94b",
  }));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(evidence.status, "passed");
  assert.deepEqual(evidence.forbiddenContents, []);
});

test("내부 legacy API 경로는 계속 차단한다", () => {
  const { result, evidence } = runScanner(JSON.stringify({ endpoint: "/api/v2/legacy" }));

  assert.equal(result.status, 1);
  assert.equal(evidence.status, "failed");
  assert.deepEqual(evidence.forbiddenContents, [
    { file: "scripts/license/source.json", label: "legacy API namespace" },
  ]);
});
