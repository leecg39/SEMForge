# P2-A1 auth review blocker fixes

- Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- Branch: `codex/phase-2-product`
- Base HEAD: `a1dce68 feat: implement paid beta site tracking APIs`
- Node binary observable: `v24.18.0`
- Node artifact: `.omo/evidence/p2-a1-auth-review-fixes-20260811/node-version.log`

## Scenarios and artifacts

1. RED baseline: new auth review tests fail on base HEAD.
   - Invocation: temporary `git archive HEAD` checkout with modified tests copied in, then `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" node_modules/.bin/tsx --test --test-name-pattern "throttleKey|outbox delivery|outbox 영속화|AUTH_TRUST_PROXY_HEADERS|password reset 생성은 reset token row" ...`
   - Binary observable: process exit `1`; output reports `tests 7`, `pass 1`, `fail 6`.
   - Artifact: `.omo/evidence/p2-a1-auth-review-fixes-20260811/red-baseline.log`

2. GREEN full verification on Node 24.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm run verify`
   - Binary observable: process exit `0`; output reports `tests 225`, `pass 225`, `fail 0`.
   - Artifact: `.omo/evidence/p2-a1-auth-review-fixes-20260811/npm-verify.log`

3. Diff hygiene.
   - Invocation: `git diff --check`
   - Binary observable: process exit `0`; no whitespace errors emitted.
   - Artifact: `.omo/evidence/p2-a1-auth-review-fixes-20260811/diff-check.log`

## Fixed blockers

- Login/forgot throttling now receives a SHA-256 HTTP throttle key that combines client signals. `x-forwarded-for` and `x-real-ip` are included only when `AUTH_TRUST_PROXY_HEADERS=true`.
- Password reset no longer uses the runtime drop-notifier. The service builds a reset URL from `APP_PUBLIC_URL` and the PostgreSQL auth adapter inserts the password reset row and `email.password_reset` outbox row in one transaction.
