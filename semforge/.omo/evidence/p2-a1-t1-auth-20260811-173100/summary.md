# P2-A1-T1 auth finish evidence

- Worktree: `/Users/user01/Music/SEMForge-worktrees/parallel-auth/semforge`
- Branch: `codex/parallel-auth`
- Node binary observable: `v24.18.0`
- Node artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/node-version.log`

## Scenarios and artifacts

1. RED: removing invite-acceptance current-session revocation leaves the existing user's old session valid.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm exec -- tsx --test --test-name-pattern "기존 사용자는 password hash" src/server/auth/postgres-store.test.ts`
   - Binary observable: process output reports `fail 1`; assertion expected `null` but received the old session principal.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/red-revocation-regression.log`

2. GREEN: restored invite-acceptance revocation makes the same regression pass.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm exec -- tsx --test --test-name-pattern "기존 사용자는 password hash" src/server/auth/postgres-store.test.ts`
   - Binary observable: process exit `0`; output reports `pass 1`, `fail 0`.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/green-revocation-regression.log`

3. Auth targeted seam coverage: token, password, Postgres store, guard, service, HTTP adapter, session cookie, operator invite CLI.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm exec -- tsx --test src/server/auth/tokens.test.ts src/server/auth/password.test.ts src/server/auth/postgres-store.test.ts src/server/auth/guard.test.ts src/server/auth/service.test.ts src/server/auth/http.test.ts src/lib/session.test.ts scripts/invite.test.ts`
   - Binary observable: process exit `0`; output reports `tests 77`, `pass 77`, `fail 0`.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/auth-targeted.log`

4. Lint.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm run lint`
   - Binary observable: process exit `0`.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/lint.log`

5. Typecheck.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm run typecheck`
   - Binary observable: process exit `0`.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/typecheck.log`

6. Full test suite.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm run test`
   - Binary observable: process exit `0`; output reports `tests 183`, `pass 183`, `fail 0`.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/full-test.log`

7. Diff check.
   - Invocation: `git diff --check`
   - Binary observable: process exit `0`.
   - Artifact: `.omo/evidence/p2-a1-t1-auth-20260811-173100/diff-check.log`
