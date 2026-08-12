# fix-final-reset-email-subject-fence evidence

- Branch: `codex/fix-final-reset-email-subject-fence`
- Base: `5e242d8`
- Included DB contract commits: `b187ede`, `7ec2ad`
- Scope: password-reset email worker delivery fence and production composition.

## Scenarios verified

1. Password-reset worker acquires canonical recipient shared locks, rechecks `email_suppressions`, calls Resend, and scrubs terminal payload on the same pinned connection/transaction.
   - Invocation: `npx tsx --test src/server/auth/password-reset-email.test.ts`
   - Observable: `tests 12`, `pass 12`, `fail 0`
   - Artifact: `.omo/evidence/fix-final-reset-email-subject-fence/password-reset-email-test.log`

2. Suppression discovered inside the delivery fence performs `Resend` calls `0` and commits terminal `rejected` scrub in the same transaction.
   - Invocation: `npx tsx --test src/server/auth/password-reset-email.test.ts`
   - Observable: `tests 12`, `pass 12`, `fail 0`
   - Artifact: `.omo/evidence/fix-final-reset-email-subject-fence/password-reset-email-test.log`

3. TypeScript contract check for updated handler/store/policy interfaces.
   - Invocation: `npm run typecheck`
   - Observable: exit code `0`
   - Artifact: `.omo/evidence/fix-final-reset-email-subject-fence/typecheck.log`

4. ESLint for owned implementation files.
   - Invocation: `npm run lint -- src/server/auth/password-reset-email.ts src/server/auth/password-reset-email.test.ts src/worker/production.ts`
   - Observable: exit code `0`
   - Artifact: `.omo/evidence/fix-final-reset-email-subject-fence/lint.log`

Additional broad check run before artifact capture:

- Invocation: `npm test -- src/server/auth/password-reset-email.test.ts`
- Observable: `tests 734`, `pass 733`, `fail 0`, `skipped 1`
