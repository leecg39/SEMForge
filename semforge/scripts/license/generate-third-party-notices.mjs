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
const distributionFilePattern = /^(licen[cs]e|copying|notice|copyright|readme)(?:$|[-_.])/i;
const gplLicenseTextPath = new URL("./licenses/GPL-3.0-only.txt", import.meta.url);
const lgplLicenseTextPath = new URL("./licenses/LGPL-3.0-or-later.txt", import.meta.url);
const sharpLibvipsSourceReference = {
  commit: "4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6",
  tag: "v1.3.2",
  url: "https://github.com/lovell/sharp-libvips/tree/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6",
};
const sharpWasmApplicationCommit = "1018449164723ba0203c1beffaba0e21f7829c18";
const sharpWasmLibraryCommit = "4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6";

function parseArgs(argv) {
  const args = {
    check: false,
    distributionNotices: false,
    includeInstalledOptional: false,
    packageLockPath: "package-lock.json",
    nodeModulesPath: "node_modules",
    outputPath: "THIRD_PARTY_NOTICES.md",
    sharpWasmSourceManifestPath: new URL("./sharp-wasm-source-manifest.json", import.meta.url),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--distribution-notices") {
      args.distributionNotices = true;
    } else if (arg === "--include-installed-optional") {
      args.includeInstalledOptional = true;
    } else if (arg === "--package-lock") {
      args.packageLockPath = requireValue(argv, ++index, arg);
    } else if (arg === "--node-modules") {
      args.nodeModulesPath = requireValue(argv, ++index, arg);
    } else if (arg === "--output") {
      args.outputPath = requireValue(argv, ++index, arg);
    } else if (arg === "--sharp-wasm-source-manifest") {
      args.sharpWasmSourceManifestPath = requireValue(argv, ++index, arg);
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

function collectLicenseTexts(packages, nodeModulesPath, options = {}) {
  const notices = new Map();

  for (const dependency of packages) {
    if (dependency.optional && options.includeInstalledOptional !== true) {
      continue;
    }

    const directory = packageDirectory(nodeModulesPath, dependency.name);
    if (!existsSync(directory)) {
      continue;
    }

    const filePattern = options.includeInstalledOptional === true ? distributionFilePattern : licenseFilePattern;
    const fileNames = readdirSync(directory)
      .filter((fileName) => filePattern.test(fileName))
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

function installedDistributionPackages(packages, nodeModulesPath) {
  return packages.filter((dependency) => existsSync(packageDirectory(nodeModulesPath, dependency.name)));
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sameJsonRecord(left, right) {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "en"));
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "en"));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function resolveContainedFile(directory, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const root = path.resolve(directory);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes its package directory`);
  }
  return resolved;
}

function validateSharpWasmCompliance({ lockfile, nodeModulesPath, sourceManifestPath }) {
  const packageName = "@img/sharp-wasm32";
  const directory = packageDirectory(nodeModulesPath, packageName);
  if (!existsSync(directory)) {
    return null;
  }

  try {
    const manifest = readJsonFile(sourceManifestPath, "sharp WASM source manifest");
    const distribution = manifest.distribution;
    const lockEntry = lockfile.packages?.[`node_modules/${packageName}`];
    const installedPackage = readJsonFile(path.join(directory, "package.json"), `${packageName} package metadata`);

    if (manifest.schemaVersion !== 1) {
      throw new Error("source manifest schemaVersion must be 1");
    }
    if (distribution?.package !== packageName || distribution?.version !== "0.35.3") {
      throw new Error(`source manifest must bind ${packageName}@0.35.3`);
    }
    if (lockEntry?.version !== distribution.version || lockEntry?.integrity !== distribution.integrity) {
      throw new Error("package-lock version/integrity does not match the source manifest");
    }
    if (installedPackage.name !== packageName || installedPackage.version !== distribution.version) {
      throw new Error("installed package metadata does not match the source manifest");
    }
    if (installedPackage.license !== "Apache-2.0 AND LGPL-3.0-or-later AND MIT") {
      throw new Error("installed package license expression is unexpected");
    }
    const installedVersions = readJsonFile(path.join(directory, "versions.json"), `${packageName} versions`);
    if (!sameJsonRecord(installedVersions, distribution.versions)) {
      throw new Error("installed bundled-library versions do not match the source manifest");
    }
    const wasmPath = resolveContainedFile(directory, distribution.wasmPath, "distribution.wasmPath");
    if (!existsSync(wasmPath)) {
      throw new Error(`installed WASM artifact is missing: ${distribution.wasmPath}`);
    }
    const wasmDigest = sha256(readFileSync(wasmPath));
    if (wasmDigest !== distribution.wasmSha256) {
      throw new Error(`installed WASM SHA-256 ${wasmDigest} does not match ${distribution.wasmSha256}`);
    }
    if (manifest.applicationSource?.commit !== sharpWasmApplicationCommit) {
      throw new Error(`application source must bind sharp commit ${sharpWasmApplicationCommit}`);
    }
    if (manifest.librarySource?.commit !== sharpWasmLibraryCommit) {
      throw new Error(`library source must bind sharp-libvips commit ${sharpWasmLibraryCommit}`);
    }
    if (
      manifest.devPackage?.package !== "@img/sharp-libvips-dev-wasm32" ||
      manifest.devPackage?.version !== "1.3.2" ||
      typeof manifest.devPackage?.integrity !== "string"
    ) {
      throw new Error("source manifest must bind @img/sharp-libvips-dev-wasm32@1.3.2 and its integrity");
    }
    const staticLibraries = manifest.devPackage.staticLibraries;
    if (!Array.isArray(staticLibraries) || staticLibraries.length !== 28 || new Set(staticLibraries).size !== 28) {
      throw new Error("source manifest must enumerate exactly 28 unique static library artifacts");
    }
    const notices = manifest.staticLibraryNotices;
    if (!Array.isArray(notices) || notices.length !== 28) {
      throw new Error("source manifest must provide exactly 28 static library notices");
    }
    const noticeArtifacts = notices.map((notice) => notice?.artifact);
    if (new Set(noticeArtifacts).size !== 28 || staticLibraries.some((artifact) => !noticeArtifacts.includes(artifact))) {
      throw new Error("static library notices must map every dev-package archive exactly once");
    }
    if (
      notices.some(
        (notice) =>
          !notice.component ||
          !notice.version ||
          !notice.license ||
          !notice.sourceArtifact ||
          !Array.isArray(notice.noticeArtifacts) ||
          notice.noticeArtifacts.length === 0,
      )
    ) {
      throw new Error(
        "every static library notice must identify its component, version, license, source artifact, and copyright/license notice artifacts",
      );
    }
    const sourceIds = new Set((manifest.sourceArtifacts ?? []).map((artifact) => artifact?.id));
    const legalNoticeIds = new Set((manifest.noticeArtifacts ?? []).map((artifact) => artifact?.id));
    if (
      notices.some(
        (notice) =>
          !sourceIds.has(notice.sourceArtifact) ||
          notice.noticeArtifacts.some((noticeArtifact) => !legalNoticeIds.has(noticeArtifact)),
      )
    ) {
      throw new Error("static library notice provenance must resolve to pinned source and legal notice artifacts");
    }
    const componentNotices = manifest.bundledComponentNotices;
    if (!Array.isArray(componentNotices) || componentNotices.length !== 29) {
      throw new Error("source manifest must provide exactly 29 bundled component notices");
    }
    const componentNames = componentNotices.map((notice) => notice?.component);
    if (new Set(componentNames).size !== 29) {
      throw new Error("bundled component notices must identify 29 unique components");
    }
    if (
      componentNotices.some(
        (notice) =>
          !notice.version ||
          !notice.license ||
          !sourceIds.has(notice.sourceArtifact) ||
          !Array.isArray(notice.noticeArtifacts) ||
          notice.noticeArtifacts.length === 0 ||
          notice.noticeArtifacts.some((noticeArtifact) => !legalNoticeIds.has(noticeArtifact)),
      )
    ) {
      throw new Error(
        "every bundled component must identify its version, license, corresponding source, and copyright/license notice provenance",
      );
    }
    if (typeof manifest.relinkDocument !== "string" || !manifest.relinkDocument.endsWith("sharp-wasm-relink.md")) {
      throw new Error("source manifest must identify the sharp WASM relink document");
    }

    return { manifest, packageName, version: distribution.version, wasmDigest };
  } catch (error) {
    throw new Error(`sharp WASM compliance gate failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderSharpWasmDistributionNotice(compliance) {
  if (!compliance) {
    return [];
  }
  const { manifest, packageName, version, wasmDigest } = compliance;
  return [
    "## Statically linked sharp WebAssembly distribution",
    "",
    `The installed \`${packageName}@${version}\` artifact is a statically linked Combined Work. It is not covered by the dynamic native-libvips replacement procedure.`,
    "",
    `- Installed WASM SHA-256: \`${wasmDigest}\``,
    `- Sharp application source: ${manifest.applicationSource.repository} tag ${manifest.applicationSource.tag}, commit \`${manifest.applicationSource.commit}\``,
    `- Sharp-libvips build/source: ${manifest.librarySource.repository} tag ${manifest.librarySource.tag}, commit \`${manifest.librarySource.commit}\``,
    `- Relink input: \`${manifest.devPackage.package}@${manifest.devPackage.version}\` (${manifest.devPackage.integrity})`,
    `- ${manifest.devPackage.staticLibraries.length} static library artifacts have individual component/license/source mappings in the pinned source manifest.`,
    `- Source application and relink/install instructions: \`${manifest.relinkDocument}\``,
    "- Production images include the verified source bundle and relink materials under `/app/legal/sources/sharp-wasm`; absence or checksum drift blocks image construction.",
    "",
  ];
}

function usesLgpl(licenseExpression) {
  return licenseTokens(licenseExpression).some((token) => token.startsWith("LGPL-"));
}

function renderLgplDistributionNotice({ packages, nodeModulesPath }) {
  const lgplPackages = installedDistributionPackages(packages, nodeModulesPath).filter((dependency) =>
    usesLgpl(dependency.license),
  );
  if (lgplPackages.length === 0) {
    return [];
  }

  const gplLicenseText = readFileSync(gplLicenseTextPath, "utf8").replace(/\r\n/gu, "\n").trim();
  const lgplLicenseText = readFileSync(lgplLicenseTextPath, "utf8").replace(/\r\n/gu, "\n").trim();
  if (!/GNU GENERAL PUBLIC LICENSE/u.test(gplLicenseText)) {
    throw new Error("GPL-3.0-only license artifact is missing canonical GPL text");
  }
  if (!/GNU LESSER GENERAL PUBLIC LICENSE/u.test(lgplLicenseText)) {
    throw new Error("LGPL-3.0-or-later license artifact is missing canonical LGPL text");
  }

  return [
    "## LGPL-3.0-or-later distribution notice",
    "",
    "The production container may include unmodified optional platform packages that bundle libvips and related shared libraries for sharp. These packages are dynamically loaded by sharp at runtime and remain present under `node_modules` in the container image.",
    "",
    "Installed LGPL packages detected for this notice:",
    "",
    ...lgplPackages.map(
      (dependency) =>
        `- ${dependency.name}@${dependency.version} (${dependency.license}) from \`${workspaceRelative(
          packageDirectory(nodeModulesPath, dependency.name),
        )}\``,
    ),
    "",
    "Pinned upstream source reference for the sharp-libvips package version used by this lockfile:",
    "",
    `- Repository/tag: https://github.com/lovell/sharp-libvips ${sharpLibvipsSourceReference.tag}`,
    `- Commit: ${sharpLibvipsSourceReference.commit}`,
    `- Source URL: ${sharpLibvipsSourceReference.url}`,
    "",
    "Operator distribution gate: before distributing a production container image, attach evidence that the exact source bundle for the LGPL libraries shipped in that image is accessible from the release record. If the upstream source URL is unavailable or the shipped package version changes, block distribution until an accessible source bundle or equivalent release artifact is recorded.",
    "",
    "Relink/install verification gate: do not rely on this notice alone as proof that modified LGPL libraries can be relinked. For each distributed image target, verify and record the sharp/libvips runtime lookup and replacement procedure, or record the alternative source/application-code delivery method selected by legal review.",
    "",
    "SEMForge does not add contractual restrictions on reverse engineering for debugging modifications to those LGPL libraries. The production image retains the installed package files under `node_modules` so operators can inspect the exact shared-library artifacts that were distributed.",
    "",
    "The package README/licensing tables above identify the bundled libraries and upstream project. LGPLv3 incorporates GPLv3 terms, so the canonical GPL-3.0-only and LGPL-3.0-or-later license artifacts vendored for this distribution notice are copied below.",
    "",
    "### GNU General Public License v3",
    "",
    "```text",
    codeFence(gplLicenseText),
    "```",
    "",
    "### GNU Lesser General Public License v3",
    "",
    "```text",
    codeFence(lgplLicenseText),
    "```",
    "",
  ];
}

function markdownTableEscape(value) {
  return String(value).replace(/\|/gu, "\\|");
}

function codeFence(content) {
  return content
    .replace(/[ \t]+$/gmu, "")
    .replace(/```/gu, "`\u200b``");
}

export function renderThirdPartyNotices({
  distributionNotices = false,
  includeInstalledOptional = false,
  lockfileText,
  lockfile,
  nodeModulesPath = "node_modules",
  sharpWasmSourceManifestPath = new URL("./sharp-wasm-source-manifest.json", import.meta.url),
}) {
  const packages = collectProductionPackages(lockfile);
  const sharpWasmCompliance = validateSharpWasmCompliance({
    lockfile,
    nodeModulesPath,
    sourceManifestPath: sharpWasmSourceManifestPath,
  });
  const policyFailures = packages
    .map((dependency) => validateLicenseExpression(`${dependency.name}@${dependency.version}`, dependency.license))
    .filter(Boolean);

  if (policyFailures.length > 0) {
    throw new Error(`license policy failed:\n${policyFailures.join("\n")}`);
  }

  const notices = collectLicenseTexts(packages, nodeModulesPath, { includeInstalledOptional });
  const lines = [
    "# SEMForge Third-Party Notices",
    "",
    includeInstalledOptional
      ? "This product includes third-party production dependencies. This file is generated from `package-lock.json` and installed production packages, including optional platform packages present in this environment, in `node_modules`."
      : "This product includes third-party production dependencies. This file is generated from `package-lock.json` and installed non-optional production packages in `node_modules`.",
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
    includeInstalledOptional
      ? "The following unique texts are copied once from installed production packages, including optional platform packages present in this environment. The production image also retains each installed package's own files under `node_modules`."
      : "The following unique texts are copied once from installed non-optional production packages. Optional platform packages remain listed in the inventory above; production images regenerate distribution notices after installing platform-specific optional packages.",
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

  if (distributionNotices) {
    lines.push(...renderLgplDistributionNotice({ packages, nodeModulesPath }));
  }
  lines.push(...renderSharpWasmDistributionNotice(sharpWasmCompliance));

  return `${lines.join("\n").trimEnd()}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageLockPath = path.resolve(args.packageLockPath);
  const nodeModulesPath = path.resolve(args.nodeModulesPath);
  const outputPath = path.resolve(args.outputPath);
  const lockfileText = await readFile(packageLockPath, "utf8");
  const rendered = renderThirdPartyNotices({
    distributionNotices: args.distributionNotices,
    includeInstalledOptional: args.includeInstalledOptional,
    lockfileText,
    lockfile: JSON.parse(lockfileText),
    nodeModulesPath,
    sharpWasmSourceManifestPath: args.sharpWasmSourceManifestPath,
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
