# Phase 4 final PostgreSQL 16 / Docker QA

- QA result: **PASS** for the code and infrastructure paths exercised at `afaffac6ec94bd0dd4e4b0417180760dbb8f7534`.
- Production change: `afaffac` (`fix(scheduler): gate weekly collection and reports`), already merged by the parent into Phase 4 as `94721a409bb3dea68187408a1d00eb0bed2de5ec`.
- Latest central reference observed while closing QA: `175a56d17dcf437e7ecf4bb810f018d15752458f`; `afaffac` is its ancestor.
- Launch result: **BLOCKED only for real external-provider smoke tests**, as listed in `launch-gates.md`. No real Toss/Google/NAVER/Resend/S3 success was claimed.

## Node 24 quality gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Runtime | Node `v24.19.0`, npm `11.17.0` | `00-environment.log`, `00-npm-version.log` |
| `npm ci` | 422 packages installed; 423 audited; 0 vulnerabilities | `01-npm-ci.log` |
| Full verify | 465 passed, 0 failed | `44-node24-full-verify-final.log` |
| Production build | compiled; 33/33 static pages generated | `45-node24-build-final.log` |
| Full audit | 0 vulnerabilities | `46-node24-audit-full-final.log` |
| Production audit | 0 vulnerabilities | `47-node24-audit-prod-final.log` |
| Drizzle generate | 33 tables; `No schema changes, nothing to migrate` | `48-db-generate-drift-final.log` |
| Canonical migrations | only `0000_core.sql`, `meta/0000_snapshot.json`, and one journal entry; fresh and second apply both succeeded | `41-canonical-fresh-migration.log`, `42-canonical-second-migration.log` |

## Actual PostgreSQL 16 matrix

The Docker service used `postgres:16-alpine` on port `55432` with database data on Compose `tmpfs`. The final actual-role suite passed 2/2 in `49-pg16-all-web-billing-report-provider0.log`.

| Contract | Measured result |
| --- | --- |
| Independent sessions / `SKIP LOCKED` | 2 PoolClients had distinct backend PIDs; concurrent one-row claims produced 2 distinct job IDs |
| Provider reservation concurrency | 2 concurrent reservations converged on 1 provider-call ID and 1 usage-reservation ID; dispositions were `execute` + `in_doubt` |
| Outbox crash recovery | 1 expired relay lease recovered, re-claimed, and published exactly once |
| Worker RLS | workspace A saw 1 own site / 0 workspace-B sites; jobs SELECT denied |
| Dispatcher boundary | global jobs readable; tenant sites SELECT denied |
| Subscription candidate filter | 5 fixtures: `active` and unexpired `cancel_at_period_end` allowed; expired cancel, `past_due`, and `account_created` excluded |
| Collection schedule idempotency | first run `google=3, naver=3, gsc=0`; second run all 0 |
| Report schedule concurrency | 2 concurrent scheduler pools over 2 eligible sites produced 2 total `report.snapshot` rows, all `cycleMonday=2026-08-17` |
| Scheduler negative RLS | arbitrary `billing.charge`, cross-tenant report payload, and outbox payload SELECT all denied |
| Web billing privilege regression | SELECT/INSERT/UPDATE/DELETE denied on each of `billing_customers`, `payment_methods`, and `subscriptions`: 12/12 denied |
| Queued billing lapse gate | `collect.google` and `report.snapshot` both terminal-success skipped for `past_due`; provider/generator delegate calls `0`; 2 skip audits |

The static/deploy contract additionally verifies separate CronJobs: collection `0 9 * * 0` UTC (Sunday 18:00 KST) and report snapshot `0 23 * * 0` UTC (Monday 08:00 KST), plus the canonical relay/handler mapping for `report.snapshot`.

## Nine-site scenario and fault matrix

`phase4-nine-site.ts` used the real PostgreSQL roles plus the production site/query stores, collection/report schedulers, outbox relay, worker runtime, report generator, delivery store/service, and job queue. Only the external provider/storage/email boundaries were mocks.

| Metric | Result |
| --- | ---: |
| Workspaces / sites | 3 / 9 |
| Accepted tracked queries | 360 (20 rank + 20 AIO per site) |
| Site-limit negative checks | 3/3 fourth-site attempts rejected |
| Query-limit negative checks | 18/18 21st rank/AIO attempts rejected |
| Initial site/tracking outbox | 369 |
| Weekly collection outbox | 189 (`google=9`, `naver=180`, `gsc=0`) |
| Collection relay | 189 claimed / 189 published / 0 failed, 2 batches |
| Collector boundary calls | Google 9 / NAVER 180, 2 worker batches |
| Report snapshot outbox | 9 first run / 0 delayed replay |
| Weekly reports generated | 9 |
| PDF/email delivery outbox | 18 claimed / 18 published / 0 failed |
| Delivery state | 9 deliveries, 9 assets, 9 delivered, 9 stored objects |
| Accepted-then-reset email fault | 1 retryable first attempt; 10 sends but 9 stable accepted idempotency keys; final 9 delivered |
| Abandoned/killed lease recovery | lease reclaimed after expiry; final `succeeded`, attempts `2`, recovery handler calls `1` |

The fault harness emulates a killed worker by committing a lease and abandoning the client before expiry; it does not claim an operating-system SIGKILL of a separate worker process. The actual PostgreSQL outbox suite separately verifies expired relay-lease recovery.

## Docker images and host restoration

At the original Lima `docker` allocation (4 CPUs, 4 GiB), the first `web` image build was killed during `npm run build` with exit code 137. This is classified as a **QA-host build resource constraint, not an application defect**. No user image, container, or volume was deleted to address it.

Lima was temporarily changed to 8 GiB. All five targets then built: `web`, `worker`, `relay`, `scheduler`, and `migrator`. Each image ran as user `semforge`, UID `10001`, with Node `v24.19.0`, Chromium `151.0.7922.108`, and `Noto Sans CJK KR` resolved by fontconfig. Evidence: `54-docker-build-5-targets-4g.log`, `55-lima-resize-8g.log`, `56-docker-build-5-targets-8g.log`, and `57-docker-image-inspect.log`.

The Lima instance was restored exactly to `Running`, 4 CPUs, 4 GiB (`DockerMemTotal=4093943808`). The QA-only PostgreSQL container/network were removed without `--volumes`; the five tagged QA images were retained. Evidence: `58-lima-restore-4g.log`, `59-qa-cleanup-final-state.log`.

## Central-head scope statement

The final infrastructure run used `afaffac`. Relative to that commit, central `175a56d` adds server paid-beta access enforcement and report-download UI/API changes. It does not change the Dockerfile/Compose/Kubernetes CronJobs, canonical migrations, PostgreSQL role/RLS tests, scheduler, relay, job queue, billing gate, report schedule/job handler, renderer, storage, or delivery service used by this QA.

Two shared report-store files did change centrally: `src/server/reports/store.ts` gained an optional `periodEndBefore` read filter, while `src/server/reports/delivery/store.ts` gained a read-only `loadReportForAccess` method and period-end field. The nine-site generation/delivery harness does not call either new code path. Therefore the reported infrastructure results remain applicable to their exercised paths, while the new billing-access/UI/report-download paths are outside this evidence run and are covered by their separate central tests/reviews.

## Reproduction commands

```sh
PATH=/tmp/semforge-p4-node24-runtime/bin:$PATH npm ci
PATH=/tmp/semforge-p4-node24-runtime/bin:$PATH npm run verify
PATH=/tmp/semforge-p4-node24-runtime/bin:$PATH npm run build
PATH=/tmp/semforge-p4-node24-runtime/bin:$PATH npm audit
PATH=/tmp/semforge-p4-node24-runtime/bin:$PATH npm audit --omit=dev
PATH=/tmp/semforge-p4-node24-runtime/bin:$PATH npm run db:generate

COMPOSE_PROJECT_NAME=semforge-p4-final-pg-qa-pg16 SEMFORGE_PG16_PORT=55432 docker compose -f compose.pg16.yml up --detach --wait
PG16_TEST_DATABASE_URL=postgresql://postgres:semforge_test@127.0.0.1:55432/semforge_test npm run db:migrate
PG16_TEST_DATABASE_URL=postgresql://postgres:semforge_test@127.0.0.1:55432/semforge_test npm run db:migrate
PG16_TEST_DATABASE_URL=postgresql://postgres:semforge_test@127.0.0.1:55432/semforge_test npm run test:pg16
PG16_TEST_DATABASE_URL=postgresql://postgres:semforge_test@127.0.0.1:55432/semforge_test node --import tsx .omo/evidence/phase4-final-pg-docker-qa/phase4-nine-site.ts

for target in web worker relay scheduler migrator; do
  docker build --progress=plain --target "$target" -t "semforge-p4-final-pg-qa-$target:afaffac" .
done
```
