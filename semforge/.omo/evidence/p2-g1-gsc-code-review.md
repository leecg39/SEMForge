# P2-G1 GSC code review

Date: 2026-08-11 KST
Reviewer mode: read-only code quality review
Target commit: `ef28aae0092adad8ed3331641072ef21d80f3652`
Parent: `82447b8c92d59ca7f0f2ac396a59dfb6c3191611`

## Verdict

- codeQualityStatus: `BLOCK`
- recommendation: `REQUEST_CHANGES`

## Skill-perspective check

- `remove-ai-slops`: local skill file was not available in the provided skills list or discovered skill paths, so I applied the prompt's documented criteria directly.
- `programming`: local skill file was not available in the provided skills list or discovered skill paths, so I applied the prompt's documented criteria directly.
- Result: the diff violates both perspectives in the GSC binding path. The production code accepts an unproven `propertyUri`, and the tests create false confidence by validating only workspace composition/shape rather than the actual property authorization invariant.

## Evidence inspected

- Diff/stat for `82447b8..ef28aae`.
- Runtime GSC route wrappers in `src/app/api/v1/integrations/gsc/**/route.ts`.
- GSC runtime wiring: `src/server/gsc/runtime.ts`.
- GSC route handlers: `src/server/gsc/routes.ts`.
- OAuth/token code: `src/server/gsc/oauth.ts`.
- Google REST adapter: `src/server/gsc/google-client.ts`.
- Service/store: `src/server/gsc/service.ts`, `src/server/gsc/store.ts`.
- DB schema/migration snippets for `gsc_connections`, `oauth_states`, `gsc_property_bindings`, RLS and grants.
- Auth/API wrapper: `src/server/auth/guard.ts`, `src/server/auth/runtime.ts`, `src/lib/api-v1/*`.
- Claimed executor evidence: `semforge/.omo/evidence/p2-g1-t1-gsc-20260811.md`.

## Verification commands run

From `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`:

- `npm run typecheck` => pass
- `npm run lint` => pass
- `npx tsx --test src/server/gsc/oauth.contract.test.ts src/server/gsc/google-client.contract.test.ts src/server/gsc/routes.contract.test.ts src/server/gsc/store.integration.test.ts src/server/gsc/service.integration.test.ts` => 17/17 pass

Passing tests do not clear the blocker below because they do not cover the missing property-authorization invariant.

## Findings

### CRITICAL

None.

### HIGH

1. `bindProperty` can bind arbitrary GSC property URIs that were never returned by Google `sites.list`.

   - Files:
     - `semforge/src/server/gsc/service.ts:289`
     - `semforge/src/server/gsc/store.ts:345`
     - `semforge/src/server/gsc/service.integration.test.ts:287`
   - The service implementation delegates `bindProperty` straight to `upsertGscPropertyBinding` without checking the selected `propertyUri` against the authenticated connection's Search Console `sites.list` result.
   - The store only normalizes URI syntax and checks that `siteId` and `connectionId` are in the same workspace. It does not prove that the connected Google account can access the property being bound.
   - This breaks the core GSC model: a user can persist `propertyUri: "sc-domain:any-domain.example"` as long as they own any active connection in the workspace. Later GSC collection will either fail or query an unverified property, and the UI/API can represent an unauthorized property as bound.
   - The tests mask this. `service.integration.test.ts` first stubs `listSites()` to return `sc-domain:example.com`, then binds the same literal URI, but there is no negative test for binding a URI absent from `listSites()`. `store.integration.test.ts` also only proves workspace boundaries, not property authorization.
   - Required fix: make binding validate the requested property against the selected connection's current or cached `sites.list` properties before persisting, and add a negative test proving that same-workspace but unlisted properties are rejected.

### MEDIUM

1. Disconnect fails closed on Google revoke errors, so a broken or already-invalid Google token can prevent local disconnection.

   - File: `semforge/src/server/gsc/service.ts:297`
   - `disconnect()` decrypts the refresh token and awaits `searchConsoleClient.revokeToken(refreshToken)` before marking the connection disconnected locally. If Google returns a transient error, an invalid-token response, or a network timeout, the local connection remains active and the user cannot remove it through this path.
   - This is not a tenant leak, but it is operationally brittle for a beta SaaS where revocation can fail independently from local state. Consider marking local disconnect in a transaction/outbox style and recording best-effort revoke failure for retry/audit.

### LOW

1. The route tests are useful but mostly verify injected mock composition rather than actual Next route runtime behavior.

   - Files:
     - `semforge/src/app/api/v1/integrations/gsc/connect/route.ts:7`
     - `semforge/src/server/gsc/routes.contract.test.ts:78`
   - There are concrete route wrapper files and typecheck/build should catch import errors, but the tests do not instantiate actual route modules with runtime env/session/cookie paths. This is acceptable only if covered by a later API integration/E2E layer.

## Blockers

- Fix the property binding authorization gap: `bindProperty` must reject a same-workspace `propertyUri` unless it is present in the selected connection's authorized Search Console properties.
