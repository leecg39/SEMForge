# GSC binding fix final rereview

Date: 2026-08-12 KST
Reviewer mode: read-only code quality review
Target HEAD inspected: `1355451 fix: narrow auth billing rls grants`
Focused GSC fix commit: `ffddc47 fix: verify gsc property before binding`

## Verdict

- codeQualityStatus: `CLEAR`
- recommendation: `APPROVE`

## Skill-perspective check

- `remove-ai-slops`: local skill file was not available in the provided skills list or discovered skill paths. I applied the prompt's documented criteria directly.
- `programming`: local skill file was not available in the provided skills list or discovered skill paths. I applied the prompt's documented criteria directly.
- Result: no violation found in the focused GSC fix. The added tests exercise behavior and persistence outcomes; they are not deletion-only, tautological, or implementation-constant mirrors.

## Evidence inspected

- Current repository state:
  - `git status --short --branch`
  - `git ls-files -u`
  - `rg -n "^(<<<<<<<|=======|>>>>>>>)" semforge/src semforge/.omo semforge/package.json -S`
- Current HEAD and recent history:
  - `1355451 fix: narrow auth billing rls grants`
  - `ffddc47 fix: verify gsc property before binding`
- Focused GSC code:
  - `semforge/src/server/gsc/service.ts`
  - `semforge/src/server/gsc/service.integration.test.ts`
  - `semforge/src/server/gsc/routes.ts`
  - `semforge/src/server/gsc/google-client.ts`
  - `semforge/src/server/gsc/store.ts`
- Diff check:
  - `git diff --name-only ffddc47..1355451`
  - Result: no GSC implementation/test files changed after the GSC fix commit.

## Verification commands run

From `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge` with Node `v24.18.0`:

- `npx tsx --test src/server/gsc/oauth.contract.test.ts src/server/gsc/google-client.contract.test.ts src/server/gsc/routes.contract.test.ts src/server/gsc/store.integration.test.ts src/server/gsc/service.integration.test.ts`
  - Result: `tests 19`, `pass 19`, `fail 0`.
- `npx tsx --test src/db/migrations/core.integration.test.ts`
  - Result: `tests 17`, `pass 17`, `fail 0`.
- `npm run typecheck`
  - Result: pass.
- `npm run lint`
  - Result: pass.
- `git diff --check`
  - Result: pass.
- Conflict marker scan:
  - Result: 0 matches.
- Unmerged index check:
  - Result: 0 unmerged entries.

## Findings

### CRITICAL

None.
### HIGH

None.

The previous HIGH finding is closed. `GscService.bindProperty()` now:

- trims the requested `propertyUri`;
- calls `service.listProperties()` for the selected workspace and connection;
- requires exact `property.siteUrl === propertyUri`;
- accepts only `siteOwner`, `siteFullUser`, or `siteRestrictedUser`;
- only then calls `upsertGscPropertyBinding()`.

Relevant implementation:

- `semforge/src/server/gsc/service.ts:151`
- `semforge/src/server/gsc/service.ts:157`
- `semforge/src/server/gsc/service.ts:318`

Regression coverage:

- `semforge/src/server/gsc/service.integration.test.ts:331` rejects an unlisted exact property URI and verifies no unauthorized binding row is written.
- `semforge/src/server/gsc/service.integration.test.ts:375` maps `sites.list` timeout to `UPSTREAM` and verifies no binding row is written.
- `semforge/src/server/gsc/service.integration.test.ts:288` continues to cover cross-workspace/site IDOR rejection.

### MEDIUM

None.

### LOW

None.

## Blockers

None.
