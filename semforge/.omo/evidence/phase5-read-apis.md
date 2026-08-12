# Phase 5 read API checkpoint

Date: 2026-08-12 KST
Branch: `codex/phase-5-read-apis`
Base: `3702adec17136b4f98417496d85fa7b6c8740f99` (`origin/codex/paid-beta-core`)

## Implemented surface

- `GET /api/v1/insights/naver`
  - Authenticated by API session workspace.
  - Requires billing `workspace:read`; `past_due` grace report-only mode is rejected with 403.
  - Requires tenant-owned `siteId`; cross-workspace site IDs return 404.
  - Reads active rank tracked queries and each query's latest NAVER observation within optional `observedFrom`/`observedTo`.
  - Response includes monthly PC/mobile/total search volume, relative trend, demographics, blog result count, and per-source `status`/`errorCode`/provenance.
  - Does not expose competition, PPC, NAVER rank, or manual refresh fields.

- `GET /api/v1/visibility/aio`
  - Authenticated by API session workspace.
  - Requires billing `workspace:read`; `past_due` grace report-only mode is rejected with 403.
  - Requires tenant-owned `siteId`; cross-workspace site IDs return 404.
  - Reads active AIO tracked queries and each query's latest Google AIO observation within optional `observedFrom`/`observedTo`.
  - Response includes `present | absent | unknown`, answer text, sorted citations, and fixed Google/TalorData provenance.

## Evidence

### Target contract and tenant tests

Invocation:

```bash
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node node_modules/tsx/dist/cli.mjs --test src/server/insights/routes.integration.test.ts src/contracts/product-surface.contract.test.ts
```

Observable:

- 9 tests
- 9 pass
- 0 fail
- Route contract includes `/api/v1/insights/naver` and `/api/v1/visibility/aio`.
- Tenant isolation scenarios assert cross-workspace 404.
- Billing access scenario asserts `workspace:read` and 403 for past-due report-only mode.
- Query validation rejects missing `siteId`, inverted ranges, and `refresh=true`.

### Typecheck

Invocation:

```bash
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/npm run typecheck
```

Observable:

- `tsc --noEmit`
- exit code 0

### Full verify

Invocation:

```bash
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/npm run verify
```

Observable:

- `lint`: exit 0
- `typecheck`: exit 0
- full test suite: 487 tests, 486 pass, 1 fail

Known failing test outside this task scope:

- `src/server/auth/invite-billing-provisioning.test.ts`
- Scenario: `acceptInviteAtomic provisions billing_customers and account_created subscription in the same transaction`
- Failure: fixed test `expires_at` was `2026-08-12T03:00:00.000Z`, while current run time was later (`created_at 2026-08-12 04:26:29.919+00`), violating `invites_expiry_window_ck`.
- This failure predates and is outside the GET read API files changed here.

### Production build and manifest

Invocation:

```bash
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/npm run build
```

Observable:

- Next.js 16.3.0
- Compile success
- TypeScript success
- Static generation success: 35/35
- Manifest includes:
  - `ƒ /api/v1/insights/naver`
  - `ƒ /api/v1/visibility/aio`

### Dependency audit

Invocations:

```bash
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/npm audit --audit-level=high --production=false
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/npm audit --audit-level=high --omit=dev
```

Observable:

- full dependency audit: 0 vulnerabilities
- production dependency audit: 0 vulnerabilities
