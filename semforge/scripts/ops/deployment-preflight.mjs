#!/usr/bin/env node
// @TASK P5-SN-T1 - Fail-closed production image digest preflight
// @TEST scripts/ops/deployment.contract.test.ts
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SHA256_IMAGE_REFERENCE = /^[^@\s]+@sha256:[0-9a-f]{64}$/u;

function validateBaseImage(issues, label, reference, expectedRepository) {
  if (
    typeof reference !== "string" ||
    !reference.startsWith(`${expectedRepository}@sha256:`) ||
    !SHA256_IMAGE_REFERENCE.test(reference)
  ) {
    issues.push(`${label} must pin ${expectedRepository} with a sha256 digest`);
  }
}

function manifestImages(source) {
  return [...source.matchAll(/^\s*image:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/gmu)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter(Boolean);
}

export async function validateProductionDeployment({ environment, manifestPaths }) {
  const issues = [];
  validateBaseImage(
    issues,
    "SEMFORGE_NODE_BASE_IMAGE",
    environment.SEMFORGE_NODE_BASE_IMAGE,
    "node:24-bookworm-slim",
  );
  validateBaseImage(
    issues,
    "SEMFORGE_POSTGRES_IMAGE",
    environment.SEMFORGE_POSTGRES_IMAGE,
    "postgres:16-alpine",
  );

  if (manifestPaths.length === 0) {
    issues.push("at least one rendered Kubernetes manifest path is required");
  }

  let imageCount = 0;
  for (const manifestPath of manifestPaths) {
    let source;
    try {
      source = await readFile(manifestPath, "utf8");
    } catch {
      issues.push(`${manifestPath}: manifest cannot be read`);
      continue;
    }
    if (source.includes("REPLACE_WITH_DIGEST")) {
      issues.push(`${manifestPath}: REPLACE_WITH_DIGEST is forbidden in production`);
    }
    const images = manifestImages(source);
    if (images.length === 0) {
      issues.push(`${manifestPath}: no Kubernetes image references found`);
      continue;
    }
    imageCount += images.length;
    for (const image of images) {
      if (!SHA256_IMAGE_REFERENCE.test(image)) {
        issues.push(`${manifestPath}: every image must use an immutable sha256 digest`);
      }
    }
  }

  if (issues.length > 0) {
    const error = new Error(`production deployment preflight failed: ${issues.join(", ")}`);
    error.name = "DeploymentPreflightError";
    error.issues = Object.freeze([...issues]);
    throw error;
  }
  return Object.freeze({ manifestCount: manifestPaths.length, imageCount });
}

async function main() {
  const manifestPaths = process.argv.slice(2);
  try {
    const result = await validateProductionDeployment({
      environment: process.env,
      manifestPaths,
    });
    process.stdout.write(`${JSON.stringify({
      level: "info",
      message: "deployment preflight passed",
      ...result,
    })}\n`);
  } catch (error) {
    const issues = Array.isArray(error?.issues)
      ? error.issues
      : ["production deployment preflight failed"];
    process.stderr.write(`${JSON.stringify({
      level: "error",
      message: "deployment preflight failed",
      issues,
    })}\n`);
    process.exitCode = 78;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
