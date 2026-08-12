#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exactSharpCommit = "1018449164723ba0203c1beffaba0e21f7829c18";
const exactSharpLibvipsCommit = "4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6";
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    check: false,
    manifestOnly: false,
    manifestPath: new URL("./sharp-wasm-source-manifest.json", import.meta.url),
    outputPath: ".legal/sources/sharp-wasm",
    relinkDocumentPath: "docs/release/sharp-wasm-relink.md",
    relinkScriptPath: "scripts/license/relink-sharp-wasm.sh",
    verifyUpstream: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      args.check = true;
    } else if (argument === "--manifest-only") {
      args.manifestOnly = true;
    } else if (argument === "--verify-upstream") {
      args.verifyUpstream = true;
    } else if (argument === "--manifest") {
      args.manifestPath = requireValue(argv, ++index, argument);
    } else if (argument === "--output") {
      args.outputPath = requireValue(argv, ++index, argument);
    } else if (argument === "--relink-document") {
      args.relinkDocumentPath = requireValue(argv, ++index, argument);
    } else if (argument === "--relink-script") {
      args.relinkScriptPath = requireValue(argv, ++index, argument);
    } else {
      throw new Error(`unknown argument: ${argument}`);
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

function asFilePath(value) {
  return value instanceof URL ? fileURLToPath(value) : path.resolve(value);
}

function validateRelativeFileName(fileName, label) {
  if (
    typeof fileName !== "string" ||
    !fileName ||
    path.isAbsolute(fileName) ||
    fileName !== path.basename(fileName) ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new Error(`${label} must be a plain file name`);
  }
}

async function readSourceUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") {
    return readFile(fileURLToPath(parsed));
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`source URL must use https: ${url}`);
  }
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-time",
        "180",
        parsed.href,
      ],
      { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    throw new Error(`source URL download failed: ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error("manifest schemaVersion must be 1");
  }
  if (manifest.applicationSource?.commit !== exactSharpCommit) {
    throw new Error(`application source must bind sharp commit ${exactSharpCommit}`);
  }
  if (manifest.librarySource?.commit !== exactSharpLibvipsCommit) {
    throw new Error(`library source must bind sharp-libvips commit ${exactSharpLibvipsCommit}`);
  }
  if (
    manifest.distribution?.package !== "@img/sharp-wasm32" ||
    manifest.distribution?.version !== "0.35.3" ||
    typeof manifest.distribution?.wasmPath !== "string" ||
    !/^[a-f0-9]{64}$/u.test(manifest.distribution?.wasmSha256 ?? "") ||
    !/^[a-f0-9]{64}$/u.test(manifest.distribution?.tarballSha256 ?? "") ||
    manifest.distribution?.versions?.emscripten !== "6.0.1"
  ) {
    throw new Error("distribution must bind the exact @img/sharp-wasm32@0.35.3 artifact");
  }
  if (
    manifest.devPackage?.package !== "@img/sharp-libvips-dev-wasm32" ||
    manifest.devPackage?.version !== "1.3.2" ||
    !/^[a-f0-9]{64}$/u.test(manifest.devPackage?.tarballSha256 ?? "") ||
    !Array.isArray(manifest.devPackage?.staticLibraries) ||
    manifest.devPackage.staticLibraries.length !== 28 ||
    new Set(manifest.devPackage.staticLibraries).size !== 28 ||
    manifest.devPackage.staticLibraries.some(
      (library) => typeof library !== "string" || !/^lib\/[a-zA-Z0-9_.+-]+\.a$/u.test(library),
    )
  ) {
    throw new Error("devPackage must bind the exact @img/sharp-libvips-dev-wasm32@1.3.2 static archive set");
  }
  if (!Array.isArray(manifest.sourceArtifacts) || manifest.sourceArtifacts.length === 0) {
    throw new Error("sourceArtifacts must not be empty");
  }
  if (!Array.isArray(manifest.noticeArtifacts) || manifest.noticeArtifacts.length === 0) {
    throw new Error("noticeArtifacts must not be empty");
  }
  for (const [kind, artifacts] of [
    ["source", manifest.sourceArtifacts],
    ["notice", manifest.noticeArtifacts],
    ["patch", manifest.buildPatches],
    ["relink", manifest.relinkArtifacts],
  ]) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      throw new Error(`${kind} artifacts must not be empty`);
    }
    const ids = new Set();
    const names = new Set();
    for (const artifact of artifacts) {
      if (typeof artifact.id !== "string" || !artifact.id || ids.has(artifact.id)) {
        throw new Error(`${kind} artifact IDs must be non-empty and unique`);
      }
      ids.add(artifact.id);
      if (kind === "patch" && !artifact.fileName) {
        artifact.fileName = `${artifact.id}.patch`;
      }
      validateRelativeFileName(artifact.fileName, `${kind} artifact ${artifact.id} fileName`);
      if (names.has(artifact.fileName)) {
        throw new Error(`${kind} artifact file names must be unique`);
      }
      names.add(artifact.fileName);
      if (typeof artifact.url !== "string" || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
        throw new Error(`${kind} artifact ${artifact.id} must have a URL and lowercase SHA-256`);
      }
      if (kind === "source" && (!Array.isArray(artifact.noticePaths) || artifact.noticePaths.length === 0)) {
        throw new Error(`source artifact ${artifact.id} must enumerate copyright/license notice paths`);
      }
    }
  }
}

async function listTarGzip(absolutePath) {
  const { stdout } = await execFileAsync("tar", ["-tzf", absolutePath], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.split("\n").filter(Boolean).map((entry) => entry.replace(/^\.\//u, ""));
}

async function readTarGzipEntry(absolutePath, entryPath) {
  const { stdout } = await execFileAsync("tar", ["-xOzf", absolutePath, entryPath], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

function sameJsonRecord(left, right) {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  const normalize = (record) => Object.entries(record).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "en"));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function validateExactRelinkPackages(manifest, outputPath) {
  const runtimeArtifact = manifest.relinkArtifacts.find((artifact) => artifact.id === "sharp-wasm32-package");
  const devArtifact = manifest.relinkArtifacts.find(
    (artifact) => artifact.id === "sharp-libvips-dev-wasm32-package",
  );
  if (
    !runtimeArtifact ||
    !devArtifact ||
    runtimeArtifact.sha256 !== manifest.distribution.tarballSha256 ||
    devArtifact.sha256 !== manifest.devPackage.tarballSha256
  ) {
    throw new Error("registry relink tarballs do not match distribution/devPackage identities");
  }

  const runtimePath = path.join(outputPath, "relink-inputs", runtimeArtifact.fileName);
  const runtimeEntries = await listTarGzip(runtimePath);
  const runtimeWasmEntry = `package/${manifest.distribution.wasmPath}`;
  if (!runtimeEntries.includes(runtimeWasmEntry)) {
    throw new Error(`registry runtime package is missing ${runtimeWasmEntry}`);
  }
  const runtimePackage = JSON.parse((await readTarGzipEntry(runtimePath, "package/package.json")).toString("utf8"));
  const runtimeVersions = JSON.parse((await readTarGzipEntry(runtimePath, "package/versions.json")).toString("utf8"));
  const runtimeWasm = await readTarGzipEntry(runtimePath, runtimeWasmEntry);
  if (runtimePackage.name !== manifest.distribution.package || runtimePackage.version !== manifest.distribution.version) {
    throw new Error("registry runtime package metadata does not match the manifest");
  }
  if (!sameJsonRecord(runtimeVersions, manifest.distribution.versions)) {
    throw new Error("registry runtime package versions do not match the manifest");
  }
  if (sha256(runtimeWasm) !== manifest.distribution.wasmSha256) {
    throw new Error("registry runtime package WASM SHA-256 does not match the manifest");
  }

  const devPath = path.join(outputPath, "relink-inputs", devArtifact.fileName);
  const devEntries = await listTarGzip(devPath);
  const actualStaticLibraries = devEntries
    .filter((entry) => /^package\/lib\/[a-zA-Z0-9_.+-]+\.a$/u.test(entry))
    .map((entry) => entry.slice("package/".length))
    .sort((left, right) => left.localeCompare(right, "en"));
  const expectedStaticLibraries = [...manifest.devPackage.staticLibraries].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  if (JSON.stringify(actualStaticLibraries) !== JSON.stringify(expectedStaticLibraries)) {
    throw new Error("registry dev package static libraries do not match the manifest");
  }
  const devPackage = JSON.parse((await readTarGzipEntry(devPath, "package/package.json")).toString("utf8"));
  const devVersions = JSON.parse((await readTarGzipEntry(devPath, "package/versions.json")).toString("utf8"));
  if (devPackage.name !== manifest.devPackage.package || devPackage.version !== manifest.devPackage.version) {
    throw new Error("registry dev package metadata does not match the manifest");
  }
  if (!sameJsonRecord(devVersions, manifest.distribution.versions)) {
    throw new Error("registry dev package versions do not match the distributed WASM versions");
  }
}

async function materializeArtifact(artifact, directory, relativeDirectory) {
  const content = await readSourceUrl(artifact.url);
  const actualDigest = sha256(content);
  if (actualDigest !== artifact.sha256) {
    throw new Error(`${artifact.fileName} SHA-256 ${actualDigest} does not match ${artifact.sha256}`);
  }
  const relativePath = `${relativeDirectory}/${artifact.fileName}`;
  await mkdir(path.join(directory, relativeDirectory), { recursive: true });
  await writeFile(path.join(directory, relativePath), content);
  return { path: relativePath, sha256: actualDigest, size: content.byteLength };
}

async function validateArchiveNoticePaths(artifact, absolutePath) {
  if (!Array.isArray(artifact.noticePaths) || artifact.noticePaths.length === 0) {
    return;
  }
  const compressionArguments = artifact.fileName.endsWith(".tar.xz")
    ? ["-tJf", absolutePath]
    : artifact.fileName.endsWith(".tar.gz") || artifact.fileName.endsWith(".tgz")
      ? ["-tzf", absolutePath]
      : null;
  if (!compressionArguments) {
    throw new Error(`${artifact.fileName} has unsupported source archive compression`);
  }
  const { stdout } = await execFileAsync("tar", compressionArguments, { maxBuffer: 64 * 1024 * 1024 });
  const paths = stdout.split("\n").filter(Boolean);
  for (const noticePath of artifact.noticePaths) {
    if (
      typeof noticePath !== "string" ||
      path.isAbsolute(noticePath) ||
      noticePath.split("/").includes("..") ||
      !paths.some((archivePath) => archivePath === noticePath || archivePath.endsWith(`/${noticePath}`))
    ) {
      throw new Error(`${artifact.fileName} is missing declared copyright/license notice path ${noticePath}`);
    }
  }
}

async function buildBundle({ manifest, outputPath, relinkDocumentPath, relinkScriptPath }) {
  const files = [];
  for (const artifact of manifest.sourceArtifacts) {
    const file = await materializeArtifact(artifact, outputPath, "archives");
    await validateArchiveNoticePaths(artifact, path.join(outputPath, file.path));
    files.push(file);
  }
  for (const artifact of manifest.noticeArtifacts) {
    files.push(await materializeArtifact(artifact, outputPath, "notices"));
  }
  for (const artifact of manifest.buildPatches) {
    files.push(await materializeArtifact(artifact, outputPath, "patches"));
  }
  for (const artifact of manifest.relinkArtifacts) {
    files.push(await materializeArtifact(artifact, outputPath, "relink-inputs"));
  }
  await validateExactRelinkPackages(manifest, outputPath);

  const relinkContent = await readFile(relinkDocumentPath);
  await mkdir(path.join(outputPath, "relink"), { recursive: true });
  await writeFile(path.join(outputPath, "relink", "sharp-wasm-relink.md"), relinkContent);
  files.push({
    path: "relink/sharp-wasm-relink.md",
    sha256: sha256(relinkContent),
    size: relinkContent.byteLength,
  });
  const relinkScript = await readFile(relinkScriptPath);
  await writeFile(path.join(outputPath, "relink", "relink-sharp-wasm.sh"), relinkScript, { mode: 0o555 });
  files.push({
    path: "relink/relink-sharp-wasm.sh",
    sha256: sha256(relinkScript),
    size: relinkScript.byteLength,
  });
  const sourceVerifier = await readFile(fileURLToPath(import.meta.url));
  await writeFile(path.join(outputPath, "relink", "build-sharp-source-bundle.mjs"), sourceVerifier, { mode: 0o444 });
  files.push({
    path: "relink/build-sharp-source-bundle.mjs",
    sha256: sha256(sourceVerifier),
    size: sourceVerifier.byteLength,
  });
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));

  const index = {
    schemaVersion: 1,
    manifestSha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`),
    applicationCommit: exactSharpCommit,
    libraryCommit: exactSharpLibvipsCommit,
    files,
  };
  await writeFile(path.join(outputPath, "source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outputPath, "bundle-index.json"), `${JSON.stringify(index, null, 2)}\n`);
}

function expectedBundlePaths(manifest) {
  return [
    ...manifest.sourceArtifacts.map((artifact) => `archives/${artifact.fileName}`),
    ...manifest.noticeArtifacts.map((artifact) => `notices/${artifact.fileName}`),
    ...manifest.buildPatches.map((artifact) => `patches/${artifact.fileName}`),
    ...manifest.relinkArtifacts.map((artifact) => `relink-inputs/${artifact.fileName}`),
    "relink/build-sharp-source-bundle.mjs",
    "relink/relink-sharp-wasm.sh",
    "relink/sharp-wasm-relink.md",
  ].sort((left, right) => left.localeCompare(right, "en"));
}

async function checkBundle({ manifest, outputPath }) {
  const indexPath = path.join(outputPath, "bundle-index.json");
  const copiedManifestPath = path.join(outputPath, "source-manifest.json");
  if (!existsSync(indexPath) || !existsSync(copiedManifestPath)) {
    throw new Error("bundle index or copied source manifest is missing");
  }
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const manifestDigest = sha256(`${JSON.stringify(manifest, null, 2)}\n`);
  if (index.manifestSha256 !== manifestDigest) {
    throw new Error("bundle source manifest SHA-256 is stale");
  }
  const copiedManifest = await readFile(copiedManifestPath);
  if (sha256(copiedManifest) !== manifestDigest) {
    throw new Error("copied source manifest SHA-256 is stale");
  }
  if (!Array.isArray(index.files) || index.files.length === 0) {
    throw new Error("bundle index files are missing");
  }
  if (
    index.schemaVersion !== 1 ||
    index.applicationCommit !== exactSharpCommit ||
    index.libraryCommit !== exactSharpLibvipsCommit
  ) {
    throw new Error("bundle index source identity is stale");
  }
  const indexedPaths = index.files.map((file) => file.path);
  const sortedIndexedPaths = [...indexedPaths].sort((left, right) => left.localeCompare(right, "en"));
  if (
    new Set(indexedPaths).size !== indexedPaths.length ||
    JSON.stringify(sortedIndexedPaths) !== JSON.stringify(expectedBundlePaths(manifest))
  ) {
    throw new Error("bundle index does not exactly enumerate required artifacts");
  }
  for (const file of index.files) {
    if (
      typeof file.path !== "string" ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0
    ) {
      throw new Error("bundle index contains an invalid file record");
    }
    const absolutePath = path.resolve(outputPath, file.path);
    if (!absolutePath.startsWith(`${path.resolve(outputPath)}${path.sep}`) || !existsSync(absolutePath)) {
      throw new Error(`bundle file is missing: ${file.path}`);
    }
    const content = await readFile(absolutePath);
    const actualDigest = sha256(content);
    if (actualDigest !== file.sha256) {
      throw new Error(`${file.path} SHA-256 ${actualDigest} does not match ${file.sha256}`);
    }
    if (content.byteLength !== file.size) {
      throw new Error(`${file.path} size ${content.byteLength} does not match ${file.size}`);
    }
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = asFilePath(args.manifestPath);
    const outputPath = path.resolve(args.outputPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    validateManifest(manifest);
    if ([args.check, args.manifestOnly, args.verifyUpstream].filter(Boolean).length > 1) {
      throw new Error("--check, --manifest-only, and --verify-upstream are mutually exclusive");
    }
    if (args.manifestOnly) {
      return;
    }
    if (args.verifyUpstream) {
      const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "semforge-sharp-source-verify-"));
      try {
        await buildBundle({
          manifest,
          outputPath: temporaryDirectory,
          relinkDocumentPath: path.resolve(args.relinkDocumentPath),
          relinkScriptPath: path.resolve(args.relinkScriptPath),
        });
        await checkBundle({ manifest, outputPath: temporaryDirectory });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    } else if (args.check) {
      await checkBundle({ manifest, outputPath });
    } else {
      await buildBundle({
        manifest,
        outputPath,
        relinkDocumentPath: path.resolve(args.relinkDocumentPath),
        relinkScriptPath: path.resolve(args.relinkScriptPath),
      });
      await checkBundle({ manifest, outputPath });
    }
  } catch (error) {
    throw new Error(`sharp source bundle gate failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
