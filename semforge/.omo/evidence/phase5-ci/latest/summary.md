# Phase 5 CI release gate checkpoint

Status: CHECKPOINT_GREEN_WITH_LOCAL_NODE24_BLOCK

## Implemented public CI seams

- `npm run ci:release-gate`
- `npm run ci:route-manifest`
- `npm run ci:forbidden-surface`
- `npm run ci:nine-site`
- `.github/workflows/release-gate.yml`

## Direct validation

- RED contract: `.omo/evidence/phase5-ci-red.log` captured 4/4 failing contract assertions before implementation.
- GREEN contract: `.omo/evidence/phase5-ci-green-contract.log` captured 4/4 passing assertions after implementation.
- Route manifest: `.omo/evidence/phase5-ci/latest/route-manifest.json` captured 14 pages and 29 API routes.
- Forbidden surface: `.omo/evidence/phase5-ci/latest/forbidden-surface.json` captured 261 checked files and no findings.
- 3-partner/9-site harness: `.omo/evidence/phase5-ci/latest/nine-site-harness.json` captured 3 workspaces, 9 sites, 180 rank keywords, 180 AIO prompts, 360 observations, 9 reports, and 0 external network calls.
- Lint/typecheck: `.omo/evidence/phase5-ci-lint.log` and `.omo/evidence/phase5-ci-typecheck.log` exited 0.

## Local full gate note

`npm run ci:release-gate` intentionally failed closed on this host because the available local Node binary is `v25.4.0`, while the project and workflow require Node 24.x. The generated `.omo/evidence/phase5-ci/latest/summary.json` records that fail-closed condition. GitHub Actions supplies `node-version: 24`, `postgres:16`, Chromium, and Korean fonts before invoking the same release gate.
