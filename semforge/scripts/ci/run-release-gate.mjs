#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const evidenceDir = path.join(projectRoot, ".omo", "evidence", "phase5-ci", "latest");
fs.mkdirSync(evidenceDir, { recursive: true });

function writeJson(fileName, value) {
  fs.writeFileSync(path.join(evidenceDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function runStep(name, command, args, options = {}) {
  const logPath = path.join(evidenceDir, `${name}.log`);
  const startedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        CI: "true",
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

const steps = [
  ["node-version", process.execPath, ["-v"]],
  ["npm-verify", "npm", ["run", "verify"]], // npm run verify
  ["npm-build", "npm", ["run", "build"]], // npm run build
  ["npm-audit-full", "npm", ["audit", "--audit-level=high"]], // npm audit --audit-level=high
  ["npm-audit-production", "npm", ["audit", "--omit=dev", "--audit-level=high"]], // npm audit --omit=dev --audit-level=high
  ["db-generate", "npm", ["run", "db:generate"]], // npm run db:generate
  ["route-manifest", "npm", ["run", "ci:route-manifest"]], // npm run ci:route-manifest
  ["forbidden-surface", "npm", ["run", "ci:forbidden-surface"]], // npm run ci:forbidden-surface
  ["pg16", "npm", ["run", "ci:pg16"]], // npm run ci:pg16
  ["nine-site", "npm", ["run", "ci:nine-site"]], // npm run ci:nine-site
];

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
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    summary.steps.push(result);
    writeJson("summary.json", summary);
    if (!result.ok) {
      summary.status = "failed";
      summary.failedStep = name;
      summary.endedAt = new Date().toISOString();
      writeJson("summary.json", summary);
      process.exit(result.exitCode ?? 1);
    }
  }
  summary.status = "passed";
  summary.endedAt = new Date().toISOString();
  writeJson("summary.json", summary);
  console.log(`release gate passed; evidence=${path.join(evidenceDir, "summary.json")}`);
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  summary.endedAt = new Date().toISOString();
  writeJson("summary.json", summary);
  console.error(summary.error);
  process.exit(1);
}
