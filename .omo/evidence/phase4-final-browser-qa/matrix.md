# Phase 4 final browser QA matrix

- 기준: `codex/phase-4-delivery@94721a4` no-rebase 병합 + PDF UI `2bce832`
- 브라우저: ego-browser 실제 Chromium
- 서버: Node 24.19.0 production build/standalone, `http://127.0.0.1:3474`
- 외부 연동: Toss, Google, signed PDF object URL은 request interception 또는 browser fixture만 사용했다. 실제 결제·OAuth·object storage 호출은 0건이다.

## 허용 화면

| 화면 | 360 | 768 | 1440 | console/runtime | overflow |
|---|---:|---:|---:|---:|---:|
| `/` | PASS | PASS | PASS | 0 | 0 |
| `/login/` | PASS | PASS | PASS | 0 | 0 |
| `/forgot-password/` | PASS | PASS | PASS | 0 | 0 |
| `/invite/:token/` | PASS | PASS | PASS | 0 | 0 |
| `/reset-password/:token/` | PASS | PASS | PASS | 0 | 0 |
| `/legal/privacy/` | PASS | PASS | PASS | 0 | 0 |
| `/legal/terms/` | PASS | PASS | PASS | 0 | 0 |
| `/app/` | PASS | PASS | PASS | 0 | 0 |
| `/app/sites/` | PASS | PASS | PASS | 0 | 0 |
| `/app/sites/:siteId/` | PASS | PASS | PASS | 0 | 0 |
| `/app/reports/` | PASS | PASS | PASS | 0 | 0 |
| `/app/reports/:reportId/` | PASS | PASS | PASS | 0 | 0 |
| `/app/billing/` | PASS | PASS | PASS | 0 | 0 |
| `/app/settings/` | PASS | PASS | PASS | 0 | 0 |

## 동작·상태

| 영역 | 결과 | 근거 |
|---|---|---|
| login/forgot/invite/reset | PASS | same-origin fixture request body, pending, generic errors, redirects 확인 |
| sites/tracking | PASS | 생성·toggle과 Idempotency-Key, tenant 식별자 비노출 확인 |
| branding/GSC | PASS | PATCH, property 조회·binding, Google navigation interception 확인 |
| billing/Toss | PASS | official SDK namespace mock, success/fail callback, stable idempotency replay, 변조 거부 확인 |
| report/PDF | PASS | endpoint GET, loading/404/past_due, 새 target, 44px, signed URL 비보존 확인 |
| loading/empty/partial/error | PASS | 각 상태 UI, retry/requestId, partial honesty 확인 |
| past_due/read-only | PASS | mutation disable 및 현재 기간 report/PDF 차단 확인 |
| tenant override | PASS | UI 입력 없음, mutation body 누출 0, client guard test PASS |
| forbidden/non-v1 | PASS | `/app/analytics`, `/app/keywords`, `/dashboard`, `/api/sites`, `/api/reports`, `/api/v0/sites` 모두 404 |
| keyboard/focus | PASS | skip link 및 PDF button focus-visible 3px 확인 |

## 비차단 주의

- 핵심 버튼은 44px 이상이다. 일부 공용 텍스트 링크와 settings 색상 swatch의 시각 영역은 44px 미만이라 후속 접근성 다듬기 후보이다.
- standalone을 수동 실행할 때 `.next/static`을 서버 시작 전에 standalone 디렉터리로 복사해야 한다. 배포 Dockerfile은 이 순서를 이미 보장한다.
