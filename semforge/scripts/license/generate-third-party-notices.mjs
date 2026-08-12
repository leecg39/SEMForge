#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const allowedLicenseTokens = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "OFL-1.1",
  "Zlib",
]);

const forbiddenLicensePattern = /\b(?:AGPL|GPL|SSPL)\b|PolyForm|Noncommercial|NonCommercial|UNLICENSED|UNKNOWN|SEE LICEN[CS]E/i;
const licenseFilePattern = /^(licen[cs]e|copying|notice|copyright)(?:$|[-_.])/i;

function parseArgs(argv) {
  const args = {
    check: false,
    packageLockPath: "package-lock.json",
    nodeModulesPath: "node_modules",
    outputPath: "THIRD_PARTY_NOTICES.md",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--package-lock") {
      args.packageLockPath = requireValue(argv, ++index, arg);
    } else if (arg === "--node-modules") {
      args.nodeModulesPath = requireValue(argv, ++index, arg);
    } else if (arg === "--output") {
      args.outputPath = requireValue(argv, ++index, arg);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function workspaceRelative(absolutePath) {
  return path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
}

function packageNameFromLockPath(lockPath) {
  return lockPath.replace(/^node_modules\//u, "");
}

function licenseTokens(licenseExpression) {
  return licenseExpression
    .replace(/[()]/gu, " ")
    .split(/\s+(?:AND|OR|WITH)\s+|\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function validateLicenseExpression(packageName, licenseExpression) {
  if (typeof licenseExpression !== "string" || licenseExpression.trim() === "") {
    return `${packageName}: missing license expression`;
  }
  if (forbiddenLicensePattern.test(licenseExpression)) {
    return `${packageName}: forbidden license expression ${licenseExpression}`;
  }
  for (const token of licenseTokens(licenseExpression)) {
    if (!allowedLicenseTokens.has(token)) {
      return `${packageName}: unsupported license token ${token} in ${licenseExpression}`;
    }
  }
  return null;
}

function collectProductionPackages(lockfile) {
  return Object.entries(lockfile.packages ?? {})
    .filter(([packagePath, metadata]) => packagePath.startsWith("node_modules/") && metadata?.dev !== true)
    .map(([packagePath, metadata]) => ({
      lockPath: packagePath,
      name: packageNameFromLockPath(packagePath),
      version: metadata.version ?? "",
      license: metadata.license ?? "",
      optional: metadata.optional === true,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function packageDirectory(nodeModulesPath, packageName) {
  return path.join(nodeModulesPath, ...packageName.split("/"));
}

function collectLicenseTexts(packages, nodeModulesPath) {
  const notices = new Map();

  for (const dependency of packages) {
    if (dependency.optional) {
      continue;
    }

    const directory = packageDirectory(nodeModulesPath, dependency.name);
    if (!existsSync(directory)) {
      continue;
    }

    const fileNames = readdirSync(directory)
      .filter((fileName) => licenseFilePattern.test(fileName))
      .sort((left, right) => left.localeCompare(right, "en"));

    for (const fileName of fileNames) {
      const absolutePath = path.join(directory, fileName);
      const content = readFileSync(absolutePath, "utf8").replace(/\r\n/gu, "\n").trim();
      if (!content) {
        continue;
      }
      const digest = sha256(content);
      const existing = notices.get(digest) ?? {
        digest,
        fileName,
        content,
        packages: [],
      };
      existing.packages.push({
        name: dependency.name,
        version: dependency.version,
        source: workspaceRelative(absolutePath),
      });
      notices.set(digest, existing);
    }
  }

  return [...notices.values()].sort((left, right) => {
    const firstPackage = left.packages[0]?.name ?? "";
    const secondPackage = right.packages[0]?.name ?? "";
    return firstPackage.localeCompare(secondPackage, "en") || left.digest.localeCompare(right.digest, "en");
  });
}

function markdownTableEscape(value) {
  return String(value).replace(/\|/gu, "\\|");
}

function codeFence(content) {
  return content.replace(/```/gu, "`\u200b``");
}

export function renderThirdPartyNotices({ lockfileText, lockfile, nodeModulesPath = "node_modules" }) {
  const packages = collectProductionPackages(lockfile);
  const policyFailures = packages
    .map((dependency) => validateLicenseExpression(`${dependency.name}@${dependency.version}`, dependency.license))
    .filter(Boolean);

  if (policyFailures.length > 0) {
    throw new Error(`license policy failed:\n${policyFailures.join("\n")}`);
  }

  const notices = collectLicenseTexts(packages, nodeModulesPath);
  const lines = [
    "# SEMForge Third-Party Notices",
    "",
    "This product includes third-party production dependencies. This file is generated from `package-lock.json` and installed non-optional production packages in `node_modules`.",
    "",
    `Package lock SHA-256: \`${sha256(lockfileText)}\``,
    "",
    "License policy: missing, unknown, GPL, AGPL, SSPL, PolyForm, and noncommercial licenses fail closed.",
    "",
    "## Production dependency inventory",
    "",
    "| Package | Version | License | Optional |",
    "| --- | --- | --- | --- |",
  ];

  for (const dependency of packages) {
    lines.push(
      `| ${markdownTableEscape(dependency.name)} | ${markdownTableEscape(dependency.version)} | ${markdownTableEscape(dependency.license)} | ${dependency.optional ? "yes" : "no"} |`,
    );
  }

  lines.push(
    "",
    "## License and notice texts collected from node_modules",
    "",
    "The following unique texts are copied once from installed non-optional production packages. Optional platform packages remain listed in the inventory above; the production image also retains each installed package's own files under `node_modules`.",
    "",
  );

  for (const notice of notices) {
    lines.push(
      `### ${notice.packages[0]?.name ?? "unknown"} — ${notice.fileName} — ${notice.digest.slice(0, 12)}`,
      "",
      "Sources:",
      "",
    );
    for (const sourcePackage of notice.packages.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      lines.push(`- ${sourcePackage.name}@${sourcePackage.version}: \`${sourcePackage.source}\``);
    }
    lines.push("", "```text", codeFence(notice.content), "```", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageLockPath = path.resolve(args.packageLockPath);
  const nodeModulesPath = path.resolve(args.nodeModulesPath);
  const outputPath = path.resolve(args.outputPath);
  const lockfileText = await readFile(packageLockPath, "utf8");
  const rendered = renderThirdPartyNotices({
    lockfileText,
    lockfile: JSON.parse(lockfileText),
    nodeModulesPath,
  });

  if (args.check) {
    const current = await readFile(outputPath, "utf8");
    if (current !== rendered) {
      throw new Error(`${workspaceRelative(outputPath)} is stale; run npm run license:generate`);
    }
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
