# P2 Auth Billing RLS Evidence - 2026-08-12

## Scope

- Worktree: `/Users/user01/Music/SEMForge-worktrees/parallel-p2-runtime-fixes/semforge`
- Branch: `codex/parallel-p2-runtime-fixes`
- Parent commit: `cdac7505419fde3ae4507377d29532d4964cafb6`
- Push: not performed

## RED-first evidence

Added/strengthened PostgreSQL integration checks in `src/db/migrations/core.integration.test.ts` before changing grants:

- Exact auth grants no longer allow table-level `SELECT` on `billing_customers` or `subscriptions`.
- No column-level `SELECT` grants are allowed on `billing_customers` or `subscriptions`.
- Auth policies are exact by policy name and command; only `billing_customers_auth_insert` and `subscriptions_auth_insert` remain for billing provisioning.
- Runtime auth role can perform billing provisioning by INSERT-only path, but direct `SELECT` of other tenant ids, own ids, or sensitive columns is denied.

Initial RED invocation:

```bash
NODE24=/Users/user01/.local/share/cursor-agent/versions/2026.07.23-e383d2b/node
$NODE24 ./node_modules/tsx/dist/cli.mjs --test src/db/migrations/core.integration.test.ts
```

Observed RED:

- `auth role은 pre-tenant 인증 트랜잭션에 필요한 최소 권한과 RLS 정책만 가진다` failed because actual grants still included `billing_customers:SELECT` and `subscriptions:SELECT`.
- `auth role은 billing provisioning INSERT만 허용하고 billing SELECT를 노출하지 않는다` failed because auth role could still see a billing customer id through the broad SELECT policy.

## Implementation evidence

Changed files:

- `src/db/migrations/0000_core.sql`
  - Removed `GRANT SELECT` on `billing_customers` and `subscriptions` for `semforge_auth`.
  - Kept only table-level `INSERT` for `semforge_auth` on billing provisioning tables.
  - Removed `billing_customers_auth_select` and `subscriptions_auth_select` policies.
  - Kept only billing INSERT policies for auth provisioning.
- `src/server/auth/postgres-store.ts`
  - Removed billing provisioning dependence on `INSERT ... RETURNING`.
  - Generates `billing_customers.id` and `subscriptions.id` in the auth store and performs INSERT-only provisioning inside the existing invite acceptance transaction.
- `src/db/migrations/core.integration.test.ts`
  - Added exact grant/policy assertions and runtime denied SELECT scenarios.

## Final validation commands and observables

All final validation used Node 24.5.0:

```bash
NODE24=/Users/user01/.local/share/cursor-agent/versions/2026.07.23-e383d2b/node
$NODE24 -v
$NODE24 ./node_modules/.bin/eslint
$NODE24 ./node_modules/typescript/bin/tsc --noEmit
$NODE24 ./node_modules/tsx/dist/cli.mjs --test src/db/migrations/core.integration.test.ts src/server/auth/invite-billing-provisioning.test.ts
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
- Targeted auth billing RLS suite: `17` tests, `17` pass, `0` fail
- DB fresh/second migration suite: `32` tests, `32` pass, `0` fail
- Full test suite: `230` tests, `230` pass, `0` fail
- Production build: Next.js 16.3.0 compiled successfully and emitted only allowed app/API routes
- Production dependency audit: `found 0 vulnerabilities`
- Diff whitespace check: exit code 0

## Captured artifact

- Evidence file: `/Users/user01/Music/SEMForge-worktrees/parallel-p2-runtime-fixes/semforge/.omo/evidence/p2-auth-billing-rls-20260812.md`
