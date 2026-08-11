# SEMForge Paid Beta — Canonical Task Contract

## 실행 규칙

- 통합 브랜치: `codex/paid-beta-core`; 모든 Phase 브랜치는 이 브랜치의 최신 완료 커밋에서 만든다.
- 동시 작업은 최대 3개이며 같은 파일을 소유하는 태스크는 병렬 실행하지 않는다.
- Phase 1 이상은 `TDD_MODE:RED_FIRST`로 테스트 실패를 먼저 확인하고 구현·리팩터링·검증·로컬 커밋까지 완료한다.
- specialist는 자기 Phase 브랜치만 커밋하며 통합 브랜치 병합과 원격 push는 orchestrator만 수행한다.
- 사용자 데이터 마이그레이션은 없다. SQLite 데이터·마이그레이션·seed는 제거한다.
- 외부 API는 실제 adapter와 sandbox까지 구현한다. Toss 계약/운영 키와 Google OAuth 운영 승인은 코드 완료와 별도의 Release Gate다.

## Phase 0 — 보존과 계약

### P0-T0.1 — 현재 상태 보존 및 기준 브랜치 준비

- 담당: orchestrator
- Depends On: 없음
- 완료: `codex/archive-pre-paid-beta-20260811`에 dirty 변경 보존, `codex/paid-beta-core` 생성, `origin/main` 병합, 충돌 0건.
- 검증: `git status`, `git log`, `git diff --check`.

### P0-T0.2 — 실행 계약 고정

- 담당: docs
- Depends On: P0-T0.1
- 파일 소유권: `docs/planning/06-tasks.md`
- 완료: 모든 구현·검증 태스크의 의존성, 파일 경계, 완료 조건이 결정 완료 상태로 기록됨.

## Phase 1 — PostgreSQL 기반과 물리적 축소

Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-1-foundation`
Branch: `codex/phase-1-foundation`

### P1-D1-T1 — PostgreSQL 16 핵심 스키마와 암호화 기반

- 담당: database
- Depends On: P0-T0.2
- 파일 소유권: `drizzle.config.ts`, `src/db/**`, `src/lib/crypto*`, `src/lib/env*`, `.env.example`, `package*.json`, `AGENTS.md`
- 구현: PG 전용 Drizzle client/migrator; identity/tenant/site/integration/measurement/job/outbox/report/billing 테이블; 필수 `workspace_id`; 복합 FK/unique; RLS와 web/worker role SQL; versioned AES-GCM key ring; 필수 secret startup validation; Node 24와 SQLite 의존성 제거.
- 테스트: PG migration 적용/재적용, RLS 교차 테넌트 차단, 사이트 3개·키워드/AIO 각 20개 동시성 제한, 암호화 round-trip/변조/이전 키/비밀값 누락.
- 완료: SQLite 참조 0건, production audit high/critical 0건, DB·crypto 테스트 통과.

### P1-R1-T1 — 레거시 페이지·API·서비스·자산 완전 삭제

- 담당: backend
- Depends On: P1-D1-T1
- 파일 소유권: `src/app/**` 삭제 영역, 삭제 기능의 `src/components/**`, `src/server/**`, `src/data/**`, `src/store/**`, `src/hooks/**`, `public/**`, 레거시 scripts/docs/tests
- 보호 대상: 새 PG/crypto/env, `src/server/talordata/client.ts`, NAVER 순수 HTTP client, GSC OAuth HTTP helper, 공용 스타일 중 실제 코어 사용분.
- 구현: 허용 페이지/API 외 라우트 404; Semrush/GitNexus/clone 명칭·이미지·리디렉션·범용 CRUD 제거; 금지 경로 검사 스크립트 작성.
- 테스트: 소스 route allowlist 테스트와 금지 키워드/의존성 테스트를 먼저 실패시킨 후 삭제.
- 완료: 허용되지 않은 `page.tsx`/`route.ts` 0개, 금지 기능 코드와 SQLite 0건.

### P1-F1-T1 — 독립 브랜드와 최소 앱 셸

- 담당: frontend
- Depends On: P1-R1-T1
- 파일 소유권: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/components/core-shell/**`, 브랜드 에셋
- 구현: SEMForge 독립 랜딩·기본 레이아웃·오류/빈/로딩 상태; Semrush 시각 언어 제거; 한국어 기본 UI.
- 테스트: 렌더 테스트, 360/768/1440px 시각 검증, 키보드 탐색과 대비 확인.
- 완료: 허용되지 않은 링크 없음, 콘솔 오류 없음, 스크린샷 증거 기록.

### P1-V — Foundation Gate

- 담당: test
- Depends On: P1-D1-T1, P1-R1-T1, P1-F1-T1
- 검증: install, lint, typecheck, unit, PG integration, build, route manifest, audit.
- 완료: P0/P1 결함 0건 후 통합 브랜치에 병합.

## Phase 2 — 인증·사이트·GSC·결제

Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-2-product`
Branch: `codex/phase-2-product`

### P2-A1-T1 — 초대 전용 인증과 세션

- 담당: backend
- Depends On: P1-V
- 파일 소유권: `src/server/auth/**`, `src/lib/session.ts`, `src/app/api/v1/auth/**`, `scripts/invite.ts`
- 구현: 7일·1회용 hashed invite, 사용자/워크스페이스/멤버십 원자 생성, 로그인/로그아웃, 비밀번호 재설정, opaque DB session, Secure HttpOnly SameSite=Lax cookie, CSRF/Origin 검증, 공개 signup 제거.
- 테스트: invite 만료/재사용/동시 수락, session rotation/revocation, password reset, CSRF, 거래 롤백.

### P2-S1-T1 — 사이트와 추적 항목 API

- 담당: backend
- Depends On: P1-V, P2-A1-T1
- 파일 소유권: `src/server/sites/**`, `src/server/tracking/**`, `src/app/api/v1/sites/**`, `src/app/api/v1/tracking/**`, `src/lib/api-v1/**`
- 구현: `{data,error,requestId}` envelope; domain 정규화; 사이트 3개, rank keyword 20개, AIO prompt 20개; 한국/ko/desktop/top-100 고정; active item 기준 제한; 다른 workspace ID 거부.
- 테스트: 한도 동시 요청, IDOR, invalid domain, 중복 query, cursor/error envelope.

### P2-G1-T1 — 테넌트 기반 GSC 다중 연결

- 담당: backend
- Depends On: P2-A1-T1, P2-S1-T1
- 파일 소유권: `src/server/gsc/**`, `src/app/api/v1/integrations/gsc/**`
- 구현: `webmasters.readonly`; 사용자 입력 label; hashed OAuth state에 user/workspace/returnPath 바인딩; 10분·1회용; 속성 열람/사이트 바인딩; 연결별 refresh/disconnect.
- 테스트: state 변조/재사용/만료, 다중 연결 독립성, token refresh, cross-tenant property binding.

### P2-B1-T1 — Toss 자동결제 상태 머신과 ledger

- 담당: backend
- Depends On: P2-A1-T1
- 파일 소유권: `src/server/billing/**`, `src/app/api/v1/billing/**`, `src/app/api/v1/webhooks/toss/**`
- 구현: 49,000원 VAT 포함 첫 결제; 확정 SubscriptionStatus; 기간별 안정 orderId/idempotency; encrypted billing key; webhook dedupe; Query API reconciliation; +1/+3/+5일 재시도와 7일 grace; 기간 말 취소.
- 테스트: callback/replay/역순, timeout, 승인 후 DB commit 실패, 중복 청구 방지, past_due 접근 제한, 재결제/취소.

### P2-V — Product API Gate

- 담당: test/security
- Depends On: P2-S1-T1, P2-G1-T1, P2-B1-T1
- 완료: 모든 API의 인증·CSRF·IDOR·교차 테넌트 계약 테스트와 Toss sandbox 테스트 통과.

## Phase 3 — 수집 워커와 불변 리포트

Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-3-pipeline`
Branch: `codex/phase-3-pipeline`

### P3-W1-T1 — Lease 기반 작업 큐와 transactional outbox

- 담당: backend
- Depends On: P2-V
- 파일 소유권: `src/worker/**`, `src/server/jobs/**`, `src/server/outbox/**`
- 구현: `FOR UPDATE SKIP LOCKED`, lease/heartbeat/expiry, attempts/DLQ, graceful shutdown, workspace audit, provider-call usage reservation, stable idempotency.
- 테스트: 다중 워커 경쟁과 모든 단계 crash/recovery에서 중복 0건.

### P3-C1-T1 — Google rank와 AIO 수집

- 담당: backend
- Depends On: P2-S1-T1, P3-W1-T1
- 파일 소유권: `src/server/providers/talordata/**`, `src/server/collectors/google/**`
- 구현: 기존 순수 TalorData HTTP client 재사용; normalized query+locale+device+window 단위 중복 제거; 등록 domain/subdomain의 최고 organic rank; AIO present/absent/unknown 및 citation 저장.
- 테스트: top-100, >100, overlap dedupe, citation 없음=unknown, provider timeout/rate limit.

### P3-C2-T1 — NAVER와 GSC 주간 수집

- 담당: backend
- Depends On: P2-G1-T1, P3-W1-T1
- 파일 소유권: `src/server/providers/naver/**`, `src/server/collectors/naver/**`, `src/server/collectors/gsc/**`
- 구현: Search Ads 월간량, DataLab 추이/인구통계, Search API 블로그 결과 규모; GSC clicks/impressions/CTR/position/top query/page; provenance와 수집시각.
- 테스트: 실제 응답 fixture contract, 예산/rate limit, 부분 실패, GSC PT 날짜 경계.

### P3-R1-T1 — 주간 불변 리포트 스냅샷

- 담당: backend
- Depends On: P3-C1-T1, P3-C2-T1
- 파일 소유권: `src/server/reports/**`, `src/app/api/v1/reports/**`
- 구현: 일요일 18:00 KST 수집, 월요일 07:00 마감, 08:00 snapshot, 이전 목요일 PT까지 7일 대 직전 7일 비교; partial section 표기; 발송 후 불변; logo/accent freeze.
- 테스트: 시간대/DST, missing provider, 재생성 idempotency, 과거 브랜드 설정 불변.

### P3-V — Pipeline Gate

- 담당: test
- Depends On: P3-R1-T1
- 완료: 최대 9사이트 부하, crash injection, 사용량/비용 상한, 중복 호출·리포트 0건.

## Phase 4 — 제품 화면·PDF·이메일·배포

Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-4-delivery`
Branch: `codex/phase-4-delivery`

### P4-F1-T1 — 허용 페이지 전체 구현

- 담당: frontend
- Depends On: P2-V, P3-V
- 파일 소유권: `src/app/login/**`, `src/app/invite/**`, `src/app/forgot-password/**`, `src/app/reset-password/**`, `src/app/legal/**`, `src/app/app/**`, `src/components/product/**`
- 구현: `/app`, sites/detail, reports/detail, billing, settings; loading/error/empty/partial; 접근성; API v1 연결; 허용 경로 외 링크 없음.
- 테스트: component/E2E 및 360/768/1440px 스크린샷, 키보드/콘솔 오류 검증.

### P4-R1-T1 — 한글 PDF·이메일·객체 저장소

- 담당: backend
- Depends On: P3-R1-T1
- 파일 소유권: `src/server/delivery/**`, `src/server/storage/**`, `src/templates/report/**`
- 구현: Chromium+Noto Sans KR 고정 템플릿; 로고/accent; private S3-compatible object와 단기 signed URL; Resend delivery outbox.
- 테스트: 한글/장문/빈·부분 데이터/깨진·대형 로고, 이메일 중복 0건, signed URL 만료.

### P4-O1-T1 — Node 24 Docker와 운영 도구

- 담당: backend/docs
- Depends On: P3-W1-T1
- 파일 소유권: `Dockerfile*`, `docker-compose*.yml`, `deploy/**`, `scripts/ops/**`, 운영 문서
- 구현: Next standalone web/worker 이미지, nginx TLS/rate-limit 예시, migration release job, live/ready health, JSON logging/redaction, backup/restore/rollback runbook.
- 테스트: 이미지 빌드, graceful shutdown, readiness, migration-first startup, secret 누락 실패.

### P4-V — Delivery Gate

- 담당: test
- Depends On: P4-F1-T1, P4-R1-T1, P4-O1-T1
- 완료: web/PDF/email이 동일 snapshot을 사용하고 build route manifest가 allowlist와 일치.

## Phase 5 — 최종 품질과 출시 게이트

Worktree: `/Users/user01/Music/SEMForge-worktrees/phase-5-release`
Branch: `codex/phase-5-release`

### P5-Q1-T1 — CI와 전체 회귀·E2E

- 담당: test
- Depends On: P4-V
- 파일 소유권: `.github/workflows/**`, `tests/**`, 테스트 설정
- 구현: Node24+PG16+Chromium에서 lint/typecheck/unit/integration/E2E/build/audit; route/forbidden-code manifest; 3 partner/9 site 시나리오.

### P5-S1-T1 — 보안 감사 및 수정

- 담당: security
- Depends On: P5-Q1-T1
- 검증: OWASP auth/session/CSRF/SSRF/IDOR, RLS, OAuth, webhook, secret/log, dependency/license scan.
- 완료: P0/P1 보안 결함과 high/critical 취약점 0건.

### P5-O1-T1 — 복구·청구 조정 리허설

- 담당: backend/test
- Depends On: P5-Q1-T1
- 검증: PG PITR, object version restore, 이전 이미지 rollback, forward-compatible migration, Toss reconciliation과 수동 법정 환불 조정.
- 완료: 실제 절차와 증거가 runbook에 기록됨.

### P5-V — Release Gate

- 담당: orchestrator
- Depends On: P5-S1-T1, P5-O1-T1
- 코드 완료 기준: 전체 품질 게이트 통과, 테넌트 누출·중복 청구·중복 발송 0건.
- 운영 출시 기준: Toss 자동결제 계약/운영 키, Google OAuth 운영 승인, NAVER 키, Resend 발신 도메인, 관리형 PG PITR와 객체 저장소 준비가 모두 확인됨. 하나라도 미완료면 staging만 유지하고 유료 초대 발송을 차단한다.
