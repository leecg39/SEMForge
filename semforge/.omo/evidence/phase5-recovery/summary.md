# Phase 5 Recovery Harness Checkpoint

<!-- @TASK P5-O1-T1 -->

## Scope

- Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-5-recovery/semforge`
- Branch: `codex/phase-5-recovery`
- Base: `origin/codex/paid-beta-core@3702adec17136b4f98417496d85fa7b6c8740f99`
- Files changed:
  - `scripts/recovery/cli.ts`
  - `scripts/recovery/recovery.contract.test.ts`
  - `deploy/RUNBOOK.md`

## Implemented recovery seams

The public seam is the operator CLI:

- `doctor`
- `pg-pitr-plan`
- `object-version-restore`
- `image-rollback-plan`
- `forward-migration-audit`
- `toss-reconcile-plan`

All commands are dry-run/read-only except `object-version-restore`, which only copies files inside the caller-provided local fixture directory. The Toss command forbids charge/refund/cancelBillingKey and only emits a reconciliation/manual legal refund ledger plan.

## Evidence

| Criterion | Invocation | Result | Artifact |
| --- | --- | --- | --- |
| RED: CLI missing fails all recovery contracts | `npx tsx --test scripts/recovery/recovery.contract.test.ts` with `scripts/recovery/cli.ts` temporarily renamed under `trap` | 6 failed | `.omo/evidence/phase5-recovery/recovery-contract-red-missing-cli.log` |
| GREEN: recovery CLI contracts | `npx tsx --test scripts/recovery/recovery.contract.test.ts` | 6 passed | `.omo/evidence/phase5-recovery/recovery-contract-green.log` |
| Lint on new TS files | `npx eslint scripts/recovery/cli.ts scripts/recovery/recovery.contract.test.ts` | exit 0 | `.omo/evidence/phase5-recovery/eslint-recovery.log` |
| TypeScript project check | `npx tsc --noEmit --pretty false` | exit 0 | `.omo/evidence/phase5-recovery/typecheck.log` |
| Runtime capability doctor | `node --import tsx scripts/recovery/cli.ts doctor --json` | JSON generated, externalWrites `[]` | `.omo/evidence/phase5-recovery/doctor.json` |
| Current migration compatibility scan | `node --import tsx scripts/recovery/cli.ts forward-migration-audit --migrations-dir src/db/migrations` | pass true, 1 SQL file scanned, 0 destructive findings | `.omo/evidence/phase5-recovery/forward-migration-audit.json` |

## Environment note

The local PATH in this worker resolved to Node `v25.4.0` and npm `11.7.0`; no Node 24 binary was found in the checked common locations. This checkpoint validates the harness behavior and type/lint state, but the parent release gate should rerun this evidence on Node 24 before merging into paid beta.

## External system boundary

No live PostgreSQL instance, S3/MinIO bucket, Docker container, Toss payment, Toss refund, or billing key cancellation was created or modified by this checkpoint. Live provider recovery remains a launch/ops gate requiring approved credentials and provider consoles.

