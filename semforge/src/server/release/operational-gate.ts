// @TASK P5-V1-T1 - Operational paid production release gate
// @SPEC docs/release/operational-gate.md

export const OPERATIONAL_RELEASE_SCHEMA_VERSION =
  "semforge.operational-release-attestation.v1" as const;

export const RELEASE_TARGETS = ["sandbox", "staging", "paid-production"] as const;
export type ReleaseTarget = (typeof RELEASE_TARGETS)[number];

export const REQUIRED_OPERATIONAL_GATES = [
  "toss_billing_production_approved",
  "google_oauth_production_approved",
  "naver_keys_validated",
  "resend_domain_verified",
  "managed_postgres16_pitr_rehearsed",
  "object_storage_version_restore_rehearsed",
  "legal_attestation_completed",
  "three_partner_nine_site_first_report_smoke_passed",
] as const;

export type RequiredOperationalGate = (typeof REQUIRED_OPERATIONAL_GATES)[number];

export interface OperationalReleaseGateInput {
  readonly releaseTarget: ReleaseTarget;
  readonly now: Date;
  readonly currentGitSha: string;
  readonly manifestText: string | undefined;
}

export interface OperationalReleaseGateDecision {
  readonly allowed: true;
  readonly releaseTarget: ReleaseTarget;
  readonly productionPaid: boolean;
  readonly manifestGitSha: string | null;
}

export class ReleaseGateError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Operational release gate failed: ${issues.join("; ")}`);
    this.name = "ReleaseGateError";
  }
}

const REQUIRED_GATE_SET = new Set<string>(REQUIRED_OPERATIONAL_GATES);
const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "releaseTarget",
  "gitSha",
  "issuedAt",
  "expiresAt",
  "gates",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidDateText(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isGitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function isEvidenceRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed !== value || trimmed.length < 12 || trimmed.length > 500) return false;
  if (/^(todo|tbd|none|n\/a|placeholder)$/iu.test(trimmed)) return false;
  return /^(evidence:\/\/|https:\/\/|\/)/u.test(trimmed);
}

function assertNoIssues(issues: readonly string[]): void {
  if (issues.length > 0) throw new ReleaseGateError(issues);
}

function parseManifest(manifestText: string): unknown {
  try {
    return JSON.parse(manifestText) as unknown;
  } catch {
    throw new ReleaseGateError(["release attestation manifest must be valid JSON"]);
  }
}

export function evaluateOperationalReleaseGate(
  input: OperationalReleaseGateInput,
): OperationalReleaseGateDecision {
  if (input.releaseTarget !== "paid-production") {
    return {
      allowed: true,
      releaseTarget: input.releaseTarget,
      productionPaid: false,
      manifestGitSha: null,
    };
  }

  if (!input.manifestText?.trim()) {
    throw new ReleaseGateError(["release attestation manifest is required"]);
  }
  if (Number.isNaN(input.now.getTime())) {
    throw new ReleaseGateError(["now must be a valid date"]);
  }
  if (!isGitSha(input.currentGitSha)) {
    throw new ReleaseGateError(["current git SHA must be a lowercase 40-character SHA-1"]);
  }

  const parsed = parseManifest(input.manifestText);
  const issues: string[] = [];

  if (!isRecord(parsed)) {
    throw new ReleaseGateError(["release attestation manifest must be a JSON object"]);
  }

  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.has(key)) issues.push(`${key} is not allowed in release attestation`);
  }

  if (parsed.schemaVersion !== OPERATIONAL_RELEASE_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${OPERATIONAL_RELEASE_SCHEMA_VERSION}`);
  }
  if (parsed.releaseTarget !== "paid-production") {
    issues.push("releaseTarget must be paid-production");
  }
  const manifestGitSha = parsed.gitSha;
  if (!isGitSha(manifestGitSha)) {
    issues.push("gitSha must be a lowercase 40-character SHA-1");
  } else if (manifestGitSha !== input.currentGitSha) {
    issues.push("gitSha must match the code being used to issue paid production invites");
  }

  const issuedAt = isValidDateText(parsed.issuedAt) ? new Date(parsed.issuedAt) : null;
  const expiresAt = isValidDateText(parsed.expiresAt) ? new Date(parsed.expiresAt) : null;
  if (!issuedAt) issues.push("issuedAt must be a valid ISO date");
  if (!expiresAt) {
    issues.push("expiresAt must be a valid ISO date");
  } else if (expiresAt <= input.now) {
    issues.push("release attestation manifest is expired");
  }
  if (issuedAt && issuedAt > input.now) issues.push("issuedAt must not be in the future");
  if (issuedAt && expiresAt && expiresAt.getTime() - issuedAt.getTime() > 14 * 24 * 60 * 60 * 1_000) {
    issues.push("release attestation manifest must expire within 14 days");
  }

  if (!isRecord(parsed.gates)) {
    issues.push("gates must be an object");
  } else {
    for (const key of Object.keys(parsed.gates)) {
      if (!REQUIRED_GATE_SET.has(key)) issues.push(`${key} is not a recognized release gate`);
    }

    for (const gateName of REQUIRED_OPERATIONAL_GATES) {
      const gate = parsed.gates[gateName];
      if (!isRecord(gate)) {
        issues.push(`${gateName} must be an attestation object`);
        continue;
      }
      if (gate.status !== "approved") {
        issues.push(`${gateName}.status must be approved`);
      }
      if (!isValidDateText(gate.approvedAt)) {
        issues.push(`${gateName}.approvedAt must be a valid ISO date`);
      } else if (new Date(gate.approvedAt) > input.now) {
        issues.push(`${gateName}.approvedAt must not be in the future`);
      }
      if (!Array.isArray(gate.evidenceRefs) || gate.evidenceRefs.length === 0) {
        issues.push(`${gateName}.evidenceRefs must contain at least one evidence reference`);
      } else {
        for (const [index, evidenceRef] of gate.evidenceRefs.entries()) {
          if (!isEvidenceRef(evidenceRef)) {
            issues.push(`${gateName}.evidenceRefs[${index}] must be a non-placeholder evidence://, https://, or absolute path reference`);
          }
        }
      }
    }
  }

  assertNoIssues(issues);
  if (!isGitSha(manifestGitSha)) {
    throw new ReleaseGateError(["gitSha must be a lowercase 40-character SHA-1"]);
  }

  return {
    allowed: true,
    releaseTarget: "paid-production",
    productionPaid: true,
    manifestGitSha,
  };
}
