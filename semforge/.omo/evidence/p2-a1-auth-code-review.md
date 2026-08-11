# P2-A1-T1 Auth Code Review

- Review target: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- Branch: `codex/phase-2-product`
- Base: `d2a0cc7`
- Head: `d6b8d2c`
- Reviewed diff: `git diff d2a0cc7..HEAD`
- Canonical requirement: `docs/planning/06-tasks.md:73-79`

## Reviewer-run evidence

- `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm exec -- tsx --test src/server/auth/tokens.test.ts src/server/auth/password.test.ts src/server/auth/postgres-store.test.ts src/server/auth/guard.test.ts src/server/auth/service.test.ts src/server/auth/http.test.ts src/lib/session.test.ts scripts/invite.test.ts`
  - Result: exit 0, tests 77, pass 77, fail 0.
- `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm run verify`
  - Result: exit 0, lint pass, typecheck pass, tests 183, pass 183, fail 0.

Executor evidence note: `.omo/evidence/p2-a1-t1-auth-20260811-173100/summary.md` exists, but the log files it references (`auth-targeted.log`, `full-test.log`, `lint.log`, `typecheck.log`, etc.) are not present in this worktree. I did not rely on that summary as proof.

## Skill-perspective check

- `code-review` skill: loaded and applied.
- `remove-ai-slops` skill: unavailable in the provided skill list and no local `SKILL.md` found under `/Users/user01/.agents/skills` or `/Users/user01/.codex/skills`; applied the prompt-provided overfit/slop criteria manually.
- `programming` skill: unavailable in the provided skill list and no local `SKILL.md` found under `/Users/user01/.agents/skills` or `/Users/user01/.codex/skills`; applied the prompt-provided programming criteria manually.
- Skill-perspective result: the diff does violate the requested slop/programming perspectives in the HTTP auth tests: tests intentionally assert `throttleKey === undefined` even when client/proxy headers are present, which locks in an implementation detail that creates false confidence around rate limiting and DoS resistance.

## Findings

### CRITICAL

None.

### HIGH

1. `src/server/auth/http.ts:64-79`, `src/server/auth/http.ts:149-156`, `src/server/auth/http.ts:213-217`, `src/server/auth/service.ts:80-83`, `src/server/auth/http.test.ts:98-117`, `src/server/auth/http.test.ts:313-327` — Login and forgot-password rate limiting are keyed only by normalized email in the real HTTP path.
   - Problem: `loginInputSchema` and `requestPasswordResetInputSchema` support a server-only `throttleKey`, and `AuthService` includes that key in the throttle digest. The HTTP adapter strips public server-only fields but never derives or passes any trusted request/client key. The tests explicitly assert `received?.throttleKey === undefined` while sending `x-forwarded-for` and `x-real-ip`.
   - Impact: six unauthenticated POSTs against a victim email consume the single `auth_action_throttles` row for that email and block the victim globally for 15 minutes, regardless of the victim's own network/session. That is a targeted account lockout DoS in the auth boundary the task explicitly asked to review.
   - Required fix: derive a server-controlled throttle dimension at the HTTP/runtime boundary, or split account and client throttles so password spraying is controlled without allowing trivial victim-email lockout. Do not accept spoofable `x-forwarded-*` directly unless the deployment proxy canonicalizes it into a trusted internal header. Replace the current tests that assert `undefined` with tests proving cross-client victim lockout is not possible.

2. `src/server/auth/runtime.ts:16-27`, `src/server/auth/runtime.ts:34-38`, `src/server/auth/http.ts:213-218`, `src/server/auth/service.ts:271-283` — The production runtime accepts password reset requests but discards the only raw reset token.
   - Problem: `requestPasswordReset` correctly stores only a token hash and passes the raw token to `PasswordResetNotifier`, but `createRuntimeAuthService()` wires a notifier boundary that intentionally does `void notification`. The public `forgotPassword` handler still returns `202 accepted`.
   - Impact: in the actual runtime composition, users cannot complete password reset because the raw token is never returned, emailed, or enqueued. Since only the hash is stored, the token is unrecoverable after the request. This contradicts the P2-A1 requirement to implement password reset and is not covered by the fake-notifier service/HTTP tests.
   - Required fix: wire a real durable notification/outbox boundary for reset delivery, or keep the route disabled/explicitly unavailable until that boundary exists. Add a runtime-composition test that proves a reset request creates a deliverable reset notification without leaking the raw token.

### MEDIUM

1. `.omo/evidence/p2-a1-t1-auth-20260811-173100/summary.md:20-38` — The executor summary references log artifacts that are not present in this worktree.
   - Impact: this does not change code behavior, and I re-ran the relevant suites directly, but the submitted evidence package is incomplete and should not be used as approval proof.

### LOW

None.

## Reviewed areas with no P0/P1 finding

- Invite acceptance uses a locked invite row and a single transaction for user/workspace/membership/invite/session creation (`src/server/auth/postgres-store.ts:195-337`).
- Invite reuse, concurrent acceptance, existing-user password hash CAS, slug-conflict rollback, and session replacement are covered by `src/server/auth/postgres-store.test.ts`.
- Session tokens are opaque, hashed before storage, and the cookie parser rejects duplicate session cookies (`src/lib/session.ts:64-139`).
- CSRF/Origin validation rejects missing/null/cross-origin origins and host mismatch for state-changing v1 routes (`src/lib/api-v1/origin.ts`, `src/lib/api-v1/index.test.ts`).
- Operator invite CLI avoids printing DB error details and only requests the operator database role (`scripts/invite.ts`, `scripts/invite.test.ts`).
- No public signup route was found under `src/app`.

## Verdict

- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- blockers:
  1. Fix HTTP/runtime rate-limit keying so unauthenticated attackers cannot globally lock a victim email out with a handful of requests.
  2. Wire or disable runtime password-reset delivery; the current runtime returns 202 while discarding the only raw reset token.
