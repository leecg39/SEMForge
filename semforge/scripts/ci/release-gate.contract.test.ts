// @TASK P5-Q1-T1 - CI release gate 재현 하네스
// @SPEC SEMForge paid beta plan#테스트-및-승인-기준
// @TEST scripts/ci/release-gate.contract.test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const repoRoot = path.resolve(projectRoot, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("release gate는 CI에서 호출 가능한 단일 npm entrypoint로 고정된다", () => {
  const manifest = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

  assert.equal(manifest.scripts?.["ci:release-gate"], "node scripts/ci/run-release-gate.mjs");
  assert.equal(fs.existsSync(path.join(projectRoot, "scripts/ci/run-release-gate.mjs")), true);
});

test("release gate runner는 필수 검증 단계와 evidence 산출물을 선언한다", () => {
  const runner = read("scripts/ci/run-release-gate.mjs");

  const requiredLiterals = [
    "node-version",
    "npm run verify",
    "npm run build",
    "npm audit --audit-level=high",
    "npm audit --omit=dev --audit-level=high",
    "npm run license:check",
    "npm run db:generate",
    "git diff --exit-code",
    "git diff --check",
    "npm run ci:route-manifest",
    "npm run ci:forbidden-surface",
    "npm run ci:pg16",
    "npm run ci:nine-site",
    "summary.json",
  ];

  assert.deepEqual(
    requiredLiterals.filter((literal) => !runner.includes(literal)),
    [],
  );
});

test("route/forbidden-surface와 3파트너 9사이트 harness는 직접 실행 가능한 npm entrypoint다", () => {
  const manifest = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

  assert.equal(manifest.scripts?.["ci:route-manifest"], "node scripts/ci/route-manifest.mjs");
  assert.equal(manifest.scripts?.["ci:forbidden-surface"], "node scripts/ci/forbidden-surface.mjs");
  assert.equal(manifest.scripts?.["ci:nine-site"], "node scripts/ci/nine-site-harness.mjs");
  assert.equal(fs.existsSync(path.join(projectRoot, "scripts/ci/route-manifest.mjs")), true);
  assert.equal(fs.existsSync(path.join(projectRoot, "scripts/ci/forbidden-surface.mjs")), true);
  assert.equal(fs.existsSync(path.join(projectRoot, "scripts/ci/nine-site-harness.mjs")), true);
});

test("route manifest는 계획에 고정된 NAVER와 AIO 읽기 API를 포함한다", () => {
  const manifest = read("scripts/ci/route-manifest.mjs");

  assert.match(manifest, /"\/api\/v1\/insights\/naver"/);
  assert.match(manifest, /"\/api\/v1\/visibility\/aio"/);
});

test("GitHub Actions workflow는 Node 24, PostgreSQL 16, Chromium을 release gate에 공급한다", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "release-gate.yml"), "utf8");

  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /CHROMIUM_EXECUTABLE_PATH/);
  assert.match(workflow, /working-directory:\s*semforge/);
  assert.match(workflow, /cache-dependency-path:\s*semforge\/package-lock\.json/);
  assert.match(workflow, /path:\s*semforge\/\.omo\/evidence\/phase5-ci\/latest/);
  assert.match(workflow, /npm run ci:release-gate/);
  assert.doesNotMatch(workflow, /postgres:\/\/semforge/u);
  assert.match(workflow, /postgresql:\/\/semforge/u);
});

test("release gate runner는 generated notice/schema drift가 생기면 실패한다", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-release-gate-"));
  fs.mkdirSync(path.join(temp, "src", "db", "migrations"), { recursive: true });
  fs.mkdirSync(path.join(temp, "src", "db", "schema"), { recursive: true });
  fs.writeFileSync(path.join(temp, "THIRD_PARTY_NOTICES.md"), "original\n");
  fs.writeFileSync(path.join(temp, "package.json"), "{\"private\":true}\n");
  fs.writeFileSync(path.join(temp, "package-lock.json"), "{}\n");
  execFileSync("git", ["init"], { cwd: temp, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "init"],
    { cwd: temp, stdio: "ignore" },
  );

  return import(pathToFileURL(path.join(projectRoot, "scripts/ci/run-release-gate.mjs")).href).then(
    async ({ runReleaseGate }: {
      runReleaseGate: (options: {
        projectRoot: string;
        steps: Array<[string, string, string[]]>;
      }) => Promise<{ status: string; failedStep?: string; steps?: Array<{ name: string; ok: boolean }> }>;
    }) => {
      const summary = await runReleaseGate({
        projectRoot: temp,
        steps: [
          ["make-generated-drift", process.execPath, [
            "-e",
            "require('node:fs').writeFileSync('THIRD_PARTY_NOTICES.md', 'drift\\n')",
          ]],
          ["generated-diff", "git", [
            "diff",
            "--exit-code",
            "--",
            "src/db/migrations",
            "src/db/schema",
            "THIRD_PARTY_NOTICES.md",
            "package.json",
            "package-lock.json",
          ]],
        ],
      });

      assert.equal(summary.status, "failed");
      assert.equal(summary.failedStep, "generated-diff");
      assert.equal(summary.steps?.find((step) => step.name === "generated-diff")?.ok, false);
      const persisted = JSON.parse(
        fs.readFileSync(path.join(temp, ".omo", "evidence", "phase5-ci", "latest", "summary.json"), "utf8"),
      ) as { status: string; failedStep?: string };
      assert.equal(persisted.status, "failed");
      assert.equal(persisted.failedStep, "generated-diff");
    },
  );
});
