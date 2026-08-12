# SEMForge final integrated re-audit code review

Reviewed SHA: `b1a66c754ac57f64b306add5a8ade255a813f45b`

Current worktree HEAD at review time: `22cb81dccd6ba36d411ed17feeac1559b739cd95`.
`b1a66c754ac57f64b306add5a8ade255a813f45b..HEAD` changes are evidence files only; source code is unchanged relative to the requested reviewed SHA.

## Skill-perspective check

- `remove-ai-slops`: unavailable in the listed/local skill paths; applied the prompt criteria manually.
- `programming`: unavailable in the listed/local skill paths; applied the prompt criteria manually.
- Result: no deletion-only/tautological privacy tests or production over-normalization were found in the audited blocker fixes. The new tests exercise skipped delegates and active paths, not just implementation constants.

## Status

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `blockers`: none

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW / watch

1. `semforge/src/server/gsc/routes.ts:147`, `:175`, `:210`, `:252` still call billing authorization before the workspace privacy operation. The protected GSC service delegate is fenced and returns 409 under blocking/erased workspaces, so this is not a P0/P1 blocker. If the intended policy is literally zero tenant-adjacent reads before privacy fence, move these billing checks inside `runWorkspaceOperation` for consistency with sites, insights, branding, and billing.

## Blocker closure evidence

1. Multi-workspace password reset blocker is closed.
   - `semforge/src/server/auth/privacy-fenced-store.ts:113-126` computes canonical membership workspace IDs and wraps `store.createPasswordReset(...)` in one `fence.withSharedMany(...)`.
   - `semforge/src/server/auth/privacy-fenced-store.test.ts:215-243` asserts one blocking membership prevents reset token/outbox creation.
   - `semforge/src/server/auth/privacy-fenced-store.test.ts:245-278` asserts canonical de-duplication/sorting and single multi-workspace fence.

2. Tenant read API privacy fence matrix is closed for previously failing surfaces.
   - Sites list/detail: `semforge/src/server/sites/routes.ts:120-130`, `:174-185` run reads and billing check inside `privacyOperation.withShared(...)`.
   - NAVER/AIO read APIs: `semforge/src/server/insights/routes.ts:490-515` run site assertion, billing, and provider reads inside `privacyOperation.withShared(...)`.
   - Report branding GET/PATCH: `semforge/src/server/reports/branding/routes.ts:79-111` fences billing and branding store access.
   - GSC connections/properties: `semforge/src/server/gsc/routes.ts:211-260` fences service list operations; tests assert blocked/erased states do not call the service delegate.
   - Billing checkout/summary/authorize/retry/cancel/webhook: `semforge/src/server/billing/http.ts:333-497` fences tenant service access and canonical webhook handling.

## Test and gate evidence inspected

- `.omo/evidence/phase5-ci/latest/summary.json`: status `passed`, Node `v24.14.0`, release gate steps exit `0`.
- `.omo/evidence/phase5-ci/latest/npm-verify.log`: `npm run verify` exit `0`; relevant assertions include:
  - forgot password multi-workspace privacy fence at log line 308.
  - billing privacy fence at log lines 353-370.
  - GSC privacy fence at log lines 484-500.
  - NAVER/AIO privacy fence at log lines 521-524.
  - branding privacy fence at log lines 612-615.
  - sites/tracking privacy fence at log lines 672-679.
- `.omo/evidence/phase5-ci/latest/route-manifest.log`: pages `14`, routes `31`, exit `0`.
- `.omo/evidence/phase5-ci/latest/forbidden-surface.log`: checked files `306`, exit `0`.
- `.omo/evidence/phase5-ci/latest/npm-audit-full.log` and `npm-audit-production.log`: `found 0 vulnerabilities`.
- `.omo/evidence/final-20260812/minio-versioning.log`: MinIO versioned S3 acceptance `17` passed, `0` failed.

## Notes on evidence quality

`summary.md` / `final-20260812/summary.md` still contain a stale `Final source SHA: e50c5e6...` string, but the underlying release-gate `summary.json` and logs record successful execution after the privacy read tests were present. The requested SHA was inspected directly via Git object reads, and current HEAD adds evidence files only.
