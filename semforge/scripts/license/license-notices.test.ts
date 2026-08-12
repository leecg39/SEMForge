// @TASK P5-L1-T1 - License notice generation and fail-closed policy
// @TEST scripts/license/generate-third-party-notices.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/license/generate-third-party-notices.mjs");

const wasmVersions = {
  aom: "3.14.1",
  cgif: "0.5.3",
  emscripten: "6.0.1",
  exif: "0.6.26",
  expat: "2.8.2",
  ffi: "3.6.0",
  glib: "2.89.1",
  heif: "1.23.1",
  highway: "1.4.0",
  imagequant: "2.4.1",
  lcms: "2.19.1",
  mozjpeg: "0826579",
  png: "1.6.58",
  resvg: "0.47.0",
  tiff: "4.7.2rc2",
  uhdr: "1acdbed",
  vips: "8.18.3",
  webp: "1.6.0",
  "zlib-ng": "2.3.3",
} as const;

async function makeFixture(packageName: string, license: string): Promise<{
  readonly directory: string;
  readonly outputPath: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "semforge-license-"));
  const packageDirectory = path.join(directory, "node_modules", packageName);
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(directory, "package-lock.json"),
    JSON.stringify(
      {
        lockfileVersion: 3,
        packages: {
          "": { dependencies: { [packageName]: "1.0.0" } },
          [`node_modules/${packageName}`]: { version: "1.0.0", license },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(packageDirectory, "LICENSE"), `${packageName} license text\n`);

  return { directory, outputPath: path.join(directory, "THIRD_PARTY_NOTICES.md") };
}

test("license notice CLI는 production dependency inventory와 node_modules 라이선스 원문을 생성한다", async () => {
  const fixture = await makeFixture("allowed-package", "MIT");

  await execFileAsync(process.execPath, [
    scriptPath,
    "--package-lock",
    path.join(fixture.directory, "package-lock.json"),
    "--node-modules",
    path.join(fixture.directory, "node_modules"),
    "--output",
    fixture.outputPath,
  ]);

  const notice = await readFile(fixture.outputPath, "utf8");
  assert.match(notice, /allowed-package/u);
  assert.match(notice, /MIT/u);
  assert.match(notice, /allowed-package license text/u);
});

test("license notice CLI는 금지·unknown 라이선스를 fail closed로 거부한다", async () => {
  const fixture = await makeFixture("bad-package", "GPL-3.0-only");

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--package-lock",
      path.join(fixture.directory, "package-lock.json"),
      "--node-modules",
      path.join(fixture.directory, "node_modules"),
      "--output",
      fixture.outputPath,
    ]),
    /license policy failed[\s\S]*bad-package@1\.0\.0/u,
  );
});

test("distribution notice는 설치된 optional sharp-libvips README와 LGPL 고지를 포함한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "semforge-license-libvips-"));
  const packageName = "@img/fixture-sharp-libvips-linux-x64";
  const packageDirectory = path.join(directory, "node_modules", "@img", "fixture-sharp-libvips-linux-x64");
  const outputPath = path.join(directory, "THIRD_PARTY_NOTICES.md");

  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(directory, "package-lock.json"),
    JSON.stringify(
      {
        lockfileVersion: 3,
        packages: {
          "": { optionalDependencies: { [packageName]: "1.3.2" } },
          [`node_modules/${packageName}`]: {
            version: "1.3.2",
            license: "LGPL-3.0-or-later",
            optional: true,
            os: ["linux"],
            cpu: ["x64"],
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(packageDirectory, "README.md"),
    [
      "# `@img/fixture-sharp-libvips-linux-x64`",
      "",
      "Prebuilt libvips and dependencies for use with sharp on Linux x64.",
      "",
      "## Licensing",
      "",
      "| Library | Used under the terms of |",
      "| --- | --- |",
      "| libvips | LGPLv3 |",
      "",
    ].join("\n"),
  );

  await execFileAsync(process.execPath, [
    scriptPath,
    "--package-lock",
    path.join(directory, "package-lock.json"),
    "--node-modules",
    path.join(directory, "node_modules"),
    "--output",
    outputPath,
    "--include-installed-optional",
    "--distribution-notices",
  ]);

  const notice = await readFile(outputPath, "utf8");
  assert.match(notice, /@img\/fixture-sharp-libvips-linux-x64/u);
  assert.match(notice, /Prebuilt libvips and dependencies/u);
  assert.match(notice, /LGPL-3\.0-or-later distribution notice/u);
  assert.match(notice, /GNU GENERAL PUBLIC LICENSE/u);
  assert.match(notice, /GNU LESSER GENERAL PUBLIC LICENSE/u);
  assert.match(notice, /Corresponding Source/u);
  assert.match(notice, /https:\/\/github\.com\/lovell\/sharp-libvips\/tree\/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/u);
  assert.match(notice, /Operator distribution gate/u);
  assert.match(notice, /Relink\/install verification gate/u);
});

test("설치된 sharp WASM은 exact application/source/relink manifest가 없으면 fail closed 한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "semforge-license-sharp-wasm-"));
  const packageName = "@img/sharp-wasm32";
  const packageDirectory = path.join(directory, "node_modules", "@img", "sharp-wasm32");
  const outputPath = path.join(directory, "THIRD_PARTY_NOTICES.md");
  const manifestPath = path.join(directory, "sharp-wasm-source-manifest.json");
  const wasm = Buffer.from("fixture-static-wasm");

  await mkdir(path.join(packageDirectory, "lib"), { recursive: true });
  await writeFile(
    path.join(directory, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { optionalDependencies: { [packageName]: "0.35.3" } },
        [`node_modules/${packageName}`]: {
          version: "0.35.3",
          integrity: "sha512-fixture-registry-integrity",
          license: "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
          optional: true,
        },
      },
    }),
  );
  await writeFile(
    path.join(packageDirectory, "package.json"),
    JSON.stringify({ name: packageName, version: "0.35.3", license: "Apache-2.0 AND LGPL-3.0-or-later AND MIT" }),
  );
  await writeFile(path.join(packageDirectory, "README.md"), "static WebAssembly LGPL notice\n");
  await writeFile(path.join(packageDirectory, "versions.json"), JSON.stringify(wasmVersions));
  await writeFile(path.join(packageDirectory, "lib", "sharp-wasm32-0.35.3.node.wasm"), wasm);
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      distribution: {
        package: packageName,
        version: "0.35.3",
        integrity: "sha512-fixture-registry-integrity",
        wasmPath: "lib/sharp-wasm32-0.35.3.node.wasm",
        wasmSha256: createHash("sha256").update(wasm).digest("hex"),
        versions: wasmVersions,
      },
      applicationSource: {
        repository: "https://github.com/lovell/sharp",
        tag: "v0.35.3",
        commit: "1018449164723ba0203c1beffaba0e21f7829c18",
      },
      librarySource: {
        repository: "https://github.com/lovell/sharp-libvips",
        tag: "v1.3.2",
        commit: "4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6",
      },
      devPackage: {
        package: "@img/sharp-libvips-dev-wasm32",
        version: "1.3.2",
        integrity: "sha512-dev-fixture",
        staticLibraries: Array.from({ length: 28 }, (_, index) => `lib/fixture-${index}.a`),
      },
      sourceArtifacts: [
        { id: "aom", fileName: "aom.tar.gz", url: "https://example.invalid/aom", sha256: "a".repeat(64), noticePaths: ["LICENSE"] },
        { id: "glib", fileName: "glib.tar.xz", url: "https://example.invalid/glib", sha256: "b".repeat(64), noticePaths: ["COPYING"] },
      ],
      noticeArtifacts: [
        { id: "wasm-notices", fileName: "wasm-notices.md", url: "https://example.invalid/notices", sha256: "c".repeat(64) },
      ],
      staticLibraryNotices: Array.from({ length: 28 }, (_, index) => ({
        artifact: `lib/fixture-${index}.a`,
        component: index === 0 ? "aom" : "glib",
        version: index === 0 ? "3.14.1" : "2.89.1",
        license: index === 0 ? "BSD-2-Clause" : "LGPL-3.0-or-later",
        sourceArtifact: index === 0 ? "aom" : "glib",
        noticeArtifacts: ["wasm-notices"],
      })),
      bundledComponentNotices: Array.from({ length: 29 }, (_, index) => ({
        component: `component-${index}`,
        version: "1.0.0",
        license: "MIT",
        sourceArtifact: index === 0 ? "aom" : "glib",
        noticeArtifacts: ["wasm-notices"],
      })),
      relinkDocument: "docs/release/sharp-wasm-relink.md",
    }),
  );

  await execFileAsync(process.execPath, [
    scriptPath,
    "--package-lock",
    path.join(directory, "package-lock.json"),
    "--node-modules",
    path.join(directory, "node_modules"),
    "--output",
    outputPath,
    "--include-installed-optional",
    "--distribution-notices",
    "--sharp-wasm-source-manifest",
    manifestPath,
  ]);

  const notice = await readFile(outputPath, "utf8");
  assert.match(notice, /Statically linked sharp WebAssembly distribution/u);
  assert.match(notice, /1018449164723ba0203c1beffaba0e21f7829c18/u);
  assert.match(notice, /4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/u);
  assert.match(notice, /28 static library artifacts/u);
  assert.match(notice, /sharp-wasm-relink\.md/u);

  const incompatibleManifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    distribution: { wasmSha256: string };
  };
  incompatibleManifest.distribution.wasmSha256 = "0".repeat(64);
  await writeFile(manifestPath, JSON.stringify(incompatibleManifest));

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--package-lock",
      path.join(directory, "package-lock.json"),
      "--node-modules",
      path.join(directory, "node_modules"),
      "--output",
      outputPath,
      "--sharp-wasm-source-manifest",
      manifestPath,
    ]),
    /sharp WASM compliance gate failed[\s\S]*WASM SHA-256/u,
  );
});
