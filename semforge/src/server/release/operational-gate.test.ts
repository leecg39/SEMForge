// @TASK P5-V1-T1 - Operational paid production release gate
// @SPEC docs/release/operational-gate.md
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateOperationalReleaseGate,
  REQUIRED_OPERATIONAL_GATES,
  ReleaseGateError,
} from "./operational-gate";

const NOW = new Date("2026-08-12T03:00:00.000Z");
const CURRENT_SHA = "a".repeat(40);

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
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
      ...overrides,
    },
    null,
    2,
  );
}

describe("operational release gate", () => {
  it("allows sandbox invites without an attestation manifest and marks them non-production", () => {
    const decision = evaluateOperationalReleaseGate({
      releaseTarget: "sandbox",
      now: NOW,
      currentGitSha: CURRENT_SHA,
      manifestText: undefined,
    });

    assert.deepEqual(decision, {
      allowed: true,
      releaseTarget: "sandbox",
      productionPaid: false,
      manifestGitSha: null,
    });
  });

  it("fail-closes paid production invites when the manifest is missing", () => {
    assert.throws(
      () =>
        evaluateOperationalReleaseGate({
          releaseTarget: "paid-production",
          now: NOW,
          currentGitSha: CURRENT_SHA,
          manifestText: undefined,
        }),
      (error) =>
        error instanceof ReleaseGateError &&
        error.issues.includes("release attestation manifest is required"),
    );
  });

  it("rejects expired, stale-SHA, or incomplete paid production attestations atomically", () => {
    const staleSha = manifest({ gitSha: "b".repeat(40) });
    const expired = manifest({ expiresAt: "2026-08-12T02:59:59.999Z" });
    const missingGate = manifest({
      gates: Object.fromEntries(
        REQUIRED_OPERATIONAL_GATES.filter((gate) => gate !== "google_oauth_production_approved").map(
          (gate) => [
            gate,
            {
              status: "approved",
              approvedAt: "2026-08-12T02:30:00.000Z",
              evidenceRefs: [`evidence://${gate}/approved`],
            },
          ],
        ),
      ),
    });

    for (const manifestText of [staleSha, expired, missingGate]) {
      assert.throws(
        () =>
          evaluateOperationalReleaseGate({
            releaseTarget: "paid-production",
            now: NOW,
            currentGitSha: CURRENT_SHA,
            manifestText,
          }),
        ReleaseGateError,
      );
    }
  });

  it("rejects placeholder booleans and requires evidence references for every production gate", () => {
    const manifestText = manifest({
      gates: {
        ...Object.fromEntries(
          REQUIRED_OPERATIONAL_GATES.map((gate) => [
            gate,
            {
              status: "approved",
              approvedAt: "2026-08-12T02:30:00.000Z",
              evidenceRefs: [`evidence://${gate}/approved`],
            },
          ]),
        ),
        toss_billing_production_approved: true,
        resend_domain_verified: {
          status: "approved",
          approvedAt: "2026-08-12T02:30:00.000Z",
          evidenceRefs: [],
        },
      },
    });

    assert.throws(
      () =>
        evaluateOperationalReleaseGate({
          releaseTarget: "paid-production",
          now: NOW,
          currentGitSha: CURRENT_SHA,
          manifestText,
        }),
      (error) =>
        error instanceof ReleaseGateError &&
        error.issues.some((issue) => issue.includes("toss_billing_production_approved")) &&
        error.issues.some((issue) => issue.includes("resend_domain_verified")),
    );
  });

  it("allows paid production only when every external approval, rehearsal, legal, and smoke gate is attested", () => {
    const decision = evaluateOperationalReleaseGate({
      releaseTarget: "paid-production",
      now: NOW,
      currentGitSha: CURRENT_SHA,
      manifestText: manifest(),
    });

    assert.deepEqual(decision, {
      allowed: true,
      releaseTarget: "paid-production",
      productionPaid: true,
      manifestGitSha: CURRENT_SHA,
    });
  });
});
