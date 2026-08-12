# fix-final-dsar-db-p1 evidence

## Scope

- Worktree: `/Users/user01/Music/SEMForge-worktrees/fix-final-dsar-db-p1`
- Branch: `codex/fix-final-dsar-db-p1`
- Base HEAD: `a047f3ff5e4c3eead86ce57e7f43cc55efd0da01`
- Owned files:
  - `semforge/src/db/schema/core.ts`
  - `semforge/src/db/migrations/0000_core.sql`
  - `semforge/src/db/migrations/meta/0000_snapshot.json`
  - `semforge/src/db/postgres16.multisession.pg16.ts`
  - `semforge/src/db/schema/core.test.ts`

## Implemented behavior

1. `privacy_add_email_suppression(workspace_id, request_uuid, recipient_hash)` now allows subject `erasure` requests only when:
   - `app.workspace_id` matches `p_workspace_id`;
   - the request is exact, running, and tenant-scoped;
   - the request subject still has an active membership;
   - `p_recipient_hash` equals SHA-256 of the subject's normalized email.
2. `workspace_deletion` suppression remains broad for workspace recipient suppression and still requires an exact running workspace deletion request.
3. Subject erasure tombstones accepted invite identity before deleting the subject membership:
   - preserves `accepted_at`, `accepted_workspace_id`, and `role`;
   - clears `accepted_by_user_id` to remove the membership FK;
   - replaces invite email with `erased:<sha256>`;
   - records `accepted_erased_at`.
4. Subject erasure serializes owner deletion by taking the workspace advisory lock plus workspace/membership row locks before checking owner count.
5. Recipient-scoped email send/erasure race fencing is exposed through transaction-scoped DB functions:
   - sender shared lock: `privacy_lock_recipient_email_shared(uuid,text)`, granted to `semforge_worker` and `semforge_dispatcher`;
   - erasure exclusive lock: `privacy_lock_recipient_email_exclusive(uuid,text)`, granted only to `semforge_privacy`;
   - `privacy_add_email_suppression(...)` takes the exclusive recipient lock after exact request validation and before inserting suppression.

## Red evidence

`npm run test:pg16:docker` failed on base implementation after adding tests:

- subject erasure suppression rejected exact erasure request with `privacy email suppression requires matching running deletion request`;
- accepted invite FK blocked membership deletion via `invites_accepted_owner_membership_fk`;
- concurrent owner erasure allowed both deletions, violating the one-owner invariant.

## Green evidence

Commands run from `/Users/user01/Music/SEMForge-worktrees/fix-final-dsar-db-p1/semforge` with Node 24 path:

```sh
export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

- `npm run test:pg16:docker`
  - scenario: real PostgreSQL 16 roles/RLS/functions plus new subject erasure suppression, recipient email shared/exclusive lock ACL and blocking, accepted invite tombstone, and concurrent owner erasure tests
  - result after recipient-lock follow-up: `15 pass / 0 fail`
- `npm run test:db`
  - scenario: PGlite fresh migration, second migration, schema contract, role grants, env/crypto contracts
  - result after recipient-lock follow-up: `68 pass / 0 fail`
- `npx tsx --test src/server/privacy/service.integration.test.ts src/server/privacy/processor.test.ts`
  - scenario: privacy service/processor subject erasure and workspace deletion flow
  - result: `22 pass / 0 fail`
- `npm run typecheck`
  - result: pass
- `npm run lint`
  - result: pass
- `npm run db:generate`
  - scenario: canonical Drizzle schema drift check
  - result after recipient-lock follow-up: `No schema changes, nothing to migrate`
- `bash scripts/test-privacy-barrier-pg16.sh`
  - scenario: real PostgreSQL 16 privacy fence crash/unlock barrier
  - result: `2 pass / 0 fail`
- `npm test`
  - scenario: full test suite before the final subject-hash binding correction
  - result: `727 tests / 726 pass / 0 fail / 1 skip`

## Independent review

- Initial independent review: `BLOCK`, P1 found because subject erasure suppression allowed arbitrary recipient hash.
- Fix applied: erasure branch now binds `p_recipient_hash` to the request subject's normalized email hash; PG16 test now uses actual subject hash and rejects arbitrary hash.
- Re-review: `CLEAR`, `APPROVE`, no remaining P0/P1/P2 findings.
- Reviewer-reported checks: `git diff --check`, `npm run test:pg16:docker` 14/14, `npm run typecheck`, `npm run lint`.
- Review artifact: `/Users/user01/Music/SEMForge-worktrees/fix-final-dsar-db-p1/.omo/evidence/fix-final-dsar-db-p1-code-review.md`.
