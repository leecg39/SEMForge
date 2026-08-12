# fix-final-ci-privacy-gates evidence

Status: RED handoff required

## Scope

- Owned files changed only in CI/PG16 privacy harness surface:
  - `package.json`
  - `scripts/test-pg16.sh`
  - `scripts/test-privacy-barrier-pg16.sh`
  - `scripts/ci/release-gate.contract.test.ts`
  - `src/db/privacy-barrier.pg16.ts`
- Production privacy service and DB SQL were not modified.

## Green contract check

- Scenario: release gate contract requires `ci:pg16` to execute `test:pg16:privacy`.
- Invocation: `./node_modules/.bin/tsx --test scripts/ci/release-gate.contract.test.ts`
- Binary observable: 13 tests, 13 pass, 0 fail.
- Artifact: `.omo/evidence/fix-final-ci-privacy-gates/release-gate-contract.log`

## RED PostgreSQL 16 privacy harness

- Scenario: subject-bound erasure must allow DB-backed email suppression, remove accepted invite for the erased workspace subject, preserve the same user in another workspace, and keep workspace deletion barriers intact.
- Invocation: `SEMFORGE_PRIVACY_PG16_PORT=55442 bash scripts/test-privacy-barrier-pg16.sh`
- Binary observable: PostgreSQL 16 migrated twice, `test:pg16:privacy` executed, 3 tests total, 2 pass, 1 fail.
- Failure: `privacy_add_email_suppression` rejects subject-bound erasure with `privacy email suppression requires matching running deletion request`.
- Artifact: `.omo/evidence/fix-final-ci-privacy-gates/pg16-privacy-red.log`

## Required upstream fix before GREEN

The new harness reached the real product boundary. The database function `privacy_add_email_suppression(uuid, uuid, text)` currently accepts only running `workspace_deletion` requests, while `createPrivacyService().deleteWorkspaceSubject()` calls it during approved `erasure` requests for subject-bound DSAR suppression. A DB/service owner must decide and implement the production fix before this branch can be rerun to GREEN.
