# Phase 5 release gate evidence

Status: PASSED

## Immutable run provenance

- Validated source HEAD: `e50c5e6ea05e218268612d73fa05d8eac5517f7b`
- Validated source tree: `08bf255729d32de813b08aeccaca4010623e692e`
- Gate interval: `2026-08-12T08:45:38.978Z` through `2026-08-12T08:48:25.061Z`
- Run-completion HEAD: `e50c5e6ea05e218268612d73fa05d8eac5517f7b`
- Run-completion relationship: `same-head`

This historical run validates the immutable source SHA above. It does not label any later
evidence commit as the source under test. Later HEADs are covered only when the diff from
the validated source is restricted to the evidence directory; any source change requires a new
release-gate run. The v2 generator now records this relationship directly in both summaries.

## Direct validation

- Node runtime: `v24.14.0`
- Full release gate: `npm run ci:release-gate`
- Machine-readable summary: `.omo/evidence/phase5-ci/latest/summary.json`
- Full verify log: `.omo/evidence/phase5-ci/latest/npm-verify.log`
- Result: all 14 release-gate steps exited `0`

## Passed gate steps

- `npm run verify`
- `npm run build`
- `npm audit --audit-level=high`
- `npm audit --omit=dev --audit-level=high`
- `npm run license:check`
- `npm run db:generate`
- generated source diff check
- source whitespace diff checks
- `npm run ci:route-manifest`
- `npm run ci:forbidden-surface`
- `npm run ci:pg16`
- `npm run ci:nine-site`

## Key observables

- Full verify: 689 tests, 688 passed, 0 failed, 1 skipped. The skipped case is the MinIO-gated versioned S3 acceptance.
- Separate MinIO acceptance: `.omo/evidence/final-20260812/minio-versioning.log`, 17 passed, 0 failed.
- Route manifest: 14 allowed pages and 31 allowed route handlers.
- Forbidden surface: 306 checked files, 0 forbidden paths, 0 forbidden content findings.
- PostgreSQL 16 Docker gate: 11/11 tests passed.
- Nine-site synthetic harness: 3 workspaces, 9 sites, 360 observations, 9 reports.
- Audit: 0 high/critical vulnerabilities in full and production dependency sets.
