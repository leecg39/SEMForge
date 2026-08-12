// @TASK P5-PRIVACY - Legal document version/SHA contract for invite consent
// @SPEC paid-beta privacy lifecycle blockers
import assert from "node:assert/strict";
import { test } from "node:test";

import { currentLegalDocuments, requireCurrentLegalAcceptance } from "@/server/privacy/legal-documents";

test("초대 수락에 고정할 약관/개인정보 문서는 final version과 SHA-256을 공개한다", () => {
  const documents = currentLegalDocuments();

  assert.equal(documents.terms.key, "terms");
  assert.equal(documents.privacy.key, "privacy");
  assert.match(documents.terms.version, /^beta-final-\d{4}-\d{2}-\d{2}$/u);
  assert.match(documents.privacy.version, /^beta-final-\d{4}-\d{2}-\d{2}$/u);
  assert.match(documents.terms.sha256, /^[0-9a-f]{64}$/u);
  assert.match(documents.privacy.sha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(documents.terms.sha256, documents.privacy.sha256);
});

test("초대 수락은 현재 final 약관/개인정보 version과 SHA가 정확히 일치해야 한다", () => {
  const documents = currentLegalDocuments();
  const presentedAt = "2026-08-12T01:00:00.000Z";

  assert.deepEqual(
    requireCurrentLegalAcceptance({
      termsVersion: documents.terms.version,
      termsSha256: documents.terms.sha256,
      privacyVersion: documents.privacy.version,
      privacySha256: documents.privacy.sha256,
      presentedAt,
      accepted: true,
    }),
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
      }),
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
      }),
    /LEGAL_CONSENT_REQUIRED/u,
  );
});
