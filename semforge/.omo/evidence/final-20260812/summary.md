# Final implementation evidence index

## Provenance boundary

- Release gate validated source HEAD: `e50c5e6ea05e218268612d73fa05d8eac5517f7b`
- Release gate validated source tree: `08bf255729d32de813b08aeccaca4010623e692e`
- Run-completion relationship: `same-head`
- Full release gate interval: `2026-08-12T08:45:38.978Z` through `2026-08-12T08:48:25.061Z`

These are immutable run facts, not a claim that an evidence-only commit is the source that
was tested. A later HEAD is related to this run only while its diff from the validated source
contains evidence-directory paths exclusively. A later source change requires regeneration.

## Evidence files

- `.omo/evidence/phase5-ci/latest/summary.json` — full release gate machine summary, status `passed`.
- `.omo/evidence/phase5-ci/latest/summary.md` — human-readable provenance and gate index.
- `.omo/evidence/phase5-ci/latest/npm-verify.log` — full verify, including tenant-read fence tests.
- `.omo/evidence/phase5-ci/latest/npm-build.log` — Next production build.
- `.omo/evidence/phase5-ci/latest/npm-audit-full.log` — full dependency audit.
- `.omo/evidence/phase5-ci/latest/npm-audit-production.log` — production dependency audit.
- `.omo/evidence/phase5-ci/latest/license-check.log` — third-party license policy check.
- `.omo/evidence/phase5-ci/latest/route-manifest.json` — allowed page/API manifest.
- `.omo/evidence/phase5-ci/latest/forbidden-surface.json` — deleted legacy/forbidden surface scan.
- `.omo/evidence/phase5-ci/latest/pg16.log` — actual PostgreSQL 16 Docker gate.
- `.omo/evidence/phase5-ci/latest/nine-site.log` — 3-agency/9-site synthetic harness.
- `.omo/evidence/final-20260812/minio-versioning.log` — separately executed MinIO versioned S3 erasure acceptance.

Every path above exists in this evidence index. Tenant-read fence assertions are part of the
tracked full verify log.

## Binary observables

- `npm run ci:release-gate`: exit `0`.
- `npm run verify`: 689 tests, 688 passed, 0 failed, 1 skipped.
- `npm run build`: exit `0`, 33 static/dynamic app routes generated.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- `npm run ci:pg16`: 11 tests, 11 passed, 0 failed.
- `npm run ci:nine-site`: 3 workspaces, 9 sites, 360 observations, 9 reports.
- MinIO versioned S3 acceptance: 17 tests, 17 passed, 0 failed.
