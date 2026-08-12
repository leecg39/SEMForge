# Phase4 Integration Pre-Audit Code Review

> Superseded: 이 문서는 `f162313` 시점의 병합 전 감사 기록입니다. 아래 P0/P1은
> `f3fa082`, `8bac742`, `bb9bb6f`, `94721a4`, `6299c32`, `175a56d`에서 수정되었고,
> 최종 판정은 후속 `phase4-final-security-rereview.md`와 실제 PG/Docker/browser QA를
> 기준으로 합니다. 역사적 재현 근거를 보존하기 위해 본문은 변경하지 않습니다.

Reviewed worktree: `/Users/user01/Music/SEMForge-worktrees/phase-4-delivery/semforge`

Observed refs at final read:
- ops/current HEAD: `codex/phase-4-delivery@f162313145c0a85eb4217dd3446c5cbd5acf83fa`
- report delivery: `codex/parallel-p4-report-delivery@1507f577604f4464d25f7f496c9727d1a472cd62`
- UI: `codex/parallel-p4-ui@8a22d73056cfb87d85c334b58609d57a195a9961`
- API gaps latest: `codex/parallel-p4-api-gaps@2b6b3f91b14fa380a4d162df9375385a600d2e4d`
- dependency: `df3cfbfbd3b89040493164713a8ba8b10dc7b5ec`

The worktree was moving during review. Findings below are based on the final observed dirty worktree plus branch inspection above.

## Skill Perspective Check

`remove-ai-slops` and `programming` skill files were searched under the local skill roots and were not available as readable `SKILL.md` files. I applied the documented criteria from the prompt instead.

Violations found:
- `remove-ai-slops`: current tests overfit to existing collection-only relay behavior and do not exercise the actual report delivery outbox -> jobs path.
- `programming`: production behavior is split across handler registration and relay topic filtering without a single contract proving every generated report outbox topic becomes a registered job type.

## CRITICAL

### P0: report.pdf.render/report.email.deliver outbox is never published by the production relay

`generateWeeklyReport` enqueues report delivery topics after snapshot creation and replay:
- `src/server/reports/store.ts:445`-`450`
- `src/server/reports/store.ts:543`-`547`

The outbox topics are the job types:
- `src/server/reports/delivery/job-handler.ts:18`-`19`
- `src/server/reports/delivery/outbox.ts:40`-`63`

The production worker registry was updated and now registers the report runtime handlers:
- `src/worker/production.ts:22`
- `src/worker/production.ts:113`-`118`
- `src/server/reports/runtime.ts:31`-`47`

But the only production relay still claims `COLLECTION_OUTBOX_TOPICS`:
- `src/worker/relay-runtime.ts:61`-`67`

That allowlist contains only collection topics:
- `src/worker/topics.ts:4`-`13`

The current relay test also locks in collection-only behavior:
- `src/server/outbox/relay.integration.test.ts:196`-`224`

Direct reproduction in the reviewed worktree:

```text
runtime.runOnce() => {"claimed":0,"published":0,"failed":0}
outbox => [{"topic":"report.email.deliver","published":false},{"topic":"report.pdf.render","published":false}]
jobs => []
```

Impact: report snapshots can enqueue PDF/email work, but no production process converts those outbox rows into jobs. `report.pdf`, email delivery, and the signed PDF route remain operationally disconnected.

Required fix: extend the production relay mapping to include exactly `report.pdf.render` and `report.email.deliver` and publish them to matching registered job types. Add a regression test that inserts those two outbox topics, runs the production relay, and asserts queued jobs with matching types.

## HIGH

### P1: worker outbox INSERT RLS is broader than the report delivery need

The current dirty migration grants worker role column-level INSERT on `outbox`:
- `src/db/migrations/0000_core.sql:783`-`785`

The worker policy checks only workspace:
- `src/db/migrations/0000_core.sql:864`-`865`

By contrast, scheduler has a topic allowlist:
- `src/db/migrations/0000_core.sql:897`-`898`

The new worker RLS test verifies own-workspace insert, select denial, update denial, and cross-tenant denial, but it does not verify that worker cannot insert non-report topics:
- `src/db/migrations/core.integration.test.ts:209`-`279`

Impact: Phase3's hardened worker boundary is widened. A worker can insert arbitrary same-tenant outbox topics instead of only report delivery topics. Once the relay is expanded, this becomes a more serious privilege-composition risk.

Required fix: constrain `outbox_worker_insert` to `topic in ('report.pdf.render', 'report.email.deliver')` plus the existing workspace check, and add a negative test for collection/password-reset/unknown topics under `semforge_worker`.

### P1: UI/API billing checkout branches conflict and neither side alone is complete

API gaps branch adds the checkout contract:
- `codex/parallel-p4-api-gaps:src/app/api/v1/billing/checkout/route.ts:8`-`9`
- `codex/parallel-p4-api-gaps:src/server/billing/http.ts:296`-`320`
- `codex/parallel-p4-api-gaps:src/server/billing/runtime.ts:75`-`110`
- `codex/parallel-p4-api-gaps:src/components/core-shell/billing-checkout.tsx:120`-`193`

UI branch's billing workspace does not call checkout and explicitly says the connection screen is not ready:
- `codex/parallel-p4-ui:src/components/product/billing-workspace.tsx:77`-`79`

The branch pair conflicts in `semforge/src/app/app/billing/page.tsx`. API gaps renders `BillingCheckout`, while UI renders `BillingWorkspace`:
- `codex/parallel-p4-api-gaps:src/app/app/billing/page.tsx:3`-`24`
- `codex/parallel-p4-ui:src/app/app/billing/page.tsx:3`-`16`

Impact: final merge can easily lose either checkout launch/completion or subscription summary/retry/cancel state. A green merge that picks one side would regress Phase4 billing UX.

Required fix: billing page must compose both surfaces: keep UI branch's `BillingWorkspace` for subscription summary/retry/cancel and API gaps' `BillingCheckout` for `/api/v1/billing/checkout` + `/api/v1/billing/authorize`. Add UI tests that assert the checkout endpoint is used and that callback success/fail states do not hide current subscription state.

### P1: env merge must add TOSS_CLIENT_KEY without dropping service profiles or report delivery env

Current ops env has service profiles and report delivery requirements:
- `src/lib/env.ts:20`-`23`
- `src/lib/env.ts:111`-`188`
- `src/lib/env.ts:213`-`255`

API gaps branch adds `TOSS_CLIENT_KEY`, but its branch copy lacks the ops service-profile structure:
- `codex/parallel-p4-api-gaps:src/lib/env.ts:34`
- `codex/parallel-p4-api-gaps:src/lib/env.ts:107`-`134`

`git merge-tree codex/phase-4-delivery codex/parallel-p4-api-gaps` reports a content conflict in `semforge/src/lib/env.ts`.

Required fix: preserve `SEMFORGE_SERVICE`, `productionRequiredByService`, PG SSL checks, and report delivery env keys. Add `TOSS_CLIENT_KEY` to schema and require it for `all` and `web`; do not require it for worker/relay/scheduler/migrate/build. Update `.env.example` and `env.test.ts` accordingly.

## MEDIUM

### Route allowlist and legacy deletion are currently guarded

No blocking regression found here. Current contracts require exact page routes and API prefixes:
- `src/contracts/product-surface.contract.test.ts:12`-`44`
- `src/contracts/product-surface.contract.test.ts:114`-`141`

Legacy path/source checks are still present:
- `src/contracts/product-surface.contract.test.ts:46`-`84`
- `src/contracts/product-surface.contract.test.ts:143`-`180`
- `src/contracts/product-surface.contract.test.ts:182`-`210`

The final observed app tree had only allowed pages/routes, including the report PDF route under the allowed `/api/v1/reports` prefix.

### UI site detail and branding contracts match API gaps

Site detail shapes align:
- `codex/parallel-p4-ui:src/components/product/contracts.ts:57`-`64`
- `codex/parallel-p4-ui:src/components/product/contracts.ts:333`-`347`
- `codex/parallel-p4-api-gaps:src/server/sites/store.ts:68`-`77`
- `codex/parallel-p4-api-gaps:src/server/sites/store.ts:347`-`403`
- `codex/parallel-p4-api-gaps:src/server/sites/routes.ts:152`-`160`

Branding shapes align:
- `codex/parallel-p4-ui:src/components/core-shell/workspace-settings-form.tsx:35`-`39`
- `codex/parallel-p4-ui:src/components/product/settings-workspace.tsx:119`-`126`
- `codex/parallel-p4-api-gaps:src/server/reports/branding/routes.ts:21`-`27`
- `codex/parallel-p4-api-gaps:src/server/reports/branding/store.ts:35`-`40`
- `codex/parallel-p4-api-gaps:src/server/reports/branding/store.ts:82`-`100`

## LOW

### Test run was not on Node 24

Targeted tests passed, but the local shell reported Node `v25.4.0`, not the required Node 24 runtime. Treat this as smoke evidence only.

Executed:

```text
npm exec -- tsx --test src/worker/production.test.ts src/server/outbox/relay.integration.test.ts src/db/migrations/core.integration.test.ts
```

Result:

```text
tests 30, pass 30, fail 0
```

## Merge Recommendation

Do not approve final integration until the P0/P1 findings above are fixed.

Recommended order after fixes:

1. Finish report delivery integration in ops first. Required before proceeding: production relay publishes report delivery topics, worker outbox RLS is topic-limited, and targeted PG/relay tests cover both.
2. Merge dependency `df3cfbf` or reconcile its package overrides while preserving current ops scripts and report delivery dependencies (`puppeteer-core`, `@fontsource/noto-sans-kr`, S3/Resend needs). Do not take branch-tip deletions shown by simple two-dot diffs.
3. Merge API gaps latest. Resolve `src/lib/env.ts` by preserving ops service profiles and adding `TOSS_CLIENT_KEY` only where web/all need it. Keep report env keys.
4. Merge UI. Resolve billing page conflict by composing `BillingCheckout` with `BillingWorkspace`; preserve route allowlist tests and product surface contracts.
5. Run full Node24/PG16/Docker/browser/fault-injection matrix before release.

Expected conflicts and resolution principles:

- `src/lib/env.ts`: preserve ops service profiles, PG SSL validation, report delivery env, and add API gaps `TOSS_CLIENT_KEY`.
- `src/lib/env.test.ts`: keep service-profile tests and add client-key expectations for web/all.
- `src/app/app/billing/page.tsx`: do not choose either branch wholesale; render both checkout and subscription state surfaces.
- report delivery branch's historical migration/env copies must not overwrite Phase3 dispatcher/scheduler/worker RLS. Its branch copy contains worker `USING (true)` style policies; current ops must keep transaction-local workspace checks and dispatcher-only global queue access.

## Required Post-Integration Scenarios

Node 24:
- Run under Node 24.x, not Node 25: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:ops`, `npm run verify`.
- Targeted tests: report delivery job handlers/runtime/outbox/service, storage S3, rendering PDF, worker production registry, outbox relay, billing checkout/authorize, UI product contracts.

PG16:
- `npm run test:pg16:docker`.
- Migration from empty PG16 and rerun idempotency.
- RLS role checks: dispatcher can claim/publish jobs/outbox but not tenant domain rows; worker can only tenant-scoped provider/report/delivery rows and only report delivery outbox insert; worker cannot read `users`; auth resolves owner email; scheduler can only collection outbox topics.

Docker/ops:
- Build web/worker/relay/scheduler/migrator targets with Node 24.
- Verify `SEMFORGE_SERVICE=build` production build requires no secrets.
- Start compose with separate env files and ensure release/migration gates web/worker/relay/scheduler.
- Validate Chromium/Noto availability inside worker image and no `HOSTNAME=0.0.0.0` outside web target.

Browser:
- Owner/admin/member login.
- Site list/detail, tracking create/toggle, GSC binding, branding GET/PATCH.
- Billing checkout launch, Toss success callback, Toss fail callback, retry past-due, cancel-at-period-end.
- Report detail, PDF signed URL, tenant isolation on cross-workspace report/site IDs.

9-site fault injection:
- Use three workspaces with three sites each.
- Inject mixed failures: missing GSC binding, TalorData provider failure, NAVER rate limit, S3 existing-object conflict, Resend 429/accepted-then-crash, expired relay lease, duplicate idempotency keys, past_due billing restriction, and cross-tenant ID attempts.
- Assert no cross-tenant jobs/outbox/reports/assets/deliveries leak and all retry/dead states are observable.

## Verdict

codeQualityStatus: BLOCK

recommendation: REQUEST_CHANGES

blockers:
- P0 production relay does not publish `report.pdf.render` or `report.email.deliver` outbox topics.
- P1 worker outbox INSERT policy is not topic-limited to report delivery topics.
- P1 billing page/env conflicts must be resolved without dropping checkout, subscription state, service profiles, or report delivery env.
