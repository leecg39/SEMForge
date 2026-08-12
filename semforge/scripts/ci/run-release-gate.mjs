#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function writeJson(evidenceDir, fileName, value) {
  fs.writeFileSync(path.join(evidenceDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function gitOutput(projectRoot, args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function captureGitHead(projectRoot, capturedAt) {
  return {
    gitSha: gitOutput(projectRoot, ["rev-parse", "--verify", "HEAD"]),
    treeSha: gitOutput(projectRoot, ["rev-parse", "--verify", "HEAD^{tree}"]),
    capturedAt,
    captureMethod: "git-rev-parse-at-runtime",
  };
}

function hasUncommittedSourceChanges(projectRoot) {
  const repositoryRoot = gitOutput(projectRoot, ["rev-parse", "--show-toplevel"]);
  const projectPrefix = gitOutput(projectRoot, ["rev-parse", "--show-prefix"]);
  return gitOutput(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ".",
    `:(glob,exclude)${projectPrefix}.omo/evidence/**`,
  ]) !== "";
}

function isAncestor(projectRoot, ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function classifyHeadRelationship(projectRoot, sourceGitSha, completionGitSha) {
  if (sourceGitSha === completionGitSha) {
    return "same-head";
  }
  if (!isAncestor(projectRoot, sourceGitSha, completionGitSha)) {
    return "diverged";
  }

  const projectPrefix = gitOutput(projectRoot, ["rev-parse", "--show-prefix"]);
  const evidencePrefix = `${projectPrefix}.omo/evidence/`;
  const changedPaths = gitOutput(projectRoot, [
    "diff",
    "--name-only",
    `${sourceGitSha}..${completionGitSha}`,
  ]).split("\n").filter(Boolean);

  return changedPaths.every((changedPath) => changedPath.startsWith(evidencePrefix))
    ? "evidence-only-descendant"
    : "source-changing-descendant";
}

function projectRelativePath(projectRoot, filePath) {
  const relativePath = path.relative(projectRoot, filePath);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${path.sep}`)) {
    throw new Error(`evidence artifact must be inside project root: ${filePath}`);
  }
  return relativePath.split(path.sep).join("/");
}

function describeArtifact(projectRoot, name, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  return {
    name,
    path: projectRelativePath(projectRoot, filePath),
    sha256: createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
  };
}

function collectArtifacts(projectRoot, steps, supplementalEvidence) {
  return {
    stepLogs: steps
      .map((step) => describeArtifact(projectRoot, step.name, step.logPath))
      .filter(Boolean),
    supplemental: supplementalEvidence
      .map((artifact) => describeArtifact(projectRoot, artifact.name, artifact.path))
      .filter(Boolean),
  };
}

function renderMarkdown(summary) {
  const lines = [
    "# Phase 5 release gate evidence",
    "",
    `Status: ${summary.status.toUpperCase()}`,
    "",
    "## Git provenance",
    "",
  ];
  if (summary.provenance?.source) {
    lines.push(
      `- Source HEAD captured at run start: \`${summary.provenance.source.gitSha}\``,
      `- Source tree captured at run start: \`${summary.provenance.source.treeSha}\``,
    );
  }
  if (summary.provenance?.completion) {
    lines.push(
      `- Evidence HEAD captured at run completion: \`${summary.provenance.completion.gitSha}\``,
      `- HEAD relationship: \`${summary.provenance.completion.relationshipToSource}\``,
    );
  }
  lines.push("", "## Release gate logs", "");
  if (summary.artifacts.stepLogs.length === 0) {
    lines.push("- No completed step logs.");
  } else {
    for (const artifact of summary.artifacts.stepLogs) {
      lines.push(`- \`${artifact.name}\`: \`${artifact.path}\` (sha256 \`${artifact.sha256}\`)`);
    }
  }
  if (summary.artifacts.supplemental.length > 0) {
    lines.push("", "## Separately executed acceptance evidence", "");
    for (const artifact of summary.artifacts.supplemental) {
      lines.push(`- \`${artifact.name}\`: \`${artifact.path}\` (sha256 \`${artifact.sha256}\`)`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function persistSummary(projectRoot, evidenceDir, summary, supplementalEvidence) {
  summary.artifacts = collectArtifacts(projectRoot, summary.steps, supplementalEvidence);
  writeJson(evidenceDir, "summary.json", summary);
  fs.writeFileSync(path.join(evidenceDir, "summary.md"), renderMarkdown(summary));
}

function runStep(projectRoot, evidenceDir, name, command, args, options = {}) {
  const logPath = path.join(evidenceDir, `${name}.log`);
  const startedAt = new Date().toISOString();
  const nodeBinDir = path.dirname(process.execPath);

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        CI: "true",
        PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
        SEMFORGE_EXTERNAL_NETWORK: "disabled",
        ...options.env,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const log = fs.createWriteStream(logPath, { flags: "w" });
    log.write(`$ ${[command, ...args].join(" ")}\n`);
    log.write(`startedAt=${startedAt}\n`);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("close", (code, signal) => {
      const endedAt = new Date().toISOString();
      log.write(`\nendedAt=${endedAt}\n`);
      log.write(`exitCode=${code ?? "null"}\n`);
      log.write(`signal=${signal ?? "null"}\n`);
      log.end(() => {
        resolve({
          name,
          command: [command, ...args].join(" "),
          logPath,
          startedAt,
          endedAt,
          exitCode: code,
          signal,
          ok: code === 0,
        });
      });
    });
  });
}

function assertNode24() {
  const version = process.versions.node;
  if (!version.startsWith("24.")) {
    throw new Error(`release gate requires Node 24.x, got ${version}`);
  }
}

const releaseDiffBase = process.env.SEMFORGE_RELEASE_DIFF_BASE ?? "origin/codex/paid-beta-core";

export const defaultSteps = [
  ["node-version", process.execPath, ["-v"]],
  [
    "deployment-build-inputs",
    process.execPath,
    ["scripts/ops/deployment-preflight.mjs"],
    {
      env: {
        SEMFORGE_DEPLOYMENT_PREFLIGHT_MODE: "build-inputs",
        SEMFORGE_NODE_BASE_IMAGE: process.env.SEMFORGE_NODE_BASE_IMAGE,
        SEMFORGE_POSTGRES_IMAGE: process.env.SEMFORGE_POSTGRES_IMAGE,
      },
    },
  ],
  ["npm-verify", "npm", ["run", "verify"]], // npm run verify
  ["npm-build", "npm", ["run", "build"]], // npm run build
  ["npm-audit-full", "npm", ["audit", "--audit-level=high"]], // npm audit --audit-level=high
  ["npm-audit-production", "npm", ["audit", "--omit=dev", "--audit-level=high"]], // npm audit --omit=dev --audit-level=high
  ["license-check", "npm", ["run", "license:check"]], // npm run license:check
  ["db-generate", "npm", ["run", "db:generate"]], // npm run db:generate
  ["generated-diff", "git", ["diff", "--exit-code", "--", "src/db/migrations", "src/db/schema", "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json"]], // git diff --exit-code
  ["source-diff-check", "git", ["diff", "--check", "--", ".", ":(exclude).omo/evidence/**"]], // git diff --check
  ["range-source-diff-check", "git", ["diff", "--check", `${releaseDiffBase}...HEAD`, "--", ".", ":(exclude).omo/evidence/**"]], // git diff --check release range
  ["route-manifest", "npm", ["run", "ci:route-manifest"]], // npm run ci:route-manifest
  ["forbidden-surface", "npm", ["run", "ci:forbidden-surface"]], // npm run ci:forbidden-surface
  ["pg16", "npm", ["run", "ci:pg16"]], // npm run ci:pg16
  ["nine-site", "npm", ["run", "ci:nine-site"]], // npm run ci:nine-site
];

export async function runReleaseGate(options = {}) {
  const projectRoot = options.projectRoot ?? process.cwd();
  const evidenceDir = options.evidenceDir ??
    path.join(projectRoot, ".omo", "evidence", "phase5-ci", "latest");
  const steps = options.steps ?? defaultSteps;
  const supplementalEvidence = options.supplementalEvidence ?? [{
    name: "minio-versioning",
    path: path.join(projectRoot, ".omo", "evidence", "final-20260812", "minio-versioning.log"),
  }];
  fs.mkdirSync(evidenceDir, { recursive: true });
  const startedAt = new Date().toISOString();

  const summary = {
    schemaVersion: "semforge.release-gate-evidence.v2",
    status: "running",
    projectRoot,
    evidenceDir,
    node: process.version,
    nodeExecPath: process.execPath,
    platform: `${os.platform()} ${os.release()}`,
    startedAt,
    provenance: {
      source: null,
      completion: null,
    },
    artifacts: {
      stepLogs: [],
      supplemental: [],
    },
    steps: [],
  };

  try {
    summary.provenance.source = captureGitHead(projectRoot, startedAt);
    if (hasUncommittedSourceChanges(projectRoot)) {
      summary.failedStep = "source-provenance";
      throw new Error("release gate requires a clean source worktree");
    }
    assertNode24();
    for (const [name, command, args, stepOptions] of steps) {
      const result = await runStep(projectRoot, evidenceDir, name, command, args, stepOptions);
      summary.steps.push(result);
      persistSummary(projectRoot, evidenceDir, summary, supplementalEvidence);
      if (!result.ok) {
        summary.status = "failed";
        summary.failedStep = name;
        summary.endedAt = new Date().toISOString();
        const completion = captureGitHead(projectRoot, summary.endedAt);
        summary.provenance.completion = {
          ...completion,
          relationshipToSource: classifyHeadRelationship(
            projectRoot,
            summary.provenance.source.gitSha,
            completion.gitSha,
          ),
        };
        persistSummary(projectRoot, evidenceDir, summary, supplementalEvidence);
        return summary;
      }
    }
    summary.status = "passed";
    summary.endedAt = new Date().toISOString();
    const completion = captureGitHead(projectRoot, summary.endedAt);
    summary.provenance.completion = {
      ...completion,
      relationshipToSource: classifyHeadRelationship(
        projectRoot,
        summary.provenance.source.gitSha,
        completion.gitSha,
      ),
    };
    if (
      hasUncommittedSourceChanges(projectRoot)
      || !["same-head", "evidence-only-descendant"].includes(
        summary.provenance.completion.relationshipToSource,
      )
    ) {
      summary.status = "failed";
      summary.failedStep = "source-provenance";
      summary.error = "release gate source changed while validation was running";
    }
    persistSummary(projectRoot, evidenceDir, summary, supplementalEvidence);
    return summary;
  } catch (error) {
    summary.status = "failed";
    summary.error = error instanceof Error ? error.message : String(error);
    summary.endedAt = new Date().toISOString();
    if (summary.provenance.source) {
      try {
        const completion = captureGitHead(projectRoot, summary.endedAt);
        summary.provenance.completion = {
          ...completion,
          relationshipToSource: classifyHeadRelationship(
            projectRoot,
            summary.provenance.source.gitSha,
            completion.gitSha,
          ),
        };
      } catch {
        // Preserve the original failure if Git state cannot be read at completion.
      }
    }
    persistSummary(projectRoot, evidenceDir, summary, supplementalEvidence);
    return summary;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await runReleaseGate();
  if (summary.status === "passed") {
    console.log(`release gate passed; evidence=${path.join(summary.evidenceDir, "summary.json")}`);
  } else {
    console.error(summary.error ?? `release gate failed at ${summary.failedStep ?? "unknown step"}`);
    process.exit(1);
  }
}
