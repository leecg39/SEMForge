# Phase 5 CI release gate checkpoint

Status: CHECKPOINT_GREEN_WITH_EXISTING_VERIFY_BLOCK

## Implemented public CI seams

- `npm run ci:release-gate`
- `npm run ci:route-manifest`
- `npm run ci:forbidden-surface`
- `npm run ci:nine-site`
- repo-root `.github/workflows/release-gate.yml`

## Direct validation

- RED contract: `.omo/evidence/phase5-ci-red.log` captured 4/4 failing contract assertions before implementation.
- GREEN contract and product-surface regression: `.omo/evidence/phase5-ci-product-surface-green.log` captured 8/8 passing assertions after implementation and after moving the workflow to repo root.
- Route manifest: `.omo/evidence/phase5-ci/latest/route-manifest.json` captured 14 pages and 29 API routes.
- Forbidden surface: `.omo/evidence/phase5-ci/latest/forbidden-surface.json` captured 261 checked files and no findings.
- 3-partner/9-site harness: `.omo/evidence/phase5-ci/latest/nine-site-harness.json` captured 3 workspaces, 9 sites, 180 rank keywords, 180 AIO prompts, 360 observations, 9 reports, and 0 external network calls.
- Lint/typecheck: `.omo/evidence/phase5-ci-lint.log` and `.omo/evidence/phase5-ci-typecheck.log` exited 0.

## Full gate note

The same release runner was executed with Node `v24.19.0` from `/Users/user01/.npm/_npx/09ae5d3560c7b1f2/node_modules/node/bin/node`.

Result: `.omo/evidence/phase5-ci/latest/summary.json` records fail-closed at `npm run verify`. The remaining failure is outside the CI harness implementation: `src/server/auth/invite-billing-provisioning.test.ts` inserts an invite expiry at `2026-08-12T03:00:00.000Z`, which violates `invites_expiry_window_ck` when run at the current local time. Before the CI script regression fix, the release gate had 2 failures; after the fix, the only remaining failure is this existing auth fixture.

GitHub Actions supplies `node-version: 24`, `postgres:16`, Chromium, Korean fonts, and runs from `semforge/` with artifact path `semforge/.omo/evidence/phase5-ci/latest`.
