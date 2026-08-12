// @TASK P5-PRIVACY - Invite legal document identity from approved release manifest
// @SPEC docs/release/legal-launch-gate.md
import { createHash } from "node:crypto";

import {
  LegalReleaseConfigurationError,
  readLegalReleaseManifest,
  type LegalReleaseManifest,
} from "@/app/legal/release";

export type LegalDocumentKey = "terms" | "privacy";

export interface LegalDocumentIdentity {
  readonly key: LegalDocumentKey;
  readonly version: string;
  readonly sha256: string;
}

export interface LegalAcceptanceInput {
  readonly termsVersion: string;
  readonly termsSha256: string;
  readonly privacyVersion: string;
  readonly privacySha256: string;
  readonly presentedAt: Date | string;
  readonly accepted?: boolean;
}

export interface VerifiedLegalAcceptance {
  readonly termsVersion: string;
  readonly termsSha256: string;
  readonly privacyVersion: string;
  readonly privacySha256: string;
  readonly presentedAt: Date;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function legalDocumentCanonicalSubsets(manifest: LegalReleaseManifest): {
  readonly terms: JsonValue;
  readonly privacy: JsonValue;
} {
  return {
    terms: {
      operator: manifest.operator,
      release: { documentVersion: manifest.release.documentVersion },
      terms: manifest.terms,
    } satisfies JsonValue,
    privacy: {
      operator: manifest.operator,
      privacy: manifest.privacy,
      release: { documentVersion: manifest.release.documentVersion },
    } satisfies JsonValue,
  };
}

export function legalDocumentsFromManifest(manifest: LegalReleaseManifest): {
  readonly terms: LegalDocumentIdentity;
  readonly privacy: LegalDocumentIdentity;
} {
  const subsets = legalDocumentCanonicalSubsets(manifest);
  return {
    terms: {
      key: "terms",
      version: manifest.release.documentVersion,
      sha256: sha256(canonicalJson(subsets.terms)),
    },
    privacy: {
      key: "privacy",
      version: manifest.release.documentVersion,
      sha256: sha256(canonicalJson(subsets.privacy)),
    },
  };
}

export function currentLegalDocuments(
  source: Record<string, string | undefined> = process.env,
): {
  readonly terms: LegalDocumentIdentity;
  readonly privacy: LegalDocumentIdentity;
} {
  const manifest = readLegalReleaseManifest(source);
  if (!manifest) {
    throw new LegalReleaseConfigurationError([
      "LEGAL_RELEASE_MANIFEST is required for invite legal consent",
    ]);
  }
  return legalDocumentsFromManifest(manifest);
}

export function requireCurrentLegalAcceptance(
  input: LegalAcceptanceInput,
  source: Record<string, string | undefined> = process.env,
): VerifiedLegalAcceptance {
  if (!input.accepted) throw new Error("LEGAL_CONSENT_REQUIRED");
  const presentedAt = input.presentedAt instanceof Date
    ? input.presentedAt
    : new Date(input.presentedAt);
  if (Number.isNaN(presentedAt.getTime())) throw new Error("LEGAL_CONSENT_INVALID_TIME");
  const documents = currentLegalDocuments(source);
  if (
    input.termsVersion !== documents.terms.version ||
    input.termsSha256 !== documents.terms.sha256 ||
    input.privacyVersion !== documents.privacy.version ||
    input.privacySha256 !== documents.privacy.sha256
  ) {
    throw new Error("LEGAL_CONSENT_MISMATCH");
  }
  return {
    termsVersion: documents.terms.version,
    termsSha256: documents.terms.sha256,
    privacyVersion: documents.privacy.version,
    privacySha256: documents.privacy.sha256,
    presentedAt,
  };
}
