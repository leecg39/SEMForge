// @TASK P5-L1-T1 - License notice generation and fail-closed policy
// @TEST scripts/license/generate-third-party-notices.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/license/generate-third-party-notices.mjs");

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
  const packageName = "@img/sharp-libvips-linux-x64";
  const packageDirectory = path.join(directory, "node_modules", "@img", "sharp-libvips-linux-x64");
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
      "# `@img/sharp-libvips-linux-x64`",
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
  assert.match(notice, /@img\/sharp-libvips-linux-x64/u);
  assert.match(notice, /Prebuilt libvips and dependencies/u);
  assert.match(notice, /LGPL-3\.0-or-later distribution notice/u);
  assert.match(notice, /GNU LESSER GENERAL PUBLIC LICENSE/u);
  assert.match(notice, /Corresponding Source/u);
});
