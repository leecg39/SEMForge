# Final hardening code review

Review target: `/Users/user01/Music/SEMForge-worktrees/final-hardening/semforge`

Commit reviewed: `39e5e73d87ff00f638790bfd0ed31162a154b0c5`

Range reviewed: `origin/codex/paid-beta-core..HEAD`

Mode: read-only code review; no source edits, commits, or pushes.

## Skill perspective check

`remove-ai-slops` and `programming` were required by the review instruction, but neither skill was available as a `SKILL.md` in the provided skill list or local skill search. I applied the documented criteria from the prompt directly:

- remove-ai-slops pass: checked for deletion-only tests, tautological tests, implementation-constant mirroring, requested-removal-only tests, and needless production parsing/extraction.
- programming pass: checked for brittle prompt/source tests, implementation-mirroring tests, untyped escape hatches, needless abstraction, and validation/parsing added outside a real boundary.

Result: no CRITICAL/HIGH violations from those skill perspectives. Some contract tests use source/manifest regex checks, but they are supporting deployment/documentation assertions alongside executable integration coverage, not the only proof of core behavior.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

1. Committed release-gate evidence is not bound to the reviewed SHA.

   - Current `HEAD` is `39e5e73d87ff00f638790bfd0ed31162a154b0c5`, but the evidence committed at `HEAD` in `semforge/.omo/evidence/phase5-ci/latest/summary.md` records source/completion HEAD `da594e38c658d3bca219df476e51a3d4fa4e75a9`.
   - The worktree contains updated, uncommitted evidence files under `semforge/.omo/evidence/phase5-ci/latest/` whose `summary.json` records `39e5e73d87ff00f638790bfd0ed31162a154b0c5` and whose listed log SHA-256 values match the files on disk.
   - `git status --short` shows 17 modified release evidence files, including `summary.json`, `summary.md`, `npm-verify.log`, `pg16.log`, and `nine-site.log`.
   - Impact: the latest release gate appears to have passed for the exact SHA, but the commit itself does not carry that exact-SHA evidence. If the release process requires evidence committed with the reviewed commit, this must be fixed before release approval. If uncommitted local evidence is accepted as the binding artifact, this is a release-process watch item rather than a code blocker.

### LOW

1. Some ops/privacy tests still assert implementation text via regex.

   - Examples: `scripts/privacy/privacy.test.ts` and parts of `scripts/ops/deployment.contract.test.ts`.
   - These are not blocking because critical DSAR behavior is covered by DB/service integration tests and entrypoint/preflight behavior is still exercised elsewhere, but long-term maintainability would improve if the remaining source-shape checks were converted to executable behavior checks where practical.

## Verification

Reviewed the full range diff across:

- DSAR/privacy SQL and service paths: `src/server/privacy/service.ts`, `scripts/privacy/privacy.ts`, `scripts/ops/privacy-request.ts`, `src/db/migrations/0000_core.sql`, `src/db/schema/core.ts`.
- Auth/password hardening: `src/server/auth/password.ts`, `src/server/auth/service.ts`, store and privacy-fenced store changes.
- Runtime/composition hardening: `src/lib/env.ts`, `scripts/ops/runtime.mjs`, `scripts/ops/deployment-preflight.mjs`, `Dockerfile`, `docker-compose.yml`, nginx, Kubernetes manifests.
- Legal/release gate and license notice changes.
- API security logging and webhook rate limiting.

Evidence inspected:

- Current on-disk release gate: `semforge/.omo/evidence/phase5-ci/latest/summary.json` reports status `passed`, source/completion SHA `39e5e73d87ff00f638790bfd0ed31162a154b0c5`, Node `v24.14.0`, and all steps exit code `0`.
- Current logs show `npm run verify`: tests `727`, pass `726`, fail `0`, skipped `1`; `npm run build`: Next build successful; `ci:pg16`: pass `11`; `ci:nine-site`: synthetic harness passed.
- Committed evidence at `HEAD` reports prior SHA `da594e38c658d3bca219df476e51a3d4fa4e75a9`, which is the provenance mismatch noted above.

## Status

codeQualityStatus: WATCH

recommendation: APPROVE, provided the release manager accepts the uncommitted exact-SHA release-gate artifacts or commits/regenerates them before tagging/releasing.

blockers: none for code correctness. Release-gate provenance remains a process blocker only if committed exact-SHA evidence is mandatory.
