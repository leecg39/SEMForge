# Phase 5 release gate delta code review

Review target: latest uncommitted delta on `codex/phase-5-release-gate` in `/Users/user01/Music/SEMForge-worktrees/phase-5-release-gate/semforge`.

Delta reviewed:

- `src/server/release/operational-gate.ts`
- `src/server/release/operational-gate.test.ts`
- `docs/release/operational-gate.md`

Decision:

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `reportPath`: `.omo/evidence/phase5-release-gate-code-review.md`
- `blockers`: none

Skill-perspective check:

- Loaded `code-review` skill from `/Users/user01/.agents/skills/code-review/SKILL.md`.
- `remove-ai-slops` and `programming` were not available as named skills in the provided skill list, and a local `find ... '*SKILL.md' | rg '/(remove-ai-slops|programming)/SKILL.md$|remove.*slop|programming'` search found no matching skill file. I applied the documented prompt criteria directly.
- `remove-ai-slops` result: no blocking slop found. The new test checks the added gate set, existing table-driven manifest tests now build from the expanded required gate constant, and I independently checked that every one of the 14 required gates is enforced as required.
- `programming` result: no blocking issue. The delta keeps the release gate logic simple: a single required-gates constant drives both positive and missing-gate behavior.

## CRITICAL

- None.

## HIGH

- None.

## MEDIUM

- None.

## LOW

- None.

## Checks

- Existing 8 gates are still present:
  - `toss_billing_production_approved`
  - `google_oauth_production_approved`
  - `naver_keys_validated`
  - `resend_domain_verified`
  - `managed_postgres16_pitr_rehearsed`
  - `object_storage_version_restore_rehearsed`
  - `legal_attestation_completed`
  - `three_partner_nine_site_first_report_smoke_passed`
- New 6 gates are present:
  - `ci_quality_gate_passed`
  - `security_privacy_license_gate_passed`
  - `talordata_google_serp_live_validated`
  - `previous_image_rollback_rehearsed`
  - `forward_migration_rehearsed`
  - `toss_reconciliation_rehearsed`
- Total required gate count is 14.
- Paid-production manifests require all 14 gates. I ran an explicit assertion that omitting each gate in turn raises `ReleaseGateError`.
- Sandbox/staging distinction is preserved by existing invite release-target persistence and production-runtime blocking; the related invite CLI tests still pass.
- The docs state the manual manifest limitation: the release gate validates shape/expiry/SHA/timestamps/evidence-reference format, but cannot independently prove the external approval, live provider check, recovery rehearsal, or legal review actually happened.

## Commands Run

```text
git status --short --branch && git diff --stat && git diff --name-only
find /Users/user01/.codex/skills /Users/user01/.agents/skills /Users/user01/.codex/plugins/cache -path '*SKILL.md' 2>/dev/null | rg '/(remove-ai-slops|programming)/SKILL\.md$|remove.*slop|programming'
sed -n '1,260p' /Users/user01/.agents/skills/code-review/SKILL.md
sed -n '1,220p' AGENTS.md
git diff -- semforge/src/server/release/operational-gate.ts semforge/src/server/release/operational-gate.test.ts semforge/docs/release/operational-gate.md
nl -ba src/server/release/operational-gate.ts | sed -n '1,240p'
nl -ba src/server/release/operational-gate.test.ts | sed -n '1,260p'
nl -ba docs/release/operational-gate.md | sed -n '1,260p'
rg -n "releaseTarget|release_target|RELEASE_TARGETS|assertProductionRuntimeTarget|createInvite\(" scripts src/server/auth src/db/schema src/db/migrations -g '*.ts' -g '*.sql'
PATH=/Users/user01/.omo/codegraph:$PATH node --version && PATH=/Users/user01/.omo/codegraph:$PATH npm --version && PATH=/Users/user01/.omo/codegraph:$PATH command -v node
git diff --check
node - <<'NODE' ... parse REQUIRED_OPERATIONAL_GATES count ...
PATH=/Users/user01/.omo/codegraph:$PATH npx tsx --test src/server/release/operational-gate.test.ts scripts/release-gate.test.ts scripts/invite.test.ts
PATH=/Users/user01/.omo/codegraph:$PATH npx tsx -e '... assert every omitted gate is rejected ...'
PATH=/Users/user01/.omo/codegraph:$PATH npm run typecheck
PATH=/Users/user01/.omo/codegraph:$PATH npm run lint
node - <<'NODE' ... count docs required-list/template refs ...
```

Verification results:

- Node for verification: `v24.16.0` via `/Users/user01/.omo/codegraph/node`.
- `git diff --check`: pass.
- Release/invite targeted tests: `tests 24`, `pass 24`, `fail 0`.
- Manual all-missing-gates assertion: `requiredGateCount: 14`, `missingGateCasesRejected: 14`.
- `npm run typecheck`: pass.
- `npm run lint`: pass.
