# P2-A1 auth outbox RLS fix

- Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- Branch: `codex/phase-2-product`
- Base HEAD: `9dea322 fix: address auth review blockers`
- Node binary observable: `v24.18.0`
- Node artifact: `.omo/evidence/p2-a1-rls-fix-20260811/node-version.log`

## Scenarios and artifacts

1. RED baseline: new RLS/minimum-privilege tests fail against base HEAD.
   - Invocation: temporary `git archive HEAD` checkout with modified `src/db/migrations/core.integration.test.ts`, then `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" node_modules/.bin/tsx --test --test-name-pattern "auth role은 pre-tenant|auth role은 password reset outbox" src/db/migrations/core.integration.test.ts`
   - Binary observable: process exit `1`; output reports `tests 2`, `pass 0`, `fail 2`.
   - Artifact: `.omo/evidence/p2-a1-rls-fix-20260811/red-baseline.log`

2. GREEN targeted role/RLS and application insert coverage.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm exec -- tsx --test --test-name-pattern "auth role은 pre-tenant|auth role은 password reset outbox|password reset 생성은 reset token row" src/db/migrations/core.integration.test.ts src/server/auth/postgres-store.test.ts`
   - Binary observable: process exit `0`; output reports `tests 3`, `pass 3`, `fail 0`.
   - Artifact: `.omo/evidence/p2-a1-rls-fix-20260811/targeted.log`

3. Full verification on Node 24.
   - Invocation: `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm run verify`
   - Binary observable: process exit `0`; output reports `tests 226`, `pass 226`, `fail 0`.
   - Artifact: `.omo/evidence/p2-a1-rls-fix-20260811/npm-verify.log`

4. Diff hygiene.
   - Invocation: `git diff --check`
   - Binary observable: process exit `0`; no whitespace errors emitted.
   - Artifact: `.omo/evidence/p2-a1-rls-fix-20260811/diff-check.log`

## Fixed blocker

- Removed `semforge_auth` broad outbox `SELECT` grant and select policy.
- Replaced auth outbox privilege with column-level `INSERT (workspace_id, topic, payload, idempotency_key, available_at, created_at)`.
- Restricted auth outbox RLS to `FOR INSERT ... WITH CHECK (topic = 'email.password_reset')`.
- Removed application dependence on outbox `RETURNING`/`SELECT`.
