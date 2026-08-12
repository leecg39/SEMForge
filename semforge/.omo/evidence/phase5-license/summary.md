# Phase 5 License Notice Fix Evidence

Branch: `codex/phase-5-license`
Base: `origin/codex/paid-beta-core@3702adec17136b4f98417496d85fa7b6c8740f99`
Date: 2026-08-12 KST

## Scope

- Added proprietary/private product license notice without declaring SEMForge as MIT or another open-source license.
- Added generated third-party production dependency inventory and notice text.
- Added fail-closed license policy for missing, unknown, GPL, AGPL, SSPL, PolyForm, and noncommercial licenses.
- Added Docker runtime legal notice copy into `/app/legal`.
- Added deployment contract coverage for the license artifacts.

## Commands and binary outcomes

| Scenario | Invocation | Observable | Artifact |
| --- | --- | --- | --- |
| RED contract before implementation | `npm run test:ops -- --run scripts/ops/deployment.contract.test.ts` | failed on missing `LICENSE` | `.omo/evidence/phase5-license/red-deployment-contract.log` |
| license generator freshness | `npm run license:check` | exit 0 | `.omo/evidence/phase5-license/license-check.log` |
| license CLI behavior | `npx tsx --test scripts/license/license-notices.test.ts` | 2/2 pass | `.omo/evidence/phase5-license/green-license-cli-direct.log` |
| deployment contract | `npm run test:ops -- --run scripts/ops/deployment.contract.test.ts` | 27/27 pass | `.omo/evidence/phase5-license/final-license-local-gate.log` |
| production build | `npm run build` | 33/33 routes built | `.omo/evidence/phase5-license/local-build.log` |
| dependency audit | `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` | both found 0 vulnerabilities | `.omo/evidence/phase5-license/audit-full.log`, `.omo/evidence/phase5-license/audit-production.log` |
| Docker runtime legal files | `docker build --target runtime-base -t semforge:phase5-license-runtime-base .` then `docker run --rm --entrypoint sh semforge:phase5-license-runtime-base -lc 'ls -l /app/legal; grep ...'` | `/app/legal/LICENSE`, `/app/legal/NOTICE`, `/app/legal/THIRD_PARTY_NOTICES.md` readable; OFL text present | `.omo/evidence/phase5-license/docker-build-runtime-base.log`, `.omo/evidence/phase5-license/docker-legal-read.log` |
| Node 24 Docker install/build path | `docker build --target web -t semforge:phase5-license-web .` | Node 24 `npm ci` completed with 0 vulnerabilities and `/app/legal` COPY layer completed; Next build terminated with exit 137 due Docker memory limit | `.omo/evidence/phase5-license/docker-build-web.log` |
| broad regression check | `npm run verify` | lint and typecheck passed; tests 484/485 pass, single known-base failure in `src/server/auth/invite-billing-provisioning.test.ts` fixed by a separate agent per orchestration instruction | `.omo/evidence/phase5-license/local-verify.log` |

## Runtime legal artifact proof

`docker-legal-read.log` contains:

- `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` under `/app/legal`
- files owned by `semforge:semforge`
- `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007`
- `Proprietary and confidential.`
- `SEMForge Notice`

## Known non-scope failure

The single `npm run verify` failure is the pre-existing time-sensitive fixture in `src/server/auth/invite-billing-provisioning.test.ts`: a fixed `2026-08-12T03:00:00.000Z` expiry violates `invites_expiry_window_ck` after the current clock moved past the fixture window. Orchestration assigned that fix to another agent; this branch intentionally does not modify that file.
