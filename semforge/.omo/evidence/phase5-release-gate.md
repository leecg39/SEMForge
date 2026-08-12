# Phase 5 operational paid-production release gate evidence

Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-5-release-gate/semforge`

Base HEAD: `3702adec17136b4f98417496d85fa7b6c8740f99`

Runtime:

- Node: `v24.16.0`
- npm: `11.7.0`

## Implemented seam

- Public domain seam: `src/server/release/operational-gate.ts`
- Operator validation CLI: `scripts/release-gate.ts`
- Invite issuance integration: `scripts/invite.ts`
- Trusted persistence seam: `invites.release_target`
- Operator runbook: `docs/release/operational-gate.md`

Paid-production invite issuance now fails closed before calling the auth service unless the operator supplies a schema-versioned, non-expired release attestation manifest bound to the current git SHA.

Required gates:

- `toss_billing_production_approved`
- `google_oauth_production_approved`
- `naver_keys_validated`
- `resend_domain_verified`
- `managed_postgres16_pitr_rehearsed`
- `object_storage_version_restore_rehearsed`
- `legal_attestation_completed`
- `three_partner_nine_site_first_report_smoke_passed`

Sandbox/staging are explicit non-production release targets and do not require the paid-production attestation. A production runtime rejects sandbox/staging before the auth service is called. If a non-production runtime is pointed at a production-like operator DSN, the target still reaches the auth service and is persisted in `invites.release_target`, so non-production invites are not indistinguishable from paid-production invites at the DB boundary.

No production approval manifest, external provider credential, or fake approval artifact was created or committed.

## RED evidence

Command attempted after adding release-gate tests and before implementation:

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npm test -- src/server/release/operational-gate.test.ts scripts/invite.test.ts
```

Binary observable:

- The package script invoked the full suite.
- New invite CLI release-target tests failed before implementation:
  - `requires a valid operational release attestation before paid production invite creation`
  - `keeps sandbox invites explicit and does not require production attestation`
- The run was interrupted after RED was observed to avoid wasting time on unrelated full-suite tests.

## GREEN and regression evidence

Targeted seam:

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npx tsx --test src/server/auth/invite-billing-provisioning.test.ts src/server/auth/service.test.ts src/server/auth/postgres-store.test.ts src/db/schema/core.test.ts src/db/migrations/core.integration.test.ts src/server/release/operational-gate.test.ts scripts/release-gate.test.ts scripts/invite.test.ts
```

Result:

- `tests 88`
- `pass 88`
- `fail 0`

Full verify:

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npm run verify
```

Result:

- ESLint: pass
- TypeScript: pass
- `tests 496`
- `pass 496`
- `fail 0`

Schema drift:

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npm run db:generate
```

Result:

- `33 tables`
- `No schema changes, nothing to migrate`

Production build and audits:

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npm run build
PATH=/Users/user01/.omo/codegraph:$PATH npm audit --audit-level=high
PATH=/Users/user01/.omo/codegraph:$PATH npm audit --omit=dev --audit-level=high
```

Result:

- Next production build: pass
- Static pages: `33/33`
- Full audit: `found 0 vulnerabilities`
- Production audit: `found 0 vulnerabilities`

CLI binary behavior:

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npx tsx scripts/release-gate.ts --release-target sandbox
```

Observed stdout:

```json
{"allowed":true,"releaseTarget":"sandbox","productionPaid":false,"manifestGitSha":null}
```

```bash
PATH=/Users/user01/.omo/codegraph:$PATH npx tsx scripts/invite.ts --email owner@example.com --workspace-name Agency --release-target paid-production
```

Observed stderr and exit:

```text
운영 유료 초대 release gate 검증에 실패했습니다.
invite_exit=1
```

Production runtime non-production target behavior:

```bash
NODE_ENV=production npx tsx scripts/invite.ts --email owner@example.com --workspace-name Agency --release-target sandbox
```

Observed:

- Auth service is not called.
- Exit code is `1`.
- Generic stderr is `운영 유료 초대 release gate 검증에 실패했습니다.`

Non-production target persistence behavior:

- `scripts/invite.test.ts` verifies `--release-target staging` reaches `createInvite` as `releaseTarget: "staging"` even when `OPERATOR_DATABASE_URL` resembles a production DSN.
- `src/server/auth/postgres-store.test.ts` verifies `PostgresOperatorInviteStore` returns a stored `releaseTarget`.
- `src/db/schema/core.test.ts` and `src/db/migrations/core.integration.test.ts` verify `invites.release_target`, `invites_release_target_ck`, and operator insert grants.

Diff hygiene:

```bash
git diff --check
```

Result: pass, no output.

## Related fixture hardening

`src/server/auth/invite-billing-provisioning.test.ts` previously used a fixed `2026-08-11T03:00:00.000Z` expiry base. On the current execution date, the insert violated `invites_expiry_window_ck` because PostgreSQL checks against DB `now()`. The fixture now uses the execution time as its base and sets both `created_at` and `expires_at` coherently, preserving the same transaction behavior assertion.

## Review evidence

Read-only review artifact:

- `.omo/evidence/phase5-release-gate-code-review.md`

Result:

- `codeQualityStatus`: `CLEAR`
- `recommendation`: `APPROVE`
- `blockers`: none
