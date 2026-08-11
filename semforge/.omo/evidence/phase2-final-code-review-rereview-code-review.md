# Phase 2 final code review re-review

- Goal: verify P1 billing runtime CSRF blocker fix
- Reviewed HEAD: `752e563 fix(billing): enforce same-origin csrf guard`
- Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- Scope checked: `src/server/billing/runtime.ts`, `src/server/billing/runtime.test.ts`, related billing runtime contract tests
- Status: CLEAR
- Recommendation: APPROVE

## Skill-perspective check

The requested `remove-ai-slops` and `programming` skills were still not available in the local skill roots by exact `SKILL.md` search. I applied the prompt criteria directly.

Result:

- No deletion-only or tautological test issue found in the targeted fix.
- The new tests exercise the real runtime `createSessionRequireAuth` boundary with a fake DB pool and prove DB is not touched for rejected origins. This is not merely mirroring implementation constants.
- The production change removes unnecessary double-submit CSRF complexity that had no issuance path and aligns billing with the shared same-origin CSRF boundary.

## Evidence checked

Diff inspected:

- `src/server/billing/runtime.ts`
- `src/server/billing/runtime.test.ts`

Targeted command:

```text
PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test src/server/billing/runtime.test.ts src/server/billing/http.contract.test.ts src/server/billing/runtime-blockers.test.ts
```

Result:

- Node: `v24.14.0`
- Tests: 14/14 pass

Key verification:

- Billing mutation auth no longer requires undocumented `semforge_csrf` / `x-csrf-token`.
- `createSessionRequireAuth(pool, trustedOrigin)` calls shared `assertSameOrigin` before DB lookup when `csrf: true`.
- `createBillingHandlers()` passes `env.APP_PUBLIC_URL` as the trusted origin.
- Valid same-origin session reaches DB and hashes the session token before lookup.
- Cross-origin, missing Origin, and Host mismatch requests are rejected with `FORBIDDEN` before any DB query.

## CRITICAL

None.

## HIGH

None.

## MEDIUM

No new P0/P1 blocker. Existing lower-severity observations from the prior report remain non-blocking for this targeted re-review.

## LOW

No new low-severity finding in the targeted fix.

## Final verdict

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `blockers`: []
