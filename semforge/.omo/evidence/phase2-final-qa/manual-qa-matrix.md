# SEMForge Phase 2 Final Manual QA Matrix

- 대상: `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge`
- HEAD: `13554518a4b1e75a75a252b85f58a1cabee2e691`
- 기준: `docs/planning/06-tasks.md` P2-V Product API Gate
- 최종 판정: APPROVE / CLEAR

## surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| SE-01 | P2-V 전체 API 인증·CSRF·IDOR·교차 테넌트 계약 테스트 | Node 24 test gate | `PATH=/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run verify` | PASS: lint, typecheck, test 254/254, fail 0 | A1 |
| SE-02 | P2-V production build readiness | Next.js production build | `NODE_ENV=production ... npm run build` with CI dummy secrets only | PASS: Next 16.3.0 compiled successfully and emitted allowed app routes | A2 |
| SE-03 | P2-V runtime surface smoke | Next.js production server | `NODE_ENV=production ... npm start` | PASS: production server reached Ready state | A3 |
| SE-04 | route/build manifest allowlist | route file inventory and allowlist script | `find src/app -type f ...`; Node allowlist comparison | PASS: unexpected routes `[]` | A4, A5 |
| SE-05 | forbidden legacy/brand/runtime source removal | source grep excluding tests | `rg -n "sqlite|better-sqlite|semrush|gitnexus|..." src package.json .env.example --glob '!**/*.test.ts' --glob '!**/*.test.tsx'` | PASS: no forbidden source matches. Package-lock optional peer metadata was reviewed separately as dependency metadata, not source/runtime dependency. | A6 |
| SE-06 | high/critical vulnerability gate | production dependency audit | `npm audit --omit=dev` | PASS: found 0 vulnerabilities | A7 |
| SE-07 | allowed public page HTTP surface | production HTTP | `curl -i --max-time 10 http://127.0.0.1:31234/login/` | PASS: 200 OK, Korean SEMForge login page | A8 |
| SE-08 | disallowed legacy URL behavior | production HTTP | `curl -i --max-time 10 http://127.0.0.1:31234/competitors/` | PASS: 404 Not Found, no redirect to legacy feature | A8 |
| SE-09 | API envelope unauthenticated behavior | production HTTP | `curl -i --max-time 10 http://127.0.0.1:31234/api/v1/auth/session/` | PASS: 401 JSON `{data:null,error,requestId}` | A8 |
| SE-10 | CSRF/origin rejection at HTTP boundary | production HTTP | `curl -i -X POST http://127.0.0.1:31234/api/v1/auth/login/ -H 'content-type: application/json' -H 'origin: https://evil.example' --data ...` | PASS: 403 JSON `{data:null,error,requestId}` before DB use | A8 |

## adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| AC-01 | P2-A1, P2-V | expired/reused/mutated invite, concurrent accept, rollback | only one accept succeeds; invalid states hidden; rollback leaves no orphan | PASS: covered by real integration tests in verify log | A1 |
| AC-02 | P2-A1, P2-V | session fixation/header tenant spoofing | cookie-backed session only; fake tenant headers rejected; rotation/revoke safe | PASS: covered by real integration tests in verify log | A1 |
| AC-03 | P2-A1, P2-V | password reset enumeration/reuse/session survival | generic forgot response; token one-time; sessions revoked; reset outbox insert-only | PASS: covered by real integration/DB tests in verify log | A1 |
| AC-04 | P2-S1, P2-V | site/tracking IDOR and limit races | other workspace returns NOT_FOUND; 3 sites and 20 rank/AIO limits enforced | PASS: covered by real PostgreSQL/API tests in verify log | A1 |
| AC-05 | P2-S1, P2-V | domain SSRF/input abuse | paths, credentials, ports, IP/internal hosts, private DNS rejected | PASS: covered by real unit/integration tests in verify log | A1 |
| AC-06 | P2-G1, P2-V | OAuth state tamper/reuse/expiry and scope escalation | state is hashed, 10-min, one-time, user/workspace bound; extra scope rejected | PASS: covered by real GSC integration tests in verify log | A1 |
| AC-07 | P2-G1, P2-V | cross-tenant GSC property binding | site and connection workspace composite boundary enforced; property must exist in Google sites.list | PASS: covered by real service tests in verify log | A1 |
| AC-08 | P2-B1, P2-V | duplicate/timeout/reordered Toss events | idempotent order/payment attempts; Query reconciliation; no duplicate charge advancement | PASS: covered by real billing tests in verify log | A1 |
| AC-09 | P2-B1, P2-V | untrusted webhook tenant spoofing/oversized body/rate flood | sessionless webhook dedupes by transmission id, resolves by server-known fingerprint, rejects oversized/rate abuse | PASS: covered by real route/service tests in verify log | A1 |
| AC-10 | P2-V | cross-origin mutation over HTTP | mutation rejected before handler/DB | PASS: production curl returned 403 envelope | A8 |
| AC-11 | P1/P2 route reduction | legacy route probing | legacy competitor path must 404 without redirect | PASS: production curl returned 404 | A8 |

## artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | terminal log | Node 24 `npm run verify`; lint, typecheck, 254 tests pass | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/npm-verify.log` |
| A2 | terminal log | Production `npm run build` with CI dummy secrets | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/npm-build.log` |
| A3 | terminal log | Production `npm start` readiness | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/npm-start-production.log` |
| A4 | terminal log | Route allowlist comparison; unexpected `[]` | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/route-allowlist-check.log` |
| A5 | data file | Discovered `page.tsx`/`route.ts` inventory | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/routes-found.txt` |
| A6 | terminal log | Forbidden source grep result | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/forbidden-source-check.log` |
| A7 | terminal log | Production dependency audit | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/npm-audit-prod.log` |
| A8 | curl transcript | Production HTTP smoke: login 200, legacy 404, auth session 401 envelope, CSRF 403 envelope | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/curl-production-http-scenarios.log` |

## notes

- `route-forbidden-surface.log` includes an intentionally broad first grep over `package-lock.json`; `ppc64` and optional peer metadata such as `better-sqlite3` appear there as package metadata, not as `package.json` runtime dependencies or source usage. The PASS criterion uses `forbidden-source-check.log`, which excludes tests and checks `src`, `package.json`, and `.env.example`.
- No scenarios were marked skipped, inferred, partial, or not applicable.

## latest appendix — HEAD 752e563bcbbac2a07b295a864af3d70d76f86d72

최신 회귀 요청 범위 재검증 결과: CLEAR.

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| LA-01 | P2-B1, P2-V billing same-origin regression | Node 24 test gate | `npm run test -- "src/app/api/v1/billing/**/*.test.ts" "src/server/billing/**/*.test.ts"` | PASS: command executed the full configured suite and reported 259/259 tests, including billing same-origin and untrusted Origin/Host rejection regressions. | LA1 |
| LA-02 | P2-V production build readiness | Next.js production build | `NODE_ENV=production ... npm run build` with CI dummy secrets only | PASS: compiled successfully and emitted the allowed route list. | LA2 |
| LA-03 | P2-V high/critical dependency gate | production dependency audit | `npm audit --omit=dev` | PASS: found 0 vulnerabilities. | LA3 |
| LA-04 | integration hygiene | git whitespace diff check | `git diff --check` | PASS: no whitespace errors. | LA4 |
| LA-05 | route manifest allowlist | route file inventory and allowlist script | `find src/app ...`; Node allowlist comparison | PASS: 36 routes, unexpected `[]`. | LA5, LA6 |

### latest artifactRefs

| id | kind | description | path |
|---|---|---|---|
| LA1 | terminal log | Latest billing regression/full configured test run, 259 pass / 0 fail | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/latest-billing-regression.log` |
| LA2 | terminal log | Latest production build | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/latest-npm-build.log` |
| LA3 | terminal log | Latest production dependency audit | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/latest-npm-audit-prod.log` |
| LA4 | terminal log | Latest `git diff --check` | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/latest-git-diff-check.log` |
| LA5 | terminal log | Latest route allowlist comparison | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/latest-route-allowlist-check.log` |
| LA6 | data file | Latest discovered route inventory | `/Users/user01/Music/SEMForge-worktrees/phase-2-product/semforge/.omo/evidence/phase2-final-qa/latest-routes-found.txt` |
