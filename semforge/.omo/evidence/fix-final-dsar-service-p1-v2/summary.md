# fix-final-dsar-service-p1-v2 evidence

## Scope

- Worktree: `/Users/user01/Music/SEMForge-worktrees/fix-final-dsar-service-p1-v2/semforge`
- Branch: `codex/fix-final-dsar-service-p1-v2`
- Changed product files:
  - `src/server/privacy/service.ts`
  - `src/server/privacy/service.integration.test.ts`

## Implemented contract

- Subject erasure now runs email suppression before destructive local erasure in a separate committed tenant transaction.
- The first transaction claims the exact approved `erasure` request, reads the exact subject email through `privacy_erasure_subject`, calls the durable suppression processor, records `email.suppress:<recipientHash>`, then commits.
- The second transaction reclaims the same request UUID, takes `pg_advisory_xact_lock(hashtextextended('privacy_subject_email:' || workspace_id || ':' || recipient_hash, 0))`, then calls `privacy_erase_subject`, records `local.subject_erasure`, and finishes the request.
- The lock key was coordinated with report/password reset email agents for their shared send-side locks.

## Verification

### Service-only worktree

- Scenario: PGlite privacy service integration, including the new regression that observes suppression row + suppression step after the first commit and before `privacy_erase_subject`.
- Invocation:
  - `export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`
  - `./node_modules/.bin/tsx --test src/server/privacy/service.integration.test.ts`
- Binary observable:
  - `tests 16`
  - `pass 16`
  - `fail 0`
  - `skipped 0`
- Captured terminal output: current Codex task transcript.

### Typecheck

- Scenario: TypeScript compile boundary after service refactor.
- Invocation:
  - `export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`
  - `npm run typecheck`
- Binary observable:
  - `tsc --noEmit`
  - exit code `0`
- Captured terminal output: current Codex task transcript.

### Full local test run

- Scenario: Accidental full project test run from `npm test -- src/server/privacy/service.integration.test.ts`; retained as additional regression evidence.
- Invocation:
  - `export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`
  - `npm test -- src/server/privacy/service.integration.test.ts`
- Binary observable:
  - `tests 733`
  - `pass 732`
  - `fail 0`
  - `skipped 1`
- Captured terminal output: current Codex task transcript.

### Latest DB contract integration worktree

- Integration worktree: `/Users/user01/Music/SEMForge-worktrees/integration-dsar-service-db-p1.t4Xh7u/repo/semforge`
- Base DB commit: `7ec2ad0228020dce6d293896d8b35adaceacf351`
- Service diff: current two-file service patch applied with `git apply`.
- Scenario: latest DB subject-erasure suppression contract plus service transaction split.
- Invocation:
  - `export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`
  - `./node_modules/.bin/tsx --test src/server/privacy/service.integration.test.ts`
- Binary observable:
  - `tests 16`
  - `pass 16`
  - `fail 0`
  - `skipped 0`
- Captured terminal output: current Codex task transcript.

### PostgreSQL 16 privacy barrier integration

- Integration worktree: `/Users/user01/Music/SEMForge-worktrees/integration-dsar-service-db-p1.t4Xh7u/repo/semforge`
- Base DB commit: `7ec2ad0228020dce6d293896d8b35adaceacf351`
- Scenario: real PostgreSQL 16 Docker privacy barrier, including worker shared fence and crash/unlock recovery.
- Invocation:
  - `export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`
  - `npm ci`
  - `bash scripts/test-privacy-barrier-pg16.sh`
- Binary observable:
  - migrations applied twice
  - `tests 2`
  - `pass 2`
  - `fail 0`
  - `skipped 0`
- Captured terminal output: current Codex task transcript.

### Diff hygiene

- Scenario: whitespace/trailing diff validation.
- Invocation:
  - `git diff --check`
- Binary observable:
  - exit code `0`
- Captured terminal output: current Codex task transcript.
