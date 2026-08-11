# P2 Runtime Fix Evidence - 2026-08-11

## Scope

- Worktree: `/Users/user01/Music/SEMForge-worktrees/parallel-p2-runtime-fixes/semforge`
- Branch: `codex/parallel-p2-runtime-fixes`
- Base requested by parent: `a1dce68`
- Push: not performed

## Implemented blockers

1. Production API auth no longer trusts fake tenant headers.
   - Files: `src/server/auth/api-session.ts`, `src/server/auth/api-session.production.test.ts`
   - Observable: production resolver reads `semforge_session` cookie through real `getSession`; header-only tenant injection returns `UNAUTHENTICATED`.

2. Sites list/store web queries run under transaction-local RLS workspace context.
   - Files: `src/server/sites/store.ts`, `src/server/sites/rls-runtime.test.ts`, `src/server/sites/routes.integration.test.ts`
   - Observable: `listSites` executes within `inTransaction(db, workspaceId, ...)`, causing `set_config('app.workspace_id', $1, true)`.

3. Invite acceptance provisions billing atomically.
   - Files: `src/server/auth/postgres-store.ts`, `src/server/auth/invite-billing-provisioning.test.ts`, `src/db/migrations/0000_core.sql`, `src/db/migrations/core.integration.test.ts`
   - Observable: accepted invite creates user, workspace, membership, session, `billing_customers`, and `subscriptions(status='account_created', amount_krw=49000)` in the same transaction; auth role grants/RLS cover only required pre-tenant provisioning surface.

4. Billing retry uses the external `Idempotency-Key` as payment attempt identity.
   - Files: `src/server/billing/service.ts`, `src/server/billing/postgres-store.ts`, `src/server/billing/runtime-blockers.test.ts`, `src/server/billing/http.ts`
   - Observable: replaying the same retry key returns/reconciles the same payment attempt and does not advance retry attempt number.

5. Toss webhook handling treats provider payload as untrusted notification.
   - Files: `src/server/billing/service.ts`, `src/server/billing/postgres-store.ts`, `src/server/billing/http.ts`, `src/server/billing/runtime-blockers.test.ts`, `src/server/billing/http.contract.test.ts`
   - Observable: webhook body is capped, per-IP process rate-limited, event schema is allow-listed, `PAYMENT_STATUS_CHANGED` resolves by server-known order/payment fingerprint after Toss Query API reconciliation, and `BILLING_DELETED` resolves tenant by billing key fingerprint before disabling the server-known payment method.

## Validation commands and binary observables

All final validation used Node 24.5.0:

```bash
NODE24=/Users/user01/.local/share/cursor-agent/versions/2026.07.23-e383d2b/node
$NODE24 -v
$NODE24 ./node_modules/.bin/eslint
$NODE24 ./node_modules/typescript/bin/tsc --noEmit
$NODE24 ./node_modules/tsx/dist/cli.mjs --test src/server/auth/api-session.production.test.ts src/server/sites/rls-runtime.test.ts src/server/auth/invite-billing-provisioning.test.ts src/server/billing/runtime-blockers.test.ts src/server/billing/http.contract.test.ts
$NODE24 ./node_modules/tsx/dist/cli.mjs --test src/db/**/*.test.ts src/lib/crypto.test.ts src/lib/env.test.ts
$NODE24 ./node_modules/tsx/dist/cli.mjs --test "src/**/*.test.ts" "src/**/*.test.tsx" "scripts/**/*.test.ts"
$NODE24 ./node_modules/next/dist/bin/next build
npm audit --omit=dev
git diff --check
```

Observed output summary:

- Node binary: `v24.5.0`
- ESLint: exit code 0, no diagnostics
- TypeScript: exit code 0, no diagnostics
- Targeted production/runtime tests: `13` tests, `13` pass, `0` fail
- DB fresh/second migration and DB contract suite: `31` tests, `31` pass, `0` fail
- Full test suite: `229` tests, `229` pass, `0` fail
- Production build: Next.js 16.3.0 compiled successfully and emitted only allowed app/API routes
- Production dependency audit: `found 0 vulnerabilities`
- Diff whitespace check: exit code 0

## Captured artifact

- Evidence file: `/Users/user01/Music/SEMForge-worktrees/parallel-p2-runtime-fixes/semforge/.omo/evidence/p2-runtime-fixes-20260811.md`
