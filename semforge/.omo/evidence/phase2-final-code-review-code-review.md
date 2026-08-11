# Phase 2 final code quality/security review

- Goal: SEMForge Phase 2 product API integration final review for `codex/phase-2-product`
- Reviewed HEAD: `1355451 fix: narrow auth billing rls grants`
- Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- Scope: P2-A1/P2-S1/P2-G1/P2-B1/P2-V from `docs/planning/06-tasks.md`
- Status: BLOCK
- Recommendation: REQUEST_CHANGES

## Skill-perspective check

The requested `remove-ai-slops` and `programming` skills were not available in the provided skills list and were not found under the local skill roots by exact `SKILL.md` search. I applied the criteria from the review prompt directly:

- Reject tests that only mirror implementation seams or create false confidence.
- Reject needless production complexity and untyped escape hatches when the boundary does not require them.
- Treat runtime gaps hidden by fake tests as high severity when they affect release behavior.

Result: the billing HTTP tests overfit the injected handler seam and miss the real runtime CSRF behavior. This violates the requested skill perspective because the tests pass while the production billing mutation routes remain unusable.

## Evidence checked

- `npm run verify` with Node `v24.14.0`: PASS, 254/254 tests.
- `npm audit --omit=dev`: PASS, 0 vulnerabilities.
- `git diff --check`: PASS.
- `npm run build` without production env: FAILS during Next route config collection because auth runtime validates production secrets at module import time.
- `npm run build` with placeholder production env: PASS; route manifest contains only the allowed app/API routes from the Phase 2 scope.
- Direct source inspection of auth, sites/tracking, GSC, billing, PostgreSQL RLS/grants, and route modules.

## CRITICAL

None.

## HIGH

### H1. Billing mutation routes require a CSRF cookie/header pair that the app never issues

- Files:
  - `src/server/billing/runtime.ts:20`
  - `src/server/billing/runtime.ts:44`
  - `src/server/billing/http.ts:276`
  - `src/server/billing/http.ts:295`
  - `src/server/billing/http.ts:313`
  - `src/lib/session.ts:124`
  - `src/server/auth/http.ts:201`
  - `src/server/auth/http.ts:245`

`createSessionRequireAuth` requires `semforge_csrf` cookie to equal the `x-csrf-token` header for billing mutation routes. The production codebase has no route, middleware, auth response, or UI hook that sets `semforge_csrf`. Source search only finds Set-Cookie issuance for `semforge_session` and session deletion.

Impact:

- Normal authenticated users cannot successfully call `/api/v1/billing/authorize`, `/api/v1/billing/payment-method`, `/api/v1/billing/retry`, or `/api/v1/billing/cancel` in the real runtime unless an undocumented external component creates the CSRF cookie/header pair.
- This breaks the P2-B1 billing flow and the P2-V requirement that API auth/CSRF contracts pass in the real product boundary.
- Current tests do not catch it because `src/server/billing/http.contract.test.ts:49` injects a fake `requireAuth` and asserts only that `{ csrf: true }` is requested, not that the runtime can satisfy it.

Reproduction/evidence:

```text
rg "semforge_csrf|x-csrf-token|set-cookie|sessionCookieHeader" src --glob '!**/*.test.ts'
```

The only CSRF-token references are in `src/server/billing/runtime.ts`; the only Set-Cookie producers are session cookie helpers and auth session responses.

Minimum fix direction:

1. Prefer aligning billing with the shared auth guard: use the same `assertSameOrigin` / `createRuntimeRequireAuth` boundary that auth and GSC routes already use, so billing mutation CSRF behavior is actually reachable and consistent.
2. If a double-submit token is required instead, add an explicit CSRF token issuance path, cookie attributes, frontend/header integration, and runtime tests proving a real authenticated billing mutation succeeds and cross-origin mutation fails.

This is a release blocker.

## MEDIUM

### M1. Production build currently depends on build-time secrets unless placeholder env is injected

- Files:
  - `src/app/api/v1/auth/logout/route.ts:3`
  - `src/app/api/v1/auth/logout/route.ts:5`
  - `src/server/auth/runtime.ts:28`
  - `src/server/auth/runtime.ts:29`
  - `src/lib/env.ts:93`
  - `src/lib/env.ts:127`

Auth route modules instantiate runtime handlers at module import time. During `next build`, Next imports route modules while `NODE_ENV=production`, which triggers production env validation before the app starts.

Observed behavior:

- `npm run build` without env fails with missing `DATABASE_URL`, `AUTH_DATABASE_URL`, `APP_SECRET`, Toss, Google, and fingerprint secret errors.
- The same build passes when placeholder production env values are injected.

Impact:

- CI/Docker build must inject server secrets or placeholders at build time.
- This weakens the “startup validation” boundary by moving part of it into build-time module evaluation.

Minimum fix direction:

- Lazily create auth runtime handlers inside exported route functions or through a request-time cache, then keep real secret validation at runtime/startup instead of route import time.
- Add a build test that matches the intended CI contract: either build without secrets, or explicitly document and provide non-production placeholders.

This is not the primary release blocker if the deployment pipeline intentionally injects placeholders, but it is a maintainability and deployability risk.

### M2. Billing runtime duplicates session cookie parsing instead of using the hardened shared session reader

- Files:
  - `src/server/billing/runtime.ts:24`
  - `src/server/billing/runtime.ts:48`
  - `src/lib/session.ts:69`

Billing uses a local `cookie()` parser that returns the first matching cookie. The shared `readSessionTokenFromCookieHeader` rejects duplicate session cookies to reduce cookie tossing ambiguity.

Impact:

- Billing authentication behavior diverges from the rest of the API.
- If billing is moved to the shared auth guard as recommended for H1, this issue is resolved at the same time.

## LOW

### L1. In-memory webhook rate limiting trusts spoofable forwarding headers

- File: `src/server/billing/http.ts:182`

The webhook rate-limit key uses `x-forwarded-for` or `cf-connecting-ip` directly. This is acceptable only as a secondary best-effort limiter behind the planned nginx/TLS/rate-limit layer. It should not be treated as the primary abuse control.

## Positive coverage observed

- Auth invite acceptance, session rotation, password reset, and billing provisioning are transactionally implemented and covered by integration tests.
- PostgreSQL auth-role grants now keep billing provisioning INSERT-only and preserve password reset outbox INSERT-only behavior.
- Sites/tracking routes derive workspace from session, enforce idempotency keys for mutations, set transaction-local `app.workspace_id`, and cover IDOR/RLS scenarios.
- GSC OAuth state is stored hashed, workspace/user-bound, 10-minute, one-use, and property binding verifies `sites.list` exact authorization before persisting.
- Toss charging uses stable order/idempotency identities, Query API reconciliation for ambiguous outcomes, encrypted billing key storage, HMAC fingerprint lookup, ledger append, and webhook dedupe.
- Route manifest with placeholder production env stayed inside the allowed Phase 2/public route set.

## Final verdict

- `codeQualityStatus`: BLOCK
- `recommendation`: REQUEST_CHANGES
- `blockers`:
  1. Fix the real billing mutation CSRF/runtime auth path so authenticated users can execute billing changes and cross-origin requests remain rejected.
