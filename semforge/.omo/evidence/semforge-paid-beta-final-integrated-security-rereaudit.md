# SEMForge 유료 베타 최종 통합 보안 재감사

- 최종 원격 HEAD: `95f0d9de6329db1bdd51cd78b06cd1e7c0875eb9`
- 감사한 소스 SHA: `b1a66c754ac57f64b306add5a8ade255a813f45b`
- `b1a66c7..95f0d9d` 소스 diff: 0건 (`.omo/evidence/**`만 변경)
- 감사일: 2026-08-12 KST
- 범위: 보안, 개인정보 삭제 격리, 테넌트 권한, 인증, GSC, 결제, 리포트, 스토리지 삭제, 레거시 표면, 라이선스
- 수행 방식: 최종 소스 및 추적된 실행 증거를 대상으로 한 읽기 전용 재감사

## 최종 판정

- 코드 paid-launch gate: **CLEAR**
- P0: **0건**
- P1: **0건**
- P2: **2건**
- 외부 운영 gate: **HOLD**

`CLEAR`는 코드 출시 게이트에 한정한다. 외부 승인·운영 키·실환경 복구 및 고객 검증이 완료되기 전에는 유료 운영 출시를 승인하지 않는다.

## 이전 P1 재검증 결과

- 개인정보 삭제 경계는 차단 상태를 먼저 영속화하고 exclusive advisory lock으로 진행 중인 shared 작업을 배수한 뒤, 외부 철회·S3 삭제와 로컬 삭제를 수행한다. shared callback부터 commit까지 같은 세션의 잠금을 유지하며 unlock 불확실 세션은 폐기한다: `src/server/privacy/fence.ts:103-126`, `src/server/privacy/fence.ts:144-215`, `src/server/privacy/fence.ts:299-430`.
- 워커의 handler 실행과 queue 성공·실패 finalization이 동일한 privacy execution scope 안에 있어 삭제 quiescence 이후 재기록 경합을 차단한다: `src/worker/runtime.ts:262-386`, `src/server/privacy/fence.ts:441-448`.
- scheduler와 outbox relay는 global-control RLS 및 shared advisory lock을 사용하고 active workspace만 발행·예약한다: `src/worker/scheduler.ts:64-148`, `src/worker/scheduler.ts:243-268`, `src/server/outbox/relay.ts:246-294`, `src/server/outbox/relay.ts:327-421`.
- PostgreSQL 역할은 NOLOGIN/NOBYPASSRLS로 분리되며 issuer·executor·retention 권한을 별도로 부여한다. raw table 권한은 owner 역할에만 있고 control/pipeline 테이블에도 FORCE RLS가 적용된다: `src/db/migrations/0000_core.sql:1769-1786`, `src/db/migrations/0000_core.sql:1864-1875`, `src/db/migrations/0000_core.sql:1897-1936`, `src/db/migrations/0000_core.sql:2054-2061`.
- erased workspace write trigger는 테넌트 쓰기를 fail-closed로 거부하고, 유일한 예외는 outbox terminal suppression이다: `src/db/migrations/0000_core.sql:2107-2170`.
- 비밀번호 재설정 발급과 실행 모두 사용자의 전체 workspace membership을 정렬된 shared-many fence로 보호한다: `src/server/auth/privacy-fenced-store.ts:27-43`, `src/server/auth/privacy-fenced-store.ts:113-139`, `src/server/auth/runtime.ts:21-44`.
- Toss webhook은 요청의 workspace 값을 신뢰하지 않고 order/billing-key fingerprint로 canonical workspace를 해석한 뒤 fence 안에서 처리한다. 원문 billing key는 저장하지 않는다: `src/server/billing/http.ts:464-497`, `src/server/billing/service.ts:745-752`, `src/server/billing/service.ts:933-1018`, `src/server/billing/postgres-store.ts:22-29`, `src/server/billing/postgres-store.ts:532-540`.
- GSC callback은 workspace·user·state hash·만료를 검증하고 readonly scope 및 AAD 암호화를 사용하며, 외부 교환과 저장은 workspace fence 안에서 수행한다: `src/server/gsc/service.ts:130-161`, `src/server/gsc/routes.ts:177-192`.
- 사이트·인사이트·리포트·브랜딩·PDF signed URL의 읽기 및 쓰기 delegate는 privacy fence 안에서 실행된다: `src/server/sites/routes.ts:120-278`, `src/server/insights/routes.ts:490-515`, `src/server/reports/routes.ts:63-115`, `src/server/reports/branding/routes.ts:79-111`, `src/server/reports/delivery/routes.ts:41-70`.
- S3 purge는 workspace prefix만 대상으로 version과 delete marker를 모든 페이지에서 열거하고 정확한 key+version을 영구 삭제하며 혼합 prefix 응답을 거부한다: `src/server/storage/s3.ts:359-395`, `src/server/storage/s3.ts:542-591`, `src/server/storage/s3.ts:655-666`.
- 허용 route/legacy 표면 검사는 통과했고 Semrush·GitNexus·SQLite production surface는 발견되지 않았다. 라이선스 검사는 금지·미상 라이선스를 fail-closed로 거부하며 Noto Sans KR OFL 전문과 고지를 포함한다: `scripts/license/generate-third-party-notices.mjs:8-21`, `scripts/license/generate-third-party-notices.mjs:78-90`, `THIRD_PARTY_NOTICES.md:41`, `THIRD_PARTY_NOTICES.md:341`.

## P2 잔여 항목

1. **GSC 내부 사전 조회의 fence 일관성 강화** — 일부 billing authorization 조회와 OAuth state 사전 해석이 `runWorkspaceOperation`보다 먼저 실행된다: `src/server/gsc/routes.ts:147-186`, `src/server/gsc/routes.ts:210-274`. 공급자 호출·GSC 서비스 변경·저장은 fence 내부라 현재 P0/P1 우회는 확인되지 않았다. 향후 사전 조회도 fence 내부로 이동하고 blocking/erased 상태에서 billing/state resolver delegate 호출이 0임을 회귀 테스트로 고정하는 것을 권고한다.
2. **추적 증거 provenance 정리** — `.omo/evidence/final-20260812/summary.md:3`과 `.omo/evidence/phase5-ci/latest/summary.md:5`는 이전 소스 SHA `e50c5e6...`를 표기하고, 전자는 존재하지 않는 `npm-verify-after-tenant-read.log`를 참조한다. 최종 감사 범위의 소스 diff는 0이고 fresh release 로그 시각이 최종 소스 수정 이후라 보안 차단 사유는 아니지만, 최종 원격 HEAD/SHA 및 실제 로그명으로 증거 인덱스를 갱신해야 한다.

## 실행 증거

- Fresh release gate: `.omo/evidence/phase5-ci/latest/summary.json`의 `status=passed`, Node `v24.14.0`, 모든 단계 exit 0.
- Node 검증: 총 689개, 통과 688개, 실패 0개, 환경 게이트 skip 1개.
- PostgreSQL 16: RLS·역할·privacy procedure·shared-user erasure·raw DML 거부·issuer/executor/retention·write fence 포함 11/11 통과.
- 개인정보 barrier 독립 재실행: 2/2 통과.
- MinIO versioning/prefix purge: 17/17 통과. 1,007개 버전의 다중 페이지, 중간 crash 복구, foreign prefix 보존, 복원 후 재삭제를 검증했다.
- `npm audit` 전체 및 production: 취약점 0건.
- route manifest: pages 14, routes 31 통과.
- forbidden-surface: 306개 파일 검사 통과.
- license check와 현재/이력 secret scan 통과. 추적된 환경 파일은 `.env.example`뿐이다.

## 외부 운영 gate — HOLD

다음 항목은 코드 게이트와 별개이며 실제 증거가 확보될 때까지 유료 운영 출시를 보류한다.

- 승인된 실제 legal manifest와 운영자·개인정보처리방침·약관 정보
- Toss 운영 계약·키 및 실결제/조회 조정 검증
- Google OAuth 운영 검증과 운영 자격 증명
- NAVER API 키, Resend 발송 도메인 검증
- 관리형 PostgreSQL PITR 및 객체 저장소 복원·롤백 리허설
- 디자인 파트너 3곳, 9개 사이트, 첫 주간 리포트 실수신

## 결론

최종 원격 HEAD `95f0d9de6329db1bdd51cd78b06cd1e7c0875eb9`의 코드 paid-launch gate는 **CLEAR**다. P0/P1은 0건이고 P2 2건은 후속 보강 항목이다. 외부 운영 gate는 **HOLD**이며 위 항목을 완료하기 전 실제 유료 초대를 발송해서는 안 된다.
