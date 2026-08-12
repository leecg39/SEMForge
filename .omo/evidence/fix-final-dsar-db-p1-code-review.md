# Code Quality Re-Review: fix-final-dsar-db-p1

## Scope

- Worktree: `/Users/user01/Music/SEMForge-worktrees/fix-final-dsar-db-p1`
- Reviewed current uncommitted diff only.
- Changed files:
  - `semforge/src/db/schema/core.ts`
  - `semforge/src/db/migrations/0000_core.sql`
  - `semforge/src/db/migrations/meta/0000_snapshot.json`
  - `semforge/src/db/postgres16.multisession.pg16.ts`
  - `semforge/src/db/schema/core.test.ts`

## Skill-Perspective Check

- `remove-ai-slops`: unavailable. Checked `/Users/user01/.codex/skills/remove-ai-slops/SKILL.md`, `/Users/user01/.agents/skills/remove-ai-slops/SKILL.md`, and `rg --files` under those skill roots.
- `programming`: unavailable. Checked `/Users/user01/.codex/skills/programming/SKILL.md`, `/Users/user01/.agents/skills/programming/SKILL.md`, and `rg --files` under those skill roots.
- Applied the prompt's documented criteria as fallback.
- Result: no remaining remove-ai-slops/programming violation. The previous arbitrary-hash overfit has been replaced by subject-hash success plus arbitrary-hash rejection.

## Findings

### CRITICAL

- None.

### HIGH

- None.

### MEDIUM

- None.

### LOW

- None.

## Reviewed Evidence

- `privacy_add_email_suppression` now binds erasure suppression to the exact subject email hash:
  - `semforge/src/db/migrations/0000_core.sql:1659`-`1677`
  - It checks current tenant GUC, running request, workspace, request type, active membership, `users.disabled_at IS NULL`, and `encode(sha256(lower(btrim(users.email))::bytea), 'hex') = p_recipient_hash`.
- PG16 coverage now includes:
  - subject email hash success: `semforge/src/db/postgres16.multisession.pg16.ts:1142`, `1172`-`1175`
  - arbitrary/wrong hash rejection: `semforge/src/db/postgres16.multisession.pg16.ts:1176`-`1184`
  - cross-workspace request rejection: `semforge/src/db/postgres16.multisession.pg16.ts:1185`-`1193`
  - non-erasure request rejection: `semforge/src/db/postgres16.multisession.pg16.ts:1194`-`1203`
- Accepted invite tombstone remains consistent and does not extend auth update grants:
  - `semforge/src/db/migrations/0000_core.sql:1409`-`1417`
  - `semforge/src/db/schema/core.ts:170`, `190`-`199`
  - `semforge/src/db/migrations/meta/0000_snapshot.json:1437`-`1442`, `1558`-`1560`
- Last-owner erasure serialization is present before owner count and delete:
  - `semforge/src/db/migrations/0000_core.sql:1353`-`1373`

## Validation Run

- `git diff --check`: pass.
- `npm run test:pg16:docker`: pass, including two migrations and PG16 multi-session tests `14/14`.
- `npm run typecheck`: pass.
- `npm run lint`: pass.

## Verdict

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `blockers`: none
