#!/usr/bin/env node
// @TASK P4-O1-T1 - Container startup fail-fast preflight
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST scripts/ops/runtime.test.mjs
import { pathToFileURL } from "node:url";

import {
  RuntimeConfigurationError,
  validateRuntimeEnvironment,
} from "./runtime.mjs";

function lifecycleRecord(level, message, details = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: process.argv[2] ?? "preflight",
    message,
    requestId: null,
    workspaceId: null,
    jobId: null,
    provider: null,
    ...details,
  });
}

export function runPreflight(profile, environment = process.env) {
  validateRuntimeEnvironment(profile, environment);
  return lifecycleRecord("info", "runtime preflight passed", { profile });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.stdout.write(`${runPreflight(process.argv[2], process.env)}\n`);
  } catch (error) {
    const issues = error instanceof RuntimeConfigurationError
      ? error.issues
      : ["runtime preflight failed"];
    process.stderr.write(`${lifecycleRecord("error", "runtime preflight failed", { issues })}\n`);
    process.exitCode = 78;
  }
}
