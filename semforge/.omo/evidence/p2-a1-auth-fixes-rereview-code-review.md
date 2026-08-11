# P2-A1 auth blocker fixes rereview

- Review target: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- Branch: `codex/phase-2-product`
- Head reviewed: `9dea322 fix: address auth review blockers`
- Reviewed diff: `git diff 9dea322^..9dea322 -- semforge`
- Goal: verify whether the prior auth BLOCK items are actually fixed:
  1. victim-email global lockout / spoofed forwarded IP
  2. raw reset token discarded behind a fake `202 accepted`

## Reviewer-run evidence

- `PATH="/Users/user01/homebrew/opt/node@24/bin:$PATH" npm exec -- tsx --test src/server/auth/http.test.ts src/server/auth/service.test.ts src/server/auth/postgres-store.test.ts src/lib/env.test.ts src/db/migrations/core.integration.test.ts`
  - Result: exit `0`, tests `68`, pass `68`, fail `0`.
- `git diff --check 9dea322^..9dea322 -- semforge/src semforge/.env.example`
  - Result: exit `0`.
- `git diff --check 9dea322^..9dea322 -- semforge`
  - Result: exit `2`, because committed evidence log `.omo/evidence/p2-a1-auth-review-fixes-20260811/red-baseline.log` has trailing whitespace. This does not affect runtime code, but contradicts the submitted diff hygiene claim if the whole committed diff is considered.

## Skill-perspective check

- `code-review` skill: loaded and applied.
- `remove-ai-slops` skill: unavailable. No `remove-ai-slops/SKILL.md` was found under `/Users/user01/.agents/skills`, `/Users/user01/.codex/skills`, or `/Users/user01/.codex/plugins/cache`; I applied the prompt-provided overfit/slop criteria manually.
- `programming` skill: unavailable. No `programming/SKILL.md` was found under the same local skill roots; I applied the prompt-provided programming criteria manually.
- Skill-perspective result: the auth HTTP and reset-delivery tests are mostly behavior-relevant. One new DB permission test mirrors the widened implementation (`outbox:SELECT`) instead of challenging least-privilege boundaries, which contributes to the HIGH finding below.

## Prior blockers

### Prior blocker 1: victim-email global lockout / spoofed forwarded IP

Status: resolved for the reported failure mode.

- `src/server/auth/http.ts:154-175` derives a SHA-256 server-side throttle key from request client signals.
- `src/server/auth/http.ts:186-197` and `src/server/auth/http.ts:254-264` pass that key into login and forgot-password service calls.
- `src/server/auth/http.ts:166-171` excludes `x-forwarded-for` / `x-real-ip` unless `trustedProxyHeaders` is explicitly enabled.
- `src/server/auth/runtime.ts:28-33` wires that setting from `AUTH_TRUST_PROXY_HEADERS`.
- `src/server/auth/http.test.ts:143-227` covers both victim-email-only key avoidance and spoofed forwarded header exclusion.

Note: the remaining rate-limit design still depends on client-provided headers when trusted proxy headers are disabled, so it should be revisited before public exposure. I am not treating that as the same blocker because this rereview was scoped to the previous victim global lockout and spoofed forwarded-IP issue.

### Prior blocker 2: raw reset token discarded / fake 202

Status: resolved in runtime flow.

- The old runtime drop-notifier is gone; `src/server/auth/runtime.ts:20-25` now injects `APP_PUBLIC_URL` into the service.
- `src/server/auth/service.ts:85-99` constructs the reset URL.
- `src/server/auth/service.ts:261-297` creates a raw token, stores only its hash, and passes reset delivery data to the store.
- `src/server/auth/postgres-store.ts:487-558` inserts the password reset row and `email.password_reset` outbox row in one transaction.
- `src/server/auth/service.test.ts:420-459` proves the raw token appears only in the reset URL delivery payload and matches the stored hash.
- `src/server/auth/postgres-store.test.ts:705-731` proves the reset row and outbox row are created together.

## Findings

### CRITICAL

None.

### HIGH

1. `src/db/migrations/0000_core.sql:647`, `src/db/migrations/0000_core.sql:729`, `src/server/auth/postgres-store.ts:541-546` — `semforge_auth` now has global `SELECT` over outbox rows that contain raw password reset URLs.
   - Problem: the fix moves the raw reset token into `outbox.payload.resetUrl`, but the migration grants `semforge_auth` table-level `SELECT, INSERT ON outbox` and adds an RLS `SELECT` policy with `USING (true)`. That lets the pre-tenant auth DB role read all outbox payloads, not just insert a reset-delivery job or return an inserted ID.
   - Impact: the auth role can now read raw reset links for every workspace once those rows exist. This broadens a pre-tenant role into a cross-workspace secret-reading role and weakens the security model the reset-token fix was supposed to improve.
   - Required fix: do not grant broad outbox `SELECT` to `semforge_auth`. Prefer no `RETURNING`, column-limited `SELECT` only if strictly required, or a dedicated function/role path that can insert `email.password_reset` without reading payloads. Add a negative permission/RLS test proving `semforge_auth` cannot read existing outbox payloads.

### MEDIUM

1. `.omo/evidence/p2-a1-auth-review-fixes-20260811/summary.md` and `.omo/evidence/p2-a1-auth-review-fixes-20260811/diff-check.log` — submitted diff hygiene evidence is incomplete for the committed diff.
   - Problem: `git diff --check 9dea322^..9dea322 -- semforge` fails on trailing whitespace in the committed red-baseline log, while the submitted diff-check artifact is empty/successful.
   - Impact: runtime code is unaffected, but the evidence package overstates hygiene unless it intentionally excluded `.omo/evidence`.

### LOW

1. `src/server/auth/contracts.ts:13-21` — stale `PasswordResetNotifier` contract remains after runtime moved to store/outbox delivery.
   - Impact: not a runtime bug, but it is now dead boundary vocabulary and can mislead future auth/reporting work.

## Verdict

- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- reportPath: `.omo/evidence/p2-a1-auth-fixes-rereview-code-review.md`
- blockers:
  1. Remove or tightly constrain `semforge_auth` read access to outbox payloads before approval.
