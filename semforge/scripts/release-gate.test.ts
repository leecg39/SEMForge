// @TASK P5-V1-T1 - Operational paid production release gate CLI tests
// @SPEC docs/release/operational-gate.md
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REQUIRED_OPERATIONAL_GATES } from "@/server/release/operational-gate";

import { parseReleaseGateArgs, runReleaseGate } from "./release-gate";

const NOW = new Date("2026-08-12T03:00:00.000Z");
const CURRENT_SHA = "a".repeat(40);

function manifest(): string {
  return JSON.stringify({
    schemaVersion: "semforge.operational-release-attestation.v1",
    releaseTarget: "paid-production",
    gitSha: CURRENT_SHA,
    issuedAt: "2026-08-12T02:00:00.000Z",
    expiresAt: "2026-08-19T02:00:00.000Z",
    gates: Object.fromEntries(
      REQUIRED_OPERATIONAL_GATES.map((gate) => [
        gate,
        {
          status: "approved",
          approvedAt: "2026-08-12T02:30:00.000Z",
          evidenceRefs: [`evidence://${gate}/approved`],
        },
      ]),
    ),
  });
}

describe("release-gate CLI", () => {
  it("requires explicit paid production attestation path", () => {
    assert.throws(() => parseReleaseGateArgs(["--release-target", "paid-production"]));
    assert.throws(() =>
      parseReleaseGateArgs([
        "--release-target",
        "paid-production",
        "--attestation",
        "relative.json",
      ]),
    );
  });

  it("prints a machine-readable allow decision for a valid paid production manifest", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runReleaseGate(
      ["--release-target", "paid-production", "--attestation", "/tmp/release.json"],
      {
        now: () => NOW,
        currentGitSha: () => CURRENT_SHA,
        readFile: (path) => {
          assert.equal(path, "/tmp/release.json");
          return manifest();
        },
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(stderr, []);
    assert.deepEqual(JSON.parse(stdout.join("")), {
      allowed: true,
      releaseTarget: "paid-production",
      productionPaid: true,
      manifestGitSha: CURRENT_SHA,
    });
  });

  it("does not require git or an attestation file for sandbox validation", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runReleaseGate(["--release-target", "sandbox"], {
      now: () => NOW,
      currentGitSha: () => {
        throw new Error("sandbox must not require git");
      },
      readFile: () => {
        throw new Error("sandbox must not read production attestation");
      },
      writeStdout: (value) => stdout.push(value),
      writeStderr: (value) => stderr.push(value),
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(stderr, []);
    assert.deepEqual(JSON.parse(stdout.join("")), {
      allowed: true,
      releaseTarget: "sandbox",
      productionPaid: false,
      manifestGitSha: null,
    });
  });

  it("treats unreadable paid production attestations as release gate failures", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runReleaseGate(
      ["--release-target", "paid-production", "--attestation", "/tmp/missing.json"],
      {
        now: () => NOW,
        currentGitSha: () => CURRENT_SHA,
        readFile: () => {
          throw new Error("ENOENT /tmp/missing.json with local path detail");
        },
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["운영 release gate 검증에 실패했습니다.\n"]);
  });

  it("fails closed without leaking invalid manifest details", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runReleaseGate(
      ["--release-target", "paid-production", "--attestation", "/tmp/release.json"],
      {
        now: () => NOW,
        currentGitSha: () => CURRENT_SHA,
        readFile: () => '{"leaked":"postgres://operator:super-secret@example"}',
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value),
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ["운영 release gate 검증에 실패했습니다.\n"]);
    assert.equal(stderr.join("").includes("super-secret"), false);
    assert.equal(stderr.join("").includes("postgres://"), false);
  });
});
