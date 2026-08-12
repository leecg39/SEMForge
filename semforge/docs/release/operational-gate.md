# SEMForge operational paid-production release gate

Paid-production invites are fail-closed. The invite CLI refuses to create a paid-production invite unless an operator supplies a schema-versioned release attestation manifest that is bound to the exact git SHA being executed and is still within its expiry window.

Sandbox and staging invites are explicit release targets and do not imply paid production readiness. They are only valid from non-production runtimes. A production runtime can only issue `paid-production` invites, and those require a valid attestation manifest before the auth service is called. This keeps non-production invites from being written to the production invite table where they would otherwise be indistinguishable from paid-production invites.

## Command seams

Validate an attestation before an operational release:

```bash
node --import tsx scripts/release-gate.ts \
  --release-target paid-production \
  --attestation /absolute/path/to/operational-attestation.json
```

Issue a paid-production invite only after that same attestation passes:

```bash
node --import tsx scripts/invite.ts \
  --email owner@example.com \
  --workspace-name "Agency" \
  --release-target paid-production \
  --release-attestation /absolute/path/to/operational-attestation.json
```

Issue a non-production invite explicitly:

```bash
node --import tsx scripts/invite.ts \
  --email owner@example.com \
  --workspace-name "Agency" \
  --release-target sandbox
```

## Manifest contract

The manifest is not an approval generator. It records already-completed operational evidence.
The release gate validates the manifest shape, expiry, git SHA binding, approval timestamps, and evidence-reference format. It cannot independently prove that CI, security/privacy/license review, external approval, live provider validation, Toss reconciliation, recovery rehearsal, migration rehearsal, legal review, or partner smoke testing actually happened. The operator who signs the manifest is responsible for verifying the referenced evidence before issuing a paid-production invite.

```json
{
  "schemaVersion": "semforge.operational-release-attestation.v1",
  "releaseTarget": "paid-production",
  "gitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "issuedAt": "2026-08-12T02:00:00.000Z",
  "expiresAt": "2026-08-19T02:00:00.000Z",
  "gates": {
    "toss_billing_production_approved": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://toss/production-contract"]
    }
  }
}
```

All fourteen gates below are required and each must be an attestation object with `status: "approved"`, a non-future `approvedAt`, and at least one non-placeholder evidence reference:

- `ci_quality_gate_passed`
- `security_privacy_license_gate_passed`
- `toss_billing_production_approved`
- `toss_reconciliation_rehearsed`
- `google_oauth_production_approved`
- `naver_keys_validated`
- `talordata_google_serp_live_validated`
- `resend_domain_verified`
- `managed_postgres16_pitr_rehearsed`
- `object_storage_version_restore_rehearsed`
- `previous_image_rollback_rehearsed`
- `forward_migration_rehearsed`
- `legal_attestation_completed`
- `three_partner_nine_site_first_report_smoke_passed`

Allowed evidence references start with `evidence://`, `https://`, or `/`. Placeholder values such as `todo`, `tbd`, `none`, `n/a`, and `placeholder` are rejected.

The manifest expires no later than 14 days after issuance and must match the current git SHA.

## Complete manifest template

Use this as a template only after each referenced artifact has been manually verified:

```json
{
  "schemaVersion": "semforge.operational-release-attestation.v1",
  "releaseTarget": "paid-production",
  "gitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "issuedAt": "2026-08-12T02:00:00.000Z",
  "expiresAt": "2026-08-19T02:00:00.000Z",
  "gates": {
    "ci_quality_gate_passed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://ci/full-verify-build-audit"]
    },
    "security_privacy_license_gate_passed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://security/privacy-license-review"]
    },
    "toss_billing_production_approved": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://toss/production-contract"]
    },
    "toss_reconciliation_rehearsed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://toss/reconciliation-timeout-webhook-replay"]
    },
    "google_oauth_production_approved": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://google/oauth-production-verification"]
    },
    "naver_keys_validated": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://naver/searchad-datalab-search-api-live-check"]
    },
    "talordata_google_serp_live_validated": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://talordata/google-serp-live-check"]
    },
    "resend_domain_verified": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://resend/sending-domain-verification"]
    },
    "managed_postgres16_pitr_rehearsed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://recovery/postgres16-pitr-rehearsal"]
    },
    "object_storage_version_restore_rehearsed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://recovery/object-storage-version-restore"]
    },
    "previous_image_rollback_rehearsed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://recovery/previous-container-image-rollback"]
    },
    "forward_migration_rehearsed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://database/forward-compatible-migration-rehearsal"]
    },
    "legal_attestation_completed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://legal/privacy-terms-brand-license-attestation"]
    },
    "three_partner_nine_site_first_report_smoke_passed": {
      "status": "approved",
      "approvedAt": "2026-08-12T02:30:00.000Z",
      "evidenceRefs": ["evidence://launch/three-partner-nine-site-first-report-smoke"]
    }
  }
}
```
