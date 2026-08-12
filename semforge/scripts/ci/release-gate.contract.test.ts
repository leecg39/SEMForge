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
    "range-source-diff-check",
    "SEMFORGE_RELEASE_DIFF_BASE",
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

test("최종 evidence index는 canonical v2 결과를 재기록하지 않고 안정적인 포인터만 제공한다", () => {
  const finalIndex = read(".omo/evidence/final-20260812/summary.md");

  assert.match(finalIndex, /phase5-ci\/latest\/summary\.json/);
  assert.match(finalIndex, /phase5-ci\/latest\/summary\.md/);
  assert.match(finalIndex, /canonical[\s\S]*v2/i);
  assert.doesNotMatch(finalIndex, /[0-9a-f]{40}/i);
  assert.doesNotMatch(finalIndex, /\b\d+\s+tests\b/i);
  assert.doesNotMatch(finalIndex, /\b\d+\s+(?:passed|failed|skipped)\b/i);
  assert.doesNotMatch(finalIndex, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/);
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
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /SEMFORGE_RELEASE_DIFF_BASE:\s*origin\/codex\/paid-beta-core/);
  assert.match(workflow, /path:\s*semforge\/\.omo\/evidence\/phase5-ci\/latest/);
  assert.match(workflow, /npm run ci:release-gate/);
  assert.doesNotMatch(
    workflow,
    /OPERATOR_DATABASE_URL/,
    "release workflow는 build/web 범위에 operator 전용 DSN을 주입하면 안 된다",
  );
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
      const failedStep = summary.failedStep ?? summary.steps?.find((step) => !step.ok)?.name;
      assert.equal(failedStep, "generated-diff", JSON.stringify(summary));
      assert.equal(summary.steps?.find((step) => step.name === "generated-diff")?.ok, false);
      const persisted = JSON.parse(
        fs.readFileSync(path.join(temp, ".omo", "evidence", "phase5-ci", "latest", "summary.json"), "utf8"),
      ) as { status: string; failedStep?: string };
      assert.equal(persisted.status, "failed");
      assert.equal(persisted.failedStep, "generated-diff");
    },
  );
});

test("release gate runner는 커밋된 release-range whitespace도 실패시킨다", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-release-range-"));
  fs.writeFileSync(path.join(temp, "source.txt"), "clean\n");
  fs.mkdirSync(path.join(temp, ".omo", "evidence"), { recursive: true });
  execFileSync("git", ["init"], { cwd: temp, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "base"],
    { cwd: temp, stdio: "ignore" },
  );
  execFileSync(
    "git",
    ["update-ref", "refs/remotes/origin/codex/paid-beta-core", "HEAD"],
    { cwd: temp, stdio: "ignore" },
  );
  fs.writeFileSync(path.join(temp, "source.txt"), "committed trailing whitespace \n");
  fs.writeFileSync(path.join(temp, ".omo", "evidence", "ignored.log"), "evidence trailing whitespace \n");
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "range whitespace"],
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
          ["range-source-diff-check", "git", [
            "diff",
            "--check",
            "origin/codex/paid-beta-core...HEAD",
            "--",
            ".",
            ":(exclude).omo/evidence/**",
          ]],
        ],
      });

      assert.equal(summary.status, "failed");
      const failedStep = summary.failedStep ?? summary.steps?.find((step) => !step.ok)?.name;
      assert.equal(failedStep, "range-source-diff-check", JSON.stringify(summary));
      assert.equal(summary.steps?.find((step) => step.name === "range-source-diff-check")?.ok, false);
    },
  );
});

test("release gate summary는 시작 source SHA와 evidence-only 종료 HEAD의 관계를 기록한다", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-release-provenance-"));
  const supplementalPath = path.join(
    temp,
    ".omo",
    "evidence",
    "final-20260812",
    "minio-versioning.log",
  );
  fs.mkdirSync(path.dirname(supplementalPath), { recursive: true });
  fs.writeFileSync(path.join(temp, "source.txt"), "release source\n");
  fs.writeFileSync(supplementalPath, "tests 17\npass 17\nfail 0\n");
  execFileSync("git", ["init"], { cwd: temp, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "source"],
    { cwd: temp, stdio: "ignore" },
  );
  const sourceGitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: temp,
    encoding: "utf8",
  }).trim();
  const sourceTreeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: temp,
    encoding: "utf8",
  }).trim();
  const evidenceDir = path.join(temp, ".omo", "evidence", "phase5-ci", "latest");

  const { runReleaseGate } = await import(
    pathToFileURL(path.join(projectRoot, "scripts/ci/run-release-gate.mjs")).href
  ) as {
    runReleaseGate: (options: {
      projectRoot: string;
      evidenceDir: string;
      steps: Array<[string, string, string[]]>;
      supplementalEvidence: Array<{ name: string; path: string }>;
    }) => Promise<{
      schemaVersion?: string;
      status: string;
      provenance?: {
        source: { gitSha: string; treeSha: string };
        completion: { gitSha: string; relationshipToSource: string };
      };
      artifacts?: {
        stepLogs: Array<{ name: string; path: string }>;
        supplemental: Array<{ name: string; path: string }>;
      };
    }>;
  };
  const commitEvidenceScript = [
    "const fs=require('node:fs')",
    "const cp=require('node:child_process')",
    "fs.mkdirSync('.omo/evidence/committed',{recursive:true})",
    "fs.writeFileSync('.omo/evidence/committed/marker.txt','evidence only\\n')",
    "cp.execFileSync('git',['add','.omo/evidence/committed/marker.txt'])",
    "cp.execFileSync('git',['-c','user.email=test@example.invalid','-c','user.name=Test','commit','-m','evidence only'])",
  ].join(";");

  const summary = await runReleaseGate({
    projectRoot: temp,
    evidenceDir,
    steps: [["commit-evidence", process.execPath, ["-e", commitEvidenceScript]]],
    supplementalEvidence: [
      { name: "minio-versioning", path: supplementalPath },
      { name: "missing-acceptance", path: path.join(temp, "missing-acceptance.log") },
    ],
  });
  const completionGitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: temp,
    encoding: "utf8",
  }).trim();

  assert.equal(summary.status, "passed");
  assert.equal(summary.schemaVersion, "semforge.release-gate-evidence.v2");
  assert.equal(summary.provenance?.source.gitSha, sourceGitSha);
  assert.equal(summary.provenance?.source.treeSha, sourceTreeSha);
  assert.equal(summary.provenance?.completion.gitSha, completionGitSha);
  assert.equal(
    summary.provenance?.completion.relationshipToSource,
    "evidence-only-descendant",
  );
  assert.deepEqual(
    summary.artifacts?.stepLogs.map(({ name, path: artifactPath }) => ({ name, path: artifactPath })),
    [{
      name: "commit-evidence",
      path: ".omo/evidence/phase5-ci/latest/commit-evidence.log",
    }],
  );
  assert.deepEqual(
    summary.artifacts?.supplemental.map(({ name, path: artifactPath }) => ({
      name,
      path: artifactPath,
    })),
    [{
      name: "minio-versioning",
      path: ".omo/evidence/final-20260812/minio-versioning.log",
    }],
  );

  const markdown = fs.readFileSync(path.join(evidenceDir, "summary.md"), "utf8");
  assert.match(markdown, new RegExp(sourceGitSha));
  assert.match(markdown, new RegExp(completionGitSha));
  assert.match(markdown, /evidence-only-descendant/);
  assert.match(markdown, /\.omo\/evidence\/phase5-ci\/latest\/commit-evidence\.log/);
  assert.match(markdown, /\.omo\/evidence\/final-20260812\/minio-versioning\.log/);
  assert.doesNotMatch(markdown, /missing-acceptance\.log/);
  assert.doesNotMatch(markdown, /npm-verify-after-tenant-read\.log/);
});

test("release gate는 source SHA로 식별할 수 없는 dirty source에서 실행하지 않는다", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-release-dirty-source-"));
  fs.writeFileSync(path.join(temp, "source.txt"), "committed source\n");
  execFileSync("git", ["init"], { cwd: temp, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "source"],
    { cwd: temp, stdio: "ignore" },
  );
  fs.writeFileSync(path.join(temp, "source.txt"), "uncommitted source change\n");
  const markerPath = path.join(temp, "step-ran.txt");

  const { runReleaseGate } = await import(
    pathToFileURL(path.join(projectRoot, "scripts/ci/run-release-gate.mjs")).href
  ) as {
    runReleaseGate: (options: {
      projectRoot: string;
      steps: Array<[string, string, string[]]>;
      supplementalEvidence: [];
    }) => Promise<{
      status: string;
      failedStep?: string;
      steps: Array<{ name: string }>;
    }>;
  };
  const summary = await runReleaseGate({
    projectRoot: temp,
    steps: [[
      "must-not-run",
      process.execPath,
      ["-e", `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran')`],
    ]],
    supplementalEvidence: [],
  });

  assert.equal(summary.status, "failed");
  assert.equal(summary.failedStep, "source-provenance");
  assert.deepEqual(summary.steps, []);
  assert.equal(fs.existsSync(markerPath), false);
});

test("release gate 도중 source-changing HEAD로 이동하면 provenance 단계에서 실패한다", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-release-source-moved-"));
  fs.writeFileSync(path.join(temp, "source.txt"), "source before gate\n");
  execFileSync("git", ["init"], { cwd: temp, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "source"],
    { cwd: temp, stdio: "ignore" },
  );

  const { runReleaseGate } = await import(
    pathToFileURL(path.join(projectRoot, "scripts/ci/run-release-gate.mjs")).href
  ) as {
    runReleaseGate: (options: {
      projectRoot: string;
      steps: Array<[string, string, string[]]>;
      supplementalEvidence: [];
    }) => Promise<{
      status: string;
      failedStep?: string;
      provenance?: {
        completion: { relationshipToSource: string };
      };
    }>;
  };
  const commitSourceScript = [
    "const fs=require('node:fs')",
    "const cp=require('node:child_process')",
    "fs.writeFileSync('source.txt','source changed during gate\\n')",
    "cp.execFileSync('git',['add','source.txt'])",
    "cp.execFileSync('git',['-c','user.email=test@example.invalid','-c','user.name=Test','commit','-m','source changed'])",
  ].join(";");

  const summary = await runReleaseGate({
    projectRoot: temp,
    steps: [["commit-source", process.execPath, ["-e", commitSourceScript]]],
    supplementalEvidence: [],
  });

  assert.equal(summary.status, "failed");
  assert.equal(summary.failedStep, "source-provenance");
  assert.equal(
    summary.provenance?.completion.relationshipToSource,
    "source-changing-descendant",
  );
});

test("release gate는 project root 밖 repository source 변경도 거부한다", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "semforge-release-repo-dirty-"));
  const nestedProject = path.join(temp, "semforge");
  fs.mkdirSync(nestedProject);
  fs.writeFileSync(path.join(nestedProject, "source.txt"), "project source\n");
  fs.writeFileSync(path.join(temp, "workflow.yml"), "committed workflow\n");
  execFileSync("git", ["init"], { cwd: temp, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: temp, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-m", "source"],
    { cwd: temp, stdio: "ignore" },
  );
  fs.writeFileSync(path.join(temp, "workflow.yml"), "uncommitted workflow change\n");
  const markerPath = path.join(nestedProject, "step-ran.txt");

  const { runReleaseGate } = await import(
    pathToFileURL(path.join(projectRoot, "scripts/ci/run-release-gate.mjs")).href
  ) as {
    runReleaseGate: (options: {
      projectRoot: string;
      steps: Array<[string, string, string[]]>;
      supplementalEvidence: [];
    }) => Promise<{ status: string; failedStep?: string }>;
  };
  const summary = await runReleaseGate({
    projectRoot: nestedProject,
    steps: [[
      "must-not-run",
      process.execPath,
      ["-e", `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran')`],
    ]],
    supplementalEvidence: [],
  });

  assert.equal(summary.status, "failed");
  assert.equal(summary.failedStep, "source-provenance");
  assert.equal(fs.existsSync(markerPath), false);
});
