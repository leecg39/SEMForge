# Phase 2 sites/billing code review

- Goal reviewed: canonical `P2-S1-T1` site/tracking APIs and `P2-B1-T1` Toss billing state machine.
- Scope requested: commits `7e89db5` and `a1dce68` in `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`.
- Review status: `BLOCK`
- Recommendation: `REQUEST_CHANGES`
- Worktree note: the worktree was already dirty before this review. Existing auth WIP was not modified; only this report was written.

## Skill-perspective check

`remove-ai-slops` and `programming` were not available in the provided skill list and no `SKILL.md` was found under the configured local skill roots. I applied the criteria from the prompt manually:

- remove-ai-slops: flagged tests that only verify injected fakes/stubs, tests that enshrine missing auth/webhook behavior, and tests that provide false confidence without exercising production runtime composition.
- programming: flagged runtime-mirroring gaps, duplicated auth wrappers, missing boundary validation, and API idempotency that is asserted at the header layer but not carried into the billable operation.

The diff violates both perspectives: several passing tests are overfit to non-production seams and miss the actual runtime failures listed below.

## Evidence inspected

- Canonical requirements: `docs/planning/06-tasks.md`, P2-S1-T1 and P2-B1-T1.
- Target commits: `7e89db5 feat: implement toss billing state machine`, `a1dce68 feat: implement paid beta site tracking APIs`.
- Targeted runtime/test commands:
  - `npx tsx --test src/server/sites/domain.test.ts src/server/sites/store.integration.test.ts src/server/sites/routes.integration.test.ts src/server/billing/domain.contract.test.ts src/server/billing/service.contract.test.ts src/server/billing/toss-client.contract.test.ts src/server/billing/http.contract.test.ts` → `37/37 pass`.
  - `NODE_ENV=production APP_PUBLIC_URL=https://app.semforge.test npx tsx -e ... resolveApiSession(...)` → `ApiError:로그인이 필요합니다.`
  - `NODE_ENV=production APP_PUBLIC_URL=https://app.semforge.test npx tsx -e ... GET /api/v1/sites ...` → `401 {"error":{"code":"UNAUTHENTICATED"}}`.
- Full `npm test -- ...` invoked the package’s default glob plus target args and ran 224 tests; current dirty auth WIP caused 2 unrelated auth failures. I did not use that as target approval evidence.
- Toss docs checked:
  - [Webhook guide](https://docs.tosspayments.com/guides/v2/webhook): webhook is HTTP POST JSON and Toss retries unless a 200 is returned within 10 seconds.
  - [Authorization/idempotency guide](https://docs.tosspayments.com/reference/using-api/authorization): Basic auth uses `secretKey:` and POST APIs accept `Idempotency-Key`.
  - [Billing reference](https://docs.tosspayments.com/reference): billing key issue is `POST /v1/billing/authorizations/issue`, charge is `POST /v1/billing/{billingKey}`, delete is `DELETE /v1/billing/{billingKey}`.

## CRITICAL

None.

## HIGH

### 1. Production site/tracking routes cannot authenticate any real user

- Files:
  - `src/server/auth/api-session.ts:14`
  - `src/server/auth/api-session.ts:18`
  - `src/server/auth/api-session.ts:24`
  - `src/server/sites/routes.ts:101`
  - `src/server/sites/routes.ts:102`
  - `src/app/api/v1/sites/route.ts:5`
  - `src/app/api/v1/tracking/route.ts:5`

`createSitesRouteHandlers()` defaults to `resolveApiSession`. That resolver only accepts synthetic `x-semforge-workspace-id` and `x-semforge-user-id` headers outside production; in production it always throws `UNAUTHENTICATED`. The actual app route files instantiate the default handlers, so production `/api/v1/sites` and `/api/v1/tracking` are dead before DB access.

Reproduction:

```text
NODE_ENV=production APP_PUBLIC_URL=https://app.semforge.test ... GET /api/v1/sites
=> 401 {"data":null,"error":{"code":"UNAUTHENTICATED","message":"로그인이 필요합니다."},...}
```

Required fix: wire site/tracking routes to the real session-cookie auth guard, e.g. the existing runtime `createRuntimeRequireAuth()` path, and test the actual `src/app/api/v1/.../route.ts` exports in production mode with session cookies.

### 2. `GET /api/v1/sites` does not set the tenant GUC required by web-role RLS

- Files:
  - `src/server/sites/store.ts:84`
  - `src/server/sites/store.ts:91`
  - `src/server/sites/store.ts:290`
  - `src/server/sites/store.ts:296`
  - `src/db/migrations/0000_core.sql:665`
  - `src/db/migrations/0000_core.sql:690`

Mutations use `inTransaction()` and `set_config('app.workspace_id', ..., true)`, but `listSites()` runs a plain SELECT without `inTransaction()`. The migration forces tenant RLS on `sites` with `workspace_id = current_setting('app.workspace_id')::uuid`. With the real `semforge_web` role, the listing route will return no rows or fail depending on session state, even after the auth bug above is fixed.

The route/store tests miss this because they use PGlite directly as an injected `db` and do not exercise the web login role plus RLS GUC boundary.

Required fix: all web-role DB operations, including read paths, must run inside a transaction that sets `SET LOCAL app.workspace_id`, or use a single shared helper that enforces this boundary.

### 3. Billing authorization has no production provisioning path for `billing_customers`/`subscriptions`

- Files:
  - `src/server/auth/postgres-store.ts:256`
  - `src/server/auth/postgres-store.ts:268`
  - `src/server/auth/postgres-store.ts:309`
  - `src/server/billing/service.ts:720`
  - `src/server/billing/service.ts:725`
  - `src/server/billing/postgres-store.ts:198`
  - `src/server/billing/postgres-store.ts:199`
  - `src/server/billing/http.ts:215`
  - `src/server/billing/http.ts:216`

Invite acceptance currently creates a user, workspace, membership, invite consumption, and session. It does not create a `billing_customers` row or an `account_created` subscription. `completeAuthorization()` immediately calls `requiredAccount(workspaceId)`, and the Postgres billing store can only load an account by joining `billing_customers` to `subscriptions`.

Result: a newly invited beta customer can log in but cannot authorize Toss billing; the first paid activation path returns a generic 500 because `BillingServiceError` is not mapped to an `ApiError`.

Required fix: provision billing customer and initial subscription atomically with workspace creation, or introduce an explicit, idempotent billing-account bootstrap step before Toss authorization. Add an end-to-end test for invite accept → session cookie → billing authorize callback → first charge → `active`.

### 4. Billable retry ignores the HTTP `Idempotency-Key` and can create a new charge attempt on replay

- Files:
  - `src/server/billing/http.ts:253`
  - `src/server/billing/http.ts:254`
  - `src/server/billing/http.ts:261`
  - `src/server/billing/service.ts:681`
  - `src/server/billing/service.ts:689`
  - `src/server/billing/service.ts:693`

`retry` requires an `Idempotency-Key` header, but discards the value. `retryPastDue()` derives the next provider operation solely from the current latest attempt. If a retry request creates attempt 2 and that attempt fails, replaying the same HTTP request with the same `Idempotency-Key` can create attempt 3.

This violates the product/API contract that billable work requires idempotency and directly weakens the “duplicate charge 0건” launch criterion.

Reproduction scenario:

1. Workspace is `past_due` with latest attempt 1 failed.
2. Client sends `POST /api/v1/billing/retry` with `Idempotency-Key: K`.
3. Attempt 2 is created and fails.
4. Client/network retries the same request with `Idempotency-Key: K`.
5. Service computes `latest.attempt + 1` and creates attempt 3 instead of replaying attempt 2.

Required fix: persist and replay HTTP idempotency for retry/cancel/authorization routes at the API boundary, or bind the retry operation identity to the supplied key and reject/replay mismatched bodies.

### 5. Toss webhook endpoint has no authenticity check and writes DB rows from attacker-controlled IDs

- Files:
  - `src/server/billing/http.ts:286`
  - `src/server/billing/http.ts:288`
  - `src/server/billing/http.ts:292`
  - `src/server/billing/service.ts:895`
  - `src/server/billing/service.ts:897`
  - `src/server/billing/service.ts:912`
  - `src/server/billing/postgres-store.ts:414`
  - `src/server/billing/postgres-store.ts:417`
  - `src/server/billing/postgres-store.ts:420`

The webhook handler accepts any public POST with `tosspayments-webhook-transmission-id` and a JSON body. It uses that untrusted ID as the dedupe key and inserts into `provider_events` before querying Toss for authoritative payment state. A forged request with a guessed/observed order ID cannot directly mark payment paid because reconciliation queries Toss, but it can trigger provider queries and create unbounded `provider_events` rows with attacker-chosen transmission IDs.

The current test at `src/server/billing/http.contract.test.ts:150` enshrines this behavior as “official transmission id로 dedupe” rather than proving authenticity or abuse resistance.

Required fix: add a defensible webhook authenticity strategy before DB writes. If Toss billing webhooks cannot provide a universal signature for this event type, compensate with query-before-claim, strict order/payment correlation, rate limiting, replay windows, and a documented operator-configured secret/allowlist where applicable. Do not rely on the transmission ID alone as proof of origin.

### 6. Passing tests are false-confidence tests for production runtime composition

- Files:
  - `src/server/sites/routes.integration.test.ts:32`
  - `src/server/sites/routes.integration.test.ts:33`
  - `src/server/sites/routes.integration.test.ts:35`
  - `src/server/sites/store.integration.test.ts:20`
  - `src/server/billing/service.contract.test.ts:71`
  - `src/server/billing/service.contract.test.ts:72`
  - `src/server/billing/http.contract.test.ts:52`
  - `src/server/billing/http.contract.test.ts:56`

The target tests pass, but they do not cover the failure modes above:

- Site route tests inject `resolveSession` and PGlite, bypassing production session cookies, `createRuntimeRequireAuth()`, real `semforge_web` permissions, and tenant GUC/RLS.
- Billing service tests use an in-memory store preloaded with an `account_created` billing account, hiding the missing production provisioning path.
- Billing HTTP tests inject `requireAuth`, so they do not verify the actual runtime auth/origin behavior.
- Webhook tests assert that a transmission ID is enough to process the webhook.

Required fix: add contract/integration tests that instantiate the actual app route exports and runtime wiring, with production-like env, real session cookie flow, RLS role behavior, and full invite→billing lifecycle.

## MEDIUM

### 1. Billing state-changing routes bypass the shared same-origin Origin validation

- Files:
  - `src/server/billing/http.ts:204`
  - `src/server/billing/http.ts:220`
  - `src/server/billing/runtime.ts:42`
  - `src/server/billing/runtime.ts:44`
  - `src/server/auth/guard.ts:44`
  - `src/server/auth/guard.ts:48`
  - `src/server/auth/guard.ts:49`

The shared auth guard supports `assertSameOrigin()` when `csrf` is requested, but billing runtime implements its own `createSessionRequireAuth()` and only checks cookie/header CSRF equality. The canonical plan calls for CSRF and Origin validation. Billing is a payment boundary, so it should use the same origin policy as other state-changing API v1 routes or explicitly document a stronger replacement.

### 2. `BillingServiceError` is collapsed into generic 500 responses

- Files:
  - `src/server/billing/http.ts:215`
  - `src/server/billing/http.ts:216`
  - `src/server/billing/service.ts:169`
  - `src/server/billing/service.ts:179`

The billing HTTP adapter maps only `ApiError`; all domain errors become `INTERNAL`. This hides expected user/actionable states such as missing billing setup, invalid state, retry not due, exhausted retry, and customer mismatch behind 500 responses. It also made the missing billing-account provisioning problem harder to detect in tests.

## LOW

### 1. `timingSafeTextEqual()` is not timing-safe

- Files:
  - `src/server/billing/runtime.ts:38`
  - `src/server/billing/runtime.ts:39`

The function name claims timing-safety but uses plain string equality. For CSRF this is not the highest-risk issue, but the name is misleading at a security boundary. Rename it or use a real constant-time comparison after length-normalized hashing.

## Blockers before approval

1. Replace `resolveApiSession` for site/tracking routes with production session-cookie auth and add route-export tests that fail in production mode without a real session cookie.
2. Ensure every web-role DB operation, including `listSites`, sets `SET LOCAL app.workspace_id` in a transaction.
3. Provision `billing_customers` and initial `subscriptions(status='account_created')` atomically with workspace onboarding, then test invite → billing authorize → first charge → active.
4. Make billing retry/cancel/authorization idempotency durable at the API boundary; specifically, replaying the same `Idempotency-Key` must not advance to a later provider charge attempt.
5. Add webhook authenticity/abuse controls before provider-event persistence and update tests so they do not treat a raw transmission ID as proof of Toss origin.
6. Replace overfit injected tests with production-runtime integration tests covering auth, CSRF/Origin, RLS, tenant isolation, and full billing lifecycle.
