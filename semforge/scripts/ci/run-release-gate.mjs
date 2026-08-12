#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function writeJson(evidenceDir, fileName, value) {
  fs.writeFileSync(path.join(evidenceDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
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
      log.end();
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
}

function assertNode24() {
  const version = process.versions.node;
  if (!version.startsWith("24.")) {
    throw new Error(`release gate requires Node 24.x, got ${version}`);
  }
}

export const defaultSteps = [
  ["node-version", process.execPath, ["-v"]],
  ["npm-verify", "npm", ["run", "verify"]], // npm run verify
  ["npm-build", "npm", ["run", "build"]], // npm run build
  ["npm-audit-full", "npm", ["audit", "--audit-level=high"]], // npm audit --audit-level=high
  ["npm-audit-production", "npm", ["audit", "--omit=dev", "--audit-level=high"]], // npm audit --omit=dev --audit-level=high
  ["license-check", "npm", ["run", "license:check"]], // npm run license:check
  ["db-generate", "npm", ["run", "db:generate"]], // npm run db:generate
  ["generated-diff", "git", ["diff", "--exit-code", "--", "src/db/migrations", "src/db/schema", "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json"]], // git diff --exit-code
  ["source-diff-check", "git", ["diff", "--check", "--", ".", ":(exclude).omo/evidence/**"]], // git diff --check
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
  fs.mkdirSync(evidenceDir, { recursive: true });

  const summary = {
    status: "running",
    projectRoot,
    evidenceDir,
    node: process.version,
    nodeExecPath: process.execPath,
    platform: `${os.platform()} ${os.release()}`,
    startedAt: new Date().toISOString(),
    steps: [],
  };

  try {
    assertNode24();
    for (const [name, command, args, stepOptions] of steps) {
      const result = await runStep(projectRoot, evidenceDir, name, command, args, stepOptions);
      summary.steps.push(result);
      writeJson(evidenceDir, "summary.json", summary);
      if (!result.ok) {
        summary.status = "failed";
        summary.failedStep = name;
        summary.endedAt = new Date().toISOString();
        writeJson(evidenceDir, "summary.json", summary);
        return summary;
      }
    }
    summary.status = "passed";
    summary.endedAt = new Date().toISOString();
    writeJson(evidenceDir, "summary.json", summary);
    return summary;
  } catch (error) {
    summary.status = "failed";
    summary.error = error instanceof Error ? error.message : String(error);
    summary.endedAt = new Date().toISOString();
    writeJson(evidenceDir, "summary.json", summary);
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
