# fix-billing-settle-race-final evidence

- Worktree: `/Users/user01/Music/SEMForge-worktrees/fix-billing-settle-race-final/semforge`
- Branch: `codex/fix-billing-settle-race-final`
- Scope: billing settlement concurrency only.

## Implemented

- `PostgresBillingStore.settleCharge` now locks the subscription row before locking the payment row, uses `FOR UPDATE` on the payment row, enforces a store-local payment-status transition table, and appends ledger only on an allowed transition.
- Forbidden payment transitions are no-op, including stale `paid` after `failed`, `canceled`, or `refunded`.
- `scheduleCancellation` locks the subscription row and only records cancellation from `active`.
- `disablePaymentMethod` locks the subscription row before mutating payment method/subscription state.
- `paid` settlement does not revive subscriptions already moved to `cancel_at_period_end` or `past_due`.

## Validation

1. Scenario: store-local transition table blocks terminal-state rollback and preserves same-state replay.
   Invocation: `npm run typecheck && npx tsx --test src/server/billing/postgres-store-scope.test.ts`
   Observable: exit code `0`; node:test reports `4` pass / `0` fail.

2. Scenario: actual PostgreSQL 16 concurrent settle/retry writes one `charge.succeeded` ledger event.
   Invocation: `npm run test:pg16:docker -- --test-name-pattern "billing"`
   Observable: exit code `0`; PG16 main harness reports `19` pass / `0` fail.

3. Scenario: actual PostgreSQL 16 stale `paid` after terminal `canceled`/`refunded` is no-op and writes no success ledger.
   Invocation: `npm run test:pg16:docker -- --test-name-pattern "billing"`
   Observable: exit code `0`; test `PostgreSQL 16 billing settle은 terminal cancel/refund 이후 stale DONE을 no-op 처리한다` passes.

4. Scenario: actual PostgreSQL 16 concurrent settle vs cancellation/payment-method disable does not revive subscription access.
   Invocation: `npm run test:pg16:docker -- --test-name-pattern "billing"`
   Observable: exit code `0`; test `PostgreSQL 16 billing subscription race는 cancel/disable을 stale settle로 되돌리지 않는다` passes.

5. Scenario: privacy PG16 barrier remains intact under the same Docker harness.
   Invocation: `npm run test:pg16:docker -- --test-name-pattern "billing"`
   Observable: exit code `0`; privacy PG16 harness reports `4` pass / `0` fail.
