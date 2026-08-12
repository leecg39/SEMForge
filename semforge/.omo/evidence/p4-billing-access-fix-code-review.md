# P4 Billing Access Fix Code Review

## Scope

- Goal: paid-beta server billing access enforcement.
- Worktree: `/Users/user01/Music/SEMForge-worktrees/parallel-p4-billing-access-fix/semforge/semforge`
- Central HEAD reviewed against current working diff: `25e276406df409559fb93bb8f129f2829f084552`
- Original requested base noted: `bb9bb6f4f8f33fe88229759554d2cdb4fa886821`
- Review scope after latest parent clarification: current billing-access working diff only. The `bb9bb6f..HEAD` range includes central phase-4 merge files under deploy/db/worker/ops; those were not counted as this billing-access diff.

## Skill Perspective Check

- `code-review` skill was loaded from `/Users/user01/.agents/skills/code-review/SKILL.md`.
- `remove-ai-slops` and `programming` skill files were searched under available skill roots and were not present/readable in this session.
- Fallback applied from prompt criteria:
  - remove-ai-slops pass: checked for deletion-only tests, tautological removal tests, implementation-constant mirroring, and unnecessary production parsing/extraction.
  - programming pass: checked for brittle prompt tests, implementation-mirroring tests, untyped escape hatches, needless abstraction, and validation/parsing outside required boundaries.
- Result: no violations found. The new tests exercise route behavior, tenant boundaries, billing decisions, SQL cutoff behavior, and PDF/detail real-period loading rather than only checking text deletions or mirrored constants.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None.

## Review Notes

- Billing access policy is centralized through `decideBillingAccess` via `src/server/billing/access.ts`.
- Runtime billing access uses `getPool("billing")`; `src/db/client.ts` maps that role to `BILLING_DATABASE_URL`.
- Access lookup queries only the authenticated `workspace_id`.
- Sites, tracking, GSC, report branding, report list/detail, and report PDF routes now enforce server-side billing access with the requested `workspace:read`, `workspace:write`, or `report:read` capabilities.
- Report detail/PDF load tenant-scoped report records before billing period checks, preserving 404 behavior for foreign/nonexistent report IDs while using DB-backed `period_end`.
- Report list pagination applies the past-due cutoff in SQL before pagination.
- No forbidden edits are present in the current billing-access working diff under `src/db`, `src/worker`, `deploy`, `package*`, or ops paths. The only such paths relative to `bb9bb6f..HEAD` belong to the merged central phase-4 branch.

## Verification

- `PATH="/Users/user01/.npm/_npx/09ae5d3560c7b1f2/node_modules/node/bin:$PATH" node --version` => `v24.19.0`
- `PATH="/Users/user01/.npm/_npx/09ae5d3560c7b1f2/node_modules/node/bin:$PATH" npm run lint` => pass
- `PATH="/Users/user01/.npm/_npx/09ae5d3560c7b1f2/node_modules/node/bin:$PATH" npm run typecheck` => pass
- `PATH="/Users/user01/.npm/_npx/09ae5d3560c7b1f2/node_modules/node/bin:$PATH" npx tsx --test src/server/billing/access.test.ts src/server/reports/reports.integration.test.ts src/server/reports/delivery/routes.test.ts src/server/gsc/routes.contract.test.ts src/server/sites/routes.integration.test.ts src/server/reports/branding/routes.integration.test.ts src/server/reports/delivery/service.integration.test.ts src/contracts/product-surface.contract.test.ts src/lib/api.regression-1.test.ts` => 38/38 pass
- `git diff --check bb9bb6f -- .` => pass

## Verdict

- codeQualityStatus: CLEAR
- recommendation: APPROVE
- blockers: none
