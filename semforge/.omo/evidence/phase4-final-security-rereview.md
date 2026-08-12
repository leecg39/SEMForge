# Phase 4 Final Security Rereview

recommendation: CLEAR

blockers: none

originalIntent: ship the SEMForge paid-beta delivery branch as a hardened PostgreSQL/Node 24 product surface: server-enforced subscription access, exact public/app/API allowlist, tenant/RLS isolation, Toss billing, Google Search Console OAuth, weekly collection, immutable weekly reports, secure PDF/email delivery, no SQLite/legacy surface, and launch-ready operational evidence.

desiredOutcome: no remaining P0/P1 code or security blockers on `codex/phase-4-delivery`; prior P1s from `/Users/user01/Music/SEMForge/.omo/evidence/phase4-final-security-review.md` must be closed by current code, targeted Node 24 proof, and actual PostgreSQL 16 role checks. External provider approvals and real provider smoke tests are launch gates, not code blockers.

userOutcomeReview: from the user's perspective, the shipped artifact now behaves like a paid-beta product rather than a client-side demo. Unpaid/current-period access is denied server-side, paid/cancel-valid workspaces retain expected access, past-due users are limited to historical reports, scheduled production jobs are subscription-gated and idempotent, report snapshots are generated through the production relay, PDFs are served only through tenant-checked short-lived signed URLs, and the visible route/page surface matches the paid-beta plan.

## Checked Artifact Paths

- `/Users/user01/Music/SEMForge/.omo/evidence/phase4-final-security-review.md`
- `/Users/user01/Music/SEMForge-worktrees/phase-4-delivery/semforge/.omo/evidence/p4-billing-access-fix-code-review.md`
- `/Users/user01/Music/SEMForge-worktrees/phase-4-delivery/semforge/.omo/evidence/p4-r1-report-delivery-code-review.md`
- `/Users/user01/Music/SEMForge-worktrees/phase-4-delivery/semforge/.omo/evidence/phase4-integration-audit-code-review.md`
- `/Users/user01/Music/SEMForge-worktrees/parallel-p4-final-pg-qa/semforge/semforge/.omo/evidence/phase4-final-pg-docker-qa/summary.md`
- `/Users/user01/Music/SEMForge-worktrees/parallel-p4-final-pg-qa/semforge/semforge/.omo/evidence/phase4-final-pg-docker-qa/49-pg16-all-web-billing-report-provider0.log`
- `/Users/user01/Music/SEMForge-worktrees/parallel-p4-final-pg-qa/semforge/semforge/.omo/evidence/phase4-final-pg-docker-qa/52-nine-site-fault-harness.log`
- `/Users/user01/Music/SEMForge-worktrees/parallel-p4-final-browser-qa/semforge/.omo/evidence/phase4-final-browser-qa/summary.md`
- `/Users/user01/Music/SEMForge-worktrees/parallel-p4-final-browser-qa/semforge/.omo/evidence/phase4-final-browser-qa/matrix.md`

## Current Target

- Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-4-delivery/semforge`
- Branch: `codex/phase-4-delivery`
- Current remote-tracking HEAD observed: `bab5baf` (`docs(audit): mark pre-integration findings superseded`), which contains `175a56d` (`merge: expose secure report PDF downloads`) plus evidence-only commits.
- Diff reviewed from prior blocked baseline `bb9bb6f..HEAD -- semforge`: 42 files, 2272 insertions, 82 deletions.

## Direct Proof Run On Current Worktree

- `git diff --check bb9bb6f..HEAD -- semforge`: PASS.
- Node 24 targeted proof, excluding the PG16-only test from the non-PG run: `72/72` tests PASS. Covered billing access, report period SQL/PDF authorization, GSC/sites/branding gates, scheduler, queued job billing gate, relay, core RLS, exact route manifest, and SQLite/legacy regression.
- Actual PostgreSQL 16 role proof via `npm run test:pg16:docker`: PASS, `2/2` tests. Verified `semforge_web` billing-table DML denial, active/cancel-valid scheduler candidates, `past_due` job skips for `collect.google` and `report.snapshot`, `report.snapshot` outbox RLS/topic restrictions, concurrent report scheduling idempotency, provider canonical visibility, worker/dispatcher boundaries, and relay lease recovery.
- `npm run build` on Node 24: PASS, 33/33 pages generated.
- `npm run lint && npm run typecheck` on Node 24: PASS.
- `npm run verify` on Node 24: PASS, `482/482`.
- `npm audit --audit-level=low --json`: 0 vulnerabilities.
- `npm audit --omit=dev --audit-level=low --json`: 0 vulnerabilities.
- `npm ls better-sqlite3 sqlite3 @op-engineering/op-sqlite expo-sqlite --all --json`: no installed SQLite packages.

## Prior P1 Closure

- Server billing access routes/report period SQL/PDF: closed. `src/server/billing/access.ts`, `src/server/billing/domain.ts`, `src/server/reports/routes.ts`, `src/server/reports/store.ts`, `src/server/reports/delivery/routes.ts`, and `src/server/reports/delivery/store.ts` enforce authoritative billing state. Current-period reports/PDFs are denied for `past_due`; historical reports use a SQL `period_end < current_period_start` cutoff.
- `semforge_web` billing DML denial: closed. `src/db/migrations/0000_core.sql` no longer grants `semforge_web` privileges on `billing_customers`, `payment_methods`, or `subscriptions`; actual PG16 role tests measured 12/12 SELECT/INSERT/UPDATE/DELETE denials across those tables.
- Scheduler production Sun18/Mon08/report.snapshot/relay/RLS/ON CONFLICT: closed. `src/worker/scheduler.ts`, `src/server/reports/schedule.ts`, `src/worker/topics.ts`, `src/worker/relay-runtime.ts`, `src/worker/production.ts`, deploy CronJobs, RLS policies, and PG16 tests cover Sunday 18:00 KST collection, Monday 08:00 KST report snapshots, `report.snapshot` relay mapping, subscription-gated candidates, topic/payload RLS, and duplicate-safe `ON CONFLICT`.
- Queued job billing gate: closed. `src/worker/billing-gate.ts` re-checks billing before queued collection/snapshot execution; PG16 proof shows `past_due` collection and snapshot jobs terminal-success skipped with provider/generator delegate calls `0`.
- SQLite-zero/exact manifest: closed. `src/lib/api.ts` no longer contains SQLite signatures, SQLite deps are not installed, source scans show no production SQLite/legacy clone strings, and `src/contracts/product-surface.contract.test.ts` asserts the exact paid-beta page/API surface.
- Secure PDF UI: closed. `src/components/product/report-detail-workspace.tsx` opens a new target before async fetch, requires same-origin credentials, accepts only HTTPS signed URLs, closes on error, avoids storing signed URLs in DOM/state, and disables current-period downloads for `past_due`. Browser QA confirms signed URL non-retention, popup-block handling, 404 asset-not-ready handling, 44px target, and past_due blocking.

## Broader Security Review

- Route/page allowlist: exact paid-beta app/API/health surface verified by build output, contract tests, and browser forbidden-route QA.
- Tenant/RLS: migration policies set `app.workspace_id`, deny cross-tenant reads, restrict worker/dispatcher/scheduler roles, and protect report/outbox payload boundaries. Actual PG16 role tests passed.
- Toss: checkout uses server-derived config; mutating billing routes require auth, owner/admin role, CSRF, and idempotency; webhook reconciliation queries Toss and rejects mismatched/unverified provider state.
- OAuth/crypto: GSC state is random, hashed, one-time, short-lived, user/workspace bound; token encryption uses AES-256-GCM with AAD and key ids; scope is exact `webmasters.readonly`.
- SSRF/S3/Resend/logging: domain/logo URL paths require HTTPS and public DNS; renderer pins vetted DNS, rejects private hosts and redirects, bounds bytes/pixels; S3 writes use `If-None-Match`, checksum/content identity, SSE, and short signed URLs; Resend uses idempotency and bounded error handling; logger redacts secrets, tokens, billing identifiers, and PII-shaped fields.
- Worker retry/idempotency/DLQ: queue/runtime use SKIP LOCKED, leases, heartbeat, retry/backoff/dead transitions, request hashes, and recovery paths; nine-site/fault QA exercised relay, delivery, accepted-then-reset email retry, and abandoned lease recovery.
- Immutable reports: migration triggers protect ready report snapshots and sections; report generation freezes brand/snapshot data before PDF/email outbox fanout.
- Legacy deletion: no production legacy route/page/API namespace or SQLite signature was found; docs/planning historical references are excluded from product-surface enforcement.

## Remove-AI-Slops / Programming Pass

`remove-ai-slops` and `programming` skill files were not available under the listed skill roots when searched. I applied the required criteria directly over the diff, tests, and production code.

- No deletion-only, tautological, or removal-only tests were accepted as proof. The important tests execute route behavior, tenant boundaries, billing decisions, SQL cutoffs, real PG16 roles/RLS, scheduler idempotency, and UI PDF behavior.
- Exact allowlist and schedule tests intentionally mirror product contracts, but they are paired with integration, browser, and actual PG16 role tests, so they do not create false confidence by themselves.
- New production extraction is scoped to reusable billing authorization, billing-gated worker execution, schedule helpers, and PDF access helpers. I found no unnecessary parser/normalizer extraction, broad abstraction drift, or maintenance burden that rises to P0/P1.
- The explicit code-review artifacts `p4-billing-access-fix-code-review.md` and `p4-r1-report-delivery-code-review.md` include the same skill-perspective/slop checks. The earlier `phase4-integration-audit-code-review.md` is correctly superseded and was used only as historical context.

## Evidence Gaps

- No notepad path was provided in the task input; no notepad artifact was consulted.
- `remove-ai-slops` and `programming` SKILL.md files were unavailable, so their documented criteria were applied directly rather than loaded from disk.
- Real external-provider success with Toss, Google/NAVER, S3-compatible storage, and Resend remains a launch gate. Existing browser and PG QA explicitly use mocks/interception for those boundaries and do not claim provider approval.

remainingP0P1: none
