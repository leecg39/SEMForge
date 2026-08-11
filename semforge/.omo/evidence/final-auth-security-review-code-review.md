# Final auth security rereview

- Review target requested: `82447b8 fix: restrict auth outbox privileges`
- Current inspected HEAD: `ef28aae feat: implement google search console integration`
- Note: HEAD moved after the task was issued. `82447b8..HEAD` does not change `src/server/auth`, auth API routes, `src/lib/session.ts`, or the outbox migration/test files inspected for the prior HIGH, so the auth finding verification still applies to current HEAD.
- Skill-perspective check: `remove-ai-slops` and `programming` skills were searched under the available skill roots and were not present as loadable `SKILL.md` files. I applied the prompt-provided criteria instead: no deletion-only/tautological tests, no implementation-mirroring privilege test accepted as sole evidence, no needless production parsing/normalization added for this auth fix.

## Evidence inspected

- `src/db/migrations/0000_core.sql:647` grants `semforge_auth` only column-level `INSERT` on `outbox`.
- `src/db/migrations/0000_core.sql:729-730` defines only `outbox_auth_insert` with `topic = 'email.password_reset'`.
- `src/db/migrations/core.integration.test.ts:313-342` proves `semforge_auth` can insert the password reset outbox row, cannot insert a wrong topic, and cannot `SELECT payload` from tenant outbox rows.
- `src/server/auth/postgres-store.ts:537-551` inserts the password reset outbox entry without `.returning()`.
- Grep check found no remaining `semforge_auth` broad outbox `SELECT` grant or `FOR SELECT` outbox policy.
- Targeted tests passed:
  - `tsx --test --test-name-pattern "auth role은 password reset outbox|password reset 생성은 reset token row|비밀번호 재설정 요청" src/db/migrations/core.integration.test.ts src/server/auth/postgres-store.test.ts src/server/auth/service.test.ts`
  - 4/4 pass.
- Auth/GSC auth-boundary tests passed:
  - `tsx --test src/server/auth/*.test.ts src/lib/session.test.ts src/server/gsc/oauth.contract.test.ts`
  - 74/74 pass.
  - `tsx --test src/server/gsc/routes.contract.test.ts src/server/gsc/oauth.contract.test.ts src/server/gsc/store.integration.test.ts`
  - 9/9 pass.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None.

## Prior HIGH status

Resolved. The previous `semforge_auth` broad outbox `SELECT` / payload leak is removed in the inspected current state. The auth role no longer has table-level outbox `SELECT`; the remaining privilege is column-level `INSERT`, constrained by an insert-only RLS policy and covered by a negative permission test.

## Verdict

- codeQualityStatus: CLEAR
- recommendation: APPROVE
- blockers: []
