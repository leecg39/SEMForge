// @TASK P5-PRIVACY - Legal document version/SHA contract for invite consent
// @SPEC docs/release/legal-launch-gate.md
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { parseLegalReleaseManifest } from "@/app/legal/release";
import {
  currentLegalDocuments,
  legalDocumentArtifactsFromManifest,
  legalDocumentCanonicalSubsets,
  requireCurrentLegalAcceptance,
} from "@/server/privacy/legal-documents";
import {
  approvedLegalReleaseManifest,
  approvedLegalReleaseSource,
} from "@/server/privacy/legal-documents.test-fixture";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function canonicalSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

test("초대 수락 문서 identity는 승인 manifest의 documentVersion과 canonical subset SHA에서 도출된다", () => {
  const manifest = parseLegalReleaseManifest(approvedLegalReleaseManifest);
  const documents = currentLegalDocuments(approvedLegalReleaseSource);
  const subsets = legalDocumentCanonicalSubsets(manifest);
  const artifacts = legalDocumentArtifactsFromManifest(manifest);

  assert.deepEqual(documents, {
    terms: {
      key: "terms",
      version: manifest.release.documentVersion,
      sha256: canonicalSha256(subsets.terms),
    },
    privacy: {
      key: "privacy",
      version: manifest.release.documentVersion,
      sha256: canonicalSha256(subsets.privacy),
    },
  });
  assert.match(documents.terms.sha256, /^[0-9a-f]{64}$/u);
  assert.match(documents.privacy.sha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(documents.terms.sha256, documents.privacy.sha256);
  assert.deepEqual(subsets, artifacts);
  assert.match(JSON.stringify(subsets.terms), /월 49,000원\(VAT 포함\)/u);
  assert.match(JSON.stringify(subsets.privacy), /Search Console 읽기 전용 연결 토큰/u);
});

test("manifest 없는 production invite legal identity는 fail closed 한다", () => {
  assert.throws(
    () => currentLegalDocuments({ NODE_ENV: "production" }),
    /LEGAL_RELEASE_MANIFEST is required/u,
  );
});

test("초대 수락은 현재 승인 manifest의 version과 SHA가 정확히 일치해야 한다", () => {
  const documents = currentLegalDocuments(approvedLegalReleaseSource);
  const presentedAt = "2026-08-12T01:00:00.000Z";

  assert.deepEqual(
    requireCurrentLegalAcceptance({
      termsVersion: documents.terms.version,
      termsSha256: documents.terms.sha256,
      privacyVersion: documents.privacy.version,
      privacySha256: documents.privacy.sha256,
      presentedAt,
      accepted: true,
    }, approvedLegalReleaseSource),
    {
      termsVersion: documents.terms.version,
      termsSha256: documents.terms.sha256,
      privacyVersion: documents.privacy.version,
      privacySha256: documents.privacy.sha256,
      presentedAt: new Date(presentedAt),
    },
  );

  assert.throws(
    () =>
      requireCurrentLegalAcceptance({
        termsVersion: documents.terms.version,
        termsSha256: "0".repeat(64),
        privacyVersion: documents.privacy.version,
        privacySha256: documents.privacy.sha256,
        presentedAt,
        accepted: true,
      }, approvedLegalReleaseSource),
    /LEGAL_CONSENT_MISMATCH/u,
  );
  assert.throws(
    () =>
      requireCurrentLegalAcceptance({
        termsVersion: documents.terms.version,
        termsSha256: documents.terms.sha256,
        privacyVersion: documents.privacy.version,
        privacySha256: documents.privacy.sha256,
        presentedAt,
        accepted: false,
      }, approvedLegalReleaseSource),
    /LEGAL_CONSENT_REQUIRED/u,
  );
});
