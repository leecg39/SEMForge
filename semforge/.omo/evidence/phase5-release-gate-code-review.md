# Phase 5 release gate code review

Review target: current uncommitted release-gate changes in `src/server/release/**`, `scripts/release-gate.*`, `scripts/invite.ts`, `scripts/invite.test.ts`, auth invite service/store/schema tests, DB schema/migration invite changes, and `docs/release/operational-gate.md`.

Decision:

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `reportPath`: `.omo/evidence/phase5-release-gate-code-review.md`
- `blockers`: none

Skill-perspective check:

- Loaded `code-review` skill from `/Users/user01/.agents/skills/code-review/SKILL.md`.
- `remove-ai-slops` and `programming` were not available as named skills in the provided skill list, and a local `find ... '*SKILL.md' | rg '/(remove-ai-slops|programming)/SKILL.md$|remove.*slop|programming'` search found no matching skill file. I applied the documented prompt criteria directly.
- `remove-ai-slops` result: no blocking slop found in the current diff. The new tests cover behavior seams: production-runtime refusal before auth service, non-production target propagation, store return value, DB column/check/grants.
- `programming` result: no blocking issue. The previous targetless invite boundary is now carried through CLI -> service input -> store insert/return -> DB `release_target` check.

## CRITICAL

- None.

## HIGH

- None.

## MEDIUM

- None.

## LOW

1. `.omo/evidence/phase5-release-gate.md:54` is stale relative to the current diff; it still reports an older targeted result of `tests 20`, `pass 20`. I verified the current targeted suite directly, so this is not a blocker for code approval.

2. `src/server/auth/schemas.ts:21` duplicates the release-target literal list also defined in `src/server/release/operational-gate.ts:7`. This is acceptable for the current scoped change, but keeping one shared domain constant would reduce drift risk later.

## Review Notes

- The previous blocker is addressed. `scripts/invite.ts` now passes `releaseTarget` into `createInvite`, `createInviteInputSchema` validates/defaults it, `PostgresOperatorInviteStore` inserts and returns it, and the `invites` table persists `release_target` with a check constraint.
- A production runtime still blocks `sandbox`/`staging` before auth service invocation.
- A non-production runtime pointed at a production-like `OPERATOR_DATABASE_URL` no longer creates an indistinguishable invite; the release target reaches the service seam and DB-backed store.
- Paid-production manifest validation remains fail-closed for missing/unreadable/invalid/stale/expired/incomplete attestation manifests.

## Commands Run

```text
git status --short --branch && git diff --stat && git diff --name-only
find /Users/user01/.codex/skills /Users/user01/.agents/skills /Users/user01/.codex/plugins/cache -path '*SKILL.md' 2>/dev/null | rg '/(remove-ai-slops|programming)/SKILL\.md$|remove.*slop|programming'
sed -n '1,260p' /Users/user01/.agents/skills/code-review/SKILL.md
sed -n '1,220p' AGENTS.md
git diff -- semforge/scripts/invite.ts semforge/scripts/invite.test.ts semforge/src/server/auth/schemas.ts semforge/src/server/auth/store.ts semforge/src/server/auth/service.ts semforge/src/server/auth/service.test.ts semforge/src/server/auth/postgres-store.ts semforge/src/server/auth/postgres-store.test.ts
git diff -- semforge/src/db/schema/core.ts semforge/src/db/schema/core.test.ts semforge/src/db/migrations/0000_core.sql semforge/src/db/migrations/core.integration.test.ts semforge/src/db/migrations/meta/0000_snapshot.json semforge/src/server/auth/invite-billing-provisioning.test.ts
nl -ba scripts/invite.ts | sed -n '1,270p'
nl -ba scripts/invite.test.ts | sed -n '1,470p'
nl -ba src/server/auth/schemas.ts | sed -n '1,110p'
nl -ba src/server/auth/store.ts | sed -n '1,90p'
nl -ba src/server/auth/service.ts | sed -n '90,150p'
nl -ba src/server/auth/postgres-store.ts | sed -n '80,180p'
nl -ba src/server/auth/postgres-store.ts | sed -n '180,340p'
nl -ba src/db/schema/core.ts | sed -n '150,225p'
nl -ba src/db/migrations/0000_core.sql | sed -n '120,155p'
nl -ba src/db/migrations/0000_core.sql | sed -n '752,766p'
nl -ba src/server/auth/service.test.ts | sed -n '1,95p'
nl -ba src/server/auth/postgres-store.test.ts | sed -n '55,105p'
nl -ba src/db/schema/core.test.ts | sed -n '265,305p'
nl -ba src/db/migrations/core.integration.test.ts | sed -n '1158,1245p'
rg -n "releaseTarget|release_target|CreateInviteInput|AuthInvite|createInvite\(" src scripts docs -g '*.ts' -g '*.md'
nl -ba src/server/release/operational-gate.ts | sed -n '1,230p'
nl -ba src/server/release/operational-gate.test.ts | sed -n '1,190p'
nl -ba scripts/release-gate.ts | sed -n '1,170p'
nl -ba scripts/release-gate.test.ts | sed -n '1,170p'
nl -ba docs/release/operational-gate.md | sed -n '1,140p'
nl -ba .omo/evidence/phase5-release-gate.md | sed -n '1,260p'
PATH=/Users/user01/.omo/codegraph:$PATH node --version && PATH=/Users/user01/.omo/codegraph:$PATH npm --version && PATH=/Users/user01/.omo/codegraph:$PATH command -v node
git diff --check
PATH=/Users/user01/.omo/codegraph:$PATH npx tsx --test src/db/schema/core.test.ts src/db/migrations/core.integration.test.ts src/server/auth/service.test.ts src/server/auth/postgres-store.test.ts src/server/auth/invite-billing-provisioning.test.ts src/server/release/operational-gate.test.ts scripts/release-gate.test.ts scripts/invite.test.ts
PATH=/Users/user01/.omo/codegraph:$PATH npm run typecheck
PATH=/Users/user01/.omo/codegraph:$PATH npm run lint
```

Verification results:

- Node for verification: `v24.16.0` via `/Users/user01/.omo/codegraph/node`.
- Current targeted suite passed: `tests 88`, `pass 88`, `fail 0`.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `git diff --check` passed.

Note: one earlier targeted run failed while `src/server/auth/invite-billing-provisioning.test.ts` was in a transient 2030 `created_at` state; the file changed during review. I reread the current file and reran the current targeted suite successfully.
