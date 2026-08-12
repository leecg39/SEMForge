import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/license/build-sharp-source-bundle.mjs");

test("source bundle CLI는 pinned source를 포함하고 missing/stale artifact를 fail closed 한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "semforge-sharp-source-bundle-"));
  const inputDirectory = path.join(directory, "input");
  const outputDirectory = path.join(directory, "bundle");
  const sourceContent = Buffer.from("corresponding source fixture\n");
  const notice = Buffer.from("copyright and license fixture\n");
  const relink = Buffer.from("relink fixture\n");
  const relinkScript = Buffer.from("#!/bin/sh\nexit 0\n");
  const wasm = Buffer.from("fixture-static-wasm\n");
  const versions = { emscripten: "6.0.1", vips: "8.18.3" };
  await mkdir(inputDirectory, { recursive: true });
  const sourceDirectory = path.join(inputDirectory, "source");
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(path.join(sourceDirectory, "COPYING"), sourceContent);
  await execFileAsync("tar", ["-czf", path.join(inputDirectory, "source.tar.gz"), "-C", inputDirectory, "source"]);
  const source = await readFile(path.join(inputDirectory, "source.tar.gz"));
  await writeFile(path.join(inputDirectory, "NOTICE"), notice);
  await writeFile(path.join(inputDirectory, "relink.md"), relink);
  await writeFile(path.join(inputDirectory, "relink.sh"), relinkScript);

  const wasmPackageDirectory = path.join(inputDirectory, "wasm-package", "package");
  await mkdir(path.join(wasmPackageDirectory, "lib"), { recursive: true });
  await writeFile(
    path.join(wasmPackageDirectory, "package.json"),
    JSON.stringify({ name: "@img/sharp-wasm32", version: "0.35.3" }),
  );
  await writeFile(path.join(wasmPackageDirectory, "versions.json"), JSON.stringify(versions));
  await writeFile(path.join(wasmPackageDirectory, "lib", "sharp-wasm32-0.35.3.node.wasm"), wasm);
  await execFileAsync("tar", [
    "-czf",
    path.join(inputDirectory, "sharp-wasm32-0.35.3.tgz"),
    "-C",
    path.join(inputDirectory, "wasm-package"),
    "package",
  ]);
  const wasmPackage = await readFile(path.join(inputDirectory, "sharp-wasm32-0.35.3.tgz"));

  const staticLibraries = Array.from({ length: 28 }, (_, index) => `lib/fixture-${index}.a`);
  const devPackageDirectory = path.join(inputDirectory, "dev-package", "package");
  await mkdir(path.join(devPackageDirectory, "lib"), { recursive: true });
  await writeFile(
    path.join(devPackageDirectory, "package.json"),
    JSON.stringify({ name: "@img/sharp-libvips-dev-wasm32", version: "1.3.2" }),
  );
  await writeFile(path.join(devPackageDirectory, "versions.json"), JSON.stringify(versions));
  for (const staticLibrary of staticLibraries) {
    await writeFile(path.join(devPackageDirectory, staticLibrary), `${staticLibrary}\n`);
  }
  await execFileAsync("tar", [
    "-czf",
    path.join(inputDirectory, "sharp-libvips-dev-wasm32-1.3.2.tgz"),
    "-C",
    path.join(inputDirectory, "dev-package"),
    "package",
  ]);
  const devPackage = await readFile(path.join(inputDirectory, "sharp-libvips-dev-wasm32-1.3.2.tgz"));

  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      distribution: {
        package: "@img/sharp-wasm32",
        version: "0.35.3",
        tarballSha256: createHash("sha256").update(wasmPackage).digest("hex"),
        wasmPath: "lib/sharp-wasm32-0.35.3.node.wasm",
        wasmSha256: createHash("sha256").update(wasm).digest("hex"),
        versions,
      },
      applicationSource: { commit: "1018449164723ba0203c1beffaba0e21f7829c18" },
      librarySource: { commit: "4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6" },
      devPackage: {
        package: "@img/sharp-libvips-dev-wasm32",
        version: "1.3.2",
        tarballSha256: createHash("sha256").update(devPackage).digest("hex"),
        staticLibraries,
      },
      sourceArtifacts: [
        {
          id: "fixture-source",
          fileName: "fixture-source.tar.gz",
          url: new URL("source.tar.gz", `file://${inputDirectory}/`).href,
          sha256: createHash("sha256").update(source).digest("hex"),
          correspondingSource: true,
          noticePaths: ["COPYING"],
        },
      ],
      noticeArtifacts: [
        {
          id: "fixture-notice",
          fileName: "fixture-NOTICE",
          url: new URL("NOTICE", `file://${inputDirectory}/`).href,
          sha256: createHash("sha256").update(notice).digest("hex"),
        },
      ],
      buildPatches: [
        {
          id: "fixture-patch",
          fileName: "fixture.patch",
          url: new URL("NOTICE", `file://${inputDirectory}/`).href,
          sha256: createHash("sha256").update(notice).digest("hex"),
        },
      ],
      relinkArtifacts: [
        {
          id: "sharp-wasm32-package",
          fileName: "sharp-wasm32-0.35.3.tgz",
          url: new URL("sharp-wasm32-0.35.3.tgz", `file://${inputDirectory}/`).href,
          sha256: createHash("sha256").update(wasmPackage).digest("hex"),
        },
        {
          id: "sharp-libvips-dev-wasm32-package",
          fileName: "sharp-libvips-dev-wasm32-1.3.2.tgz",
          url: new URL("sharp-libvips-dev-wasm32-1.3.2.tgz", `file://${inputDirectory}/`).href,
          sha256: createHash("sha256").update(devPackage).digest("hex"),
        },
      ],
      relinkDocument: "docs/release/sharp-wasm-relink.md",
    }),
  );

  await execFileAsync(process.execPath, [
    scriptPath,
    "--manifest",
    manifestPath,
    "--output",
    outputDirectory,
    "--relink-document",
    path.join(inputDirectory, "relink.md"),
    "--relink-script",
    path.join(inputDirectory, "relink.sh"),
  ]);

  const index = JSON.parse(await readFile(path.join(outputDirectory, "bundle-index.json"), "utf8")) as {
    files: Array<{ path: string; sha256: string }>;
  };
  assert.deepEqual(
    index.files.map((file) => file.path).sort(),
    [
      "archives/fixture-source.tar.gz",
      "notices/fixture-NOTICE",
      "patches/fixture.patch",
      "relink-inputs/sharp-libvips-dev-wasm32-1.3.2.tgz",
      "relink-inputs/sharp-wasm32-0.35.3.tgz",
      "relink/build-sharp-source-bundle.mjs",
      "relink/relink-sharp-wasm.sh",
      "relink/sharp-wasm-relink.md",
    ],
  );

  await execFileAsync(process.execPath, [
    scriptPath,
    "--manifest",
    manifestPath,
    "--output",
    outputDirectory,
    "--check",
  ]);
  await execFileAsync(process.execPath, [scriptPath, "--manifest", manifestPath, "--manifest-only"]);

  const incompleteIndex = {
    ...index,
    files: index.files.filter((file) => file.path !== "notices/fixture-NOTICE"),
  };
  await writeFile(
    path.join(outputDirectory, "bundle-index.json"),
    `${JSON.stringify(incompleteIndex, null, 2)}\n`,
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--manifest",
      manifestPath,
      "--output",
      outputDirectory,
      "--check",
    ]),
    /sharp source bundle gate failed[\s\S]*bundle index does not exactly enumerate required artifacts/u,
  );
  await writeFile(
    path.join(outputDirectory, "bundle-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );

  const invalidManifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    devPackage: { staticLibraries: string[] };
  };
  invalidManifest.devPackage.staticLibraries[0] = "lib/not-in-registry-package.a";
  const invalidManifestPath = path.join(directory, "invalid-manifest.json");
  await writeFile(invalidManifestPath, JSON.stringify(invalidManifest));
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--manifest",
      invalidManifestPath,
      "--output",
      path.join(directory, "invalid-bundle"),
      "--relink-document",
      path.join(inputDirectory, "relink.md"),
      "--relink-script",
      path.join(inputDirectory, "relink.sh"),
    ]),
    /sharp source bundle gate failed[\s\S]*static libraries do not match/u,
  );

  await writeFile(path.join(outputDirectory, "archives", "fixture-source.tar.gz"), "tampered\n");
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--manifest",
      manifestPath,
      "--output",
      outputDirectory,
      "--check",
    ]),
    /sharp source bundle gate failed[\s\S]*fixture-source\.tar\.gz[\s\S]*SHA-256/u,
  );
});
