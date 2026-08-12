# SEMForge Phase 5 release hardening audit — 2026-08-12

## Scope

- Final integration branch: `codex/phase-5-finalize`
- Baseline commit before this hardening pass: `a3570b820fc0b2f00dde06a38f46ce64ca819342`
- Runtime used for validation: Node 24 via `/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`

## Result

Code release hardening passed local validation. Paid-production launch remains fail-closed until external, non-code evidence is supplied through the operational and legal release gates.

## Closed blocker evidence

| Area | Binary observable | Result |
| --- | --- | --- |
| NAVER/AIO read routes | `npx tsx --test src/db/postgres16.multisession.pg16.ts` through `npm run test:pg16:docker` | Real PostgreSQL 16 web-role read route test passed; tenant A data is returned through transaction-local RLS and tenant B site IDOR is hidden. |
| Privacy erasure authority | `npm run test:pg16:docker` | PUBLIC/runtime roles are denied `privacy_erase_workspace`; `semforge_privacy` can execute only with a matching running deletion request and operator. |
| Privacy processor | `npx tsx --test src/server/privacy/processor.test.ts src/server/privacy/service.integration.test.ts src/server/storage/s3.test.ts` | Runtime processor revokes GSC refresh tokens, permanently purges every exact-key S3 version/delete marker with pagination and final-empty verification, records hashed email suppression, and blocks local immutable report deletion if external processing fails. |
| Email suppression | `npx tsx --test src/server/auth/password-reset-email.test.ts src/server/reports/delivery/store.suppression.test.ts` | Report and password-reset delivery check tenant-scoped suppression immediately before provider calls; active workspace members without prior deliveries are included during erasure. |
| Privacy operations | `npm run test:pg16:docker` | Privacy role can run DSAR/retention through explicit least-privilege grants while non-privacy roles and PUBLIC cannot execute the erasure function. |
| Legal canonical identity | `npx tsx --test src/server/privacy/legal-documents.test.ts` | Invite acceptance SHA and `/legal/privacy` / `/legal/terms` pages use the same canonical legal artifact source. |
| CI release gate hardening | `npx tsx --test scripts/ci/release-gate.contract.test.ts` | Release gate includes license check, generated schema/license drift check, source diff check, route manifest, forbidden surface, prod audit, PG16, and synthetic nine-site fixture. Drift failure is behavioral, not an environment-variable bypass. |
| Synthetic nine-site fixture scope | `npm run ci:nine-site` | Output explicitly identifies the fixture as `synthetic-limit-fixture` and does not claim real partner launch evidence. |
| Source hygiene | `git diff --check -- . ':(exclude).omo/evidence/**'` | Passed. Historical evidence artifacts are excluded; production/source whitespace is clean. |

## Validation commands

All commands below were run from the app root with Node 24 on `PATH`.

- `npx tsx --test src/server/privacy/processor.test.ts src/server/privacy/service.integration.test.ts src/server/storage/s3.test.ts src/server/reports/delivery/service.integration.test.ts src/server/reports/delivery/outbox.integration.test.ts src/server/insights/routes.integration.test.ts scripts/ci/release-gate.contract.test.ts src/db/migrations/core.integration.test.ts src/server/privacy/legal-documents.test.ts`
  - Result: 64/64 passing.
- `npm run typecheck`
  - Result: passed.
- `npm run lint`
  - Result: passed.
- `npm test`
  - Result: 596/596 passing.
- `npm run build`
  - Result: passed; Next production route manifest contains only the approved pages/API routes.
- `npm run license:check`
  - Result: passed.
- `npm audit --audit-level=high`
  - Result: 0 vulnerabilities.
- `npm audit --omit=dev --audit-level=high`
  - Result: 0 vulnerabilities.
- `npm run ci:route-manifest`
  - Result: `pages=14 routes=31`.
- `npm run ci:forbidden-surface`
  - Result: `checkedFiles=293`.
- `npm run ci:nine-site`
  - Result: `workspaces=3 sites=9 observations=360 reports=9`.
- `npm run test:pg16:docker`
  - Result: 9/9 passing against PostgreSQL 16 Docker.
- `npm run db:generate`
  - Result: `No schema changes, nothing to migrate`.
- `git diff --check -- . ':(exclude).omo/evidence/**'`
  - Result: passed.
- `git diff --check origin/codex/paid-beta-core...HEAD -- . ':(exclude).omo/evidence/**'`
  - Result: passed after normalizing trailing whitespace in generated third-party notices.

## Remaining launch gates

These are intentionally outside local code completion and must remain blocked for paid-production invites until artifact-backed evidence exists:

- Toss production billing approval and real billing smoke.
- Google OAuth production verification for Search Console readonly scope.
- NAVER Search Ads/DataLab/Search API production key smoke.
- TalorData production smoke for Google rank/AIO collection.
- Resend verified sending domain.
- Managed PostgreSQL PITR rehearsal, private object storage version restore, and previous-image rollback rehearsal.
- Approved legal release manifest with final privacy/terms identity.
- Three design partner agencies, nine real sites, and first weekly reports delivered in the real environment.

## Notes

- The nine-site command is a synthetic limit fixture only. It is not counted as the real 3-partner launch gate.
- Root-level `.omo/evidence/phase5-final-*` files observed in this worktree were stale pre-fix review artifacts and were not used as trusted completion evidence.
