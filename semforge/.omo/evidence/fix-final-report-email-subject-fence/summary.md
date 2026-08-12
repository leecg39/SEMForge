# Report email subject erasure fence evidence

- Worktree: `/Users/user01/Music/SEMForge-worktrees/fix-final-report-email-subject-fence/semforge`
- Branch: `codex/fix-final-report-email-subject-fence`
- Base: `5e242d80afde896f27ec7b0d651d6f507828742b`
- Integrated DB contract commits:
  - `4a910a9 fix(db): harden subject erasure privacy boundaries`
  - `7cb89e8 fix(db): add recipient email erasure fence`

## Implemented scope

- Added `ReportDeliveryStore.withEmailDeliveryFence`.
- Report email delivery now uses one pinned transaction/connection for:
  1. `set_config('app.workspace_id', ...)`
  2. `privacy_lock_recipient_email_shared(workspace_id, full_recipient_sha256)`
  3. final `email_suppressions` recheck
  4. delivery preparation
  5. PDF asset read/write
  6. S3 object read/write
  7. provider email send
  8. delivered/failed terminal DB update
  9. commit
- Provider failures are committed as terminal delivery failures before the original sanitized service error is rethrown.
- Idempotency key format remains the pre-existing 32-hex recipient suffix; only the privacy recipient lock uses the full 64-hex SHA-256.

## Focused validation

### Report delivery fence tests

Invocation:

```bash
export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
npx tsx --test src/server/reports/delivery/store.suppression.test.ts src/server/reports/delivery/service.integration.test.ts
```

Binary observable:

- `tests 9`
- `pass 9`
- `fail 0`

Covered scenarios:

- recipient shared lock occurs before final suppression recheck
- same connection remains uncommitted through provider-equivalent callback and delivery terminal update
- suppression inserted after the initial check suppresses delivery before PDF/S3/provider work
- existing provider failure and idempotency-expiry terminal semantics remain preserved

### Typecheck

Invocation:

```bash
export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
npm run typecheck
```

Binary observable:

- `tsc --noEmit`
- exit code `0`

### Targeted lint

Invocation:

```bash
export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
npm run lint -- src/server/reports/delivery/service.ts src/server/reports/delivery/store.ts src/server/reports/delivery/store.suppression.test.ts src/server/reports/delivery/service.integration.test.ts
```

Binary observable:

- `eslint ...`
- exit code `0`

### PostgreSQL 16 Docker gate partial

Invocation:

```bash
export PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
npm run test:pg16:docker
```

Binary observable:

- `npm run test:pg16`: `tests 15`, `pass 15`, `fail 0`
- `npm run test:pg16:privacy`: failed in pre-existing fixture path:
  - duplicate user fixture: `users_email_lower_uq` for `subject-a@example.test`
  - subsequent worker shared fence test timed out after 60000ms

Interpretation:

- The DB recipient email advisory lock contract passed in the PostgreSQL 16 multi-session test:
  `PostgreSQL 16 recipient email lock은 sender shared와 erasure exclusive를 같은 recipient hash로 직렬화한다`.
- The remaining privacy-barrier failure is outside this agent's owned files and was not modified here.
