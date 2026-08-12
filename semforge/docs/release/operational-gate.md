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

All eight gates below are required and each must be an attestation object with `status: "approved"`, a non-future `approvedAt`, and at least one non-placeholder evidence reference:

- `toss_billing_production_approved`
- `google_oauth_production_approved`
- `naver_keys_validated`
- `resend_domain_verified`
- `managed_postgres16_pitr_rehearsed`
- `object_storage_version_restore_rehearsed`
- `legal_attestation_completed`
- `three_partner_nine_site_first_report_smoke_passed`

Allowed evidence references start with `evidence://`, `https://`, or `/`. Placeholder values such as `todo`, `tbd`, `none`, `n/a`, and `placeholder` are rejected.

The manifest expires no later than 14 days after issuance and must match the current git SHA.
