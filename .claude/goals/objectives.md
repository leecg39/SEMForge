# 목표 정의

## 프로젝트 목표 (Project Goal)

> `SEMRUSH_UI_UX_PAGE_INVENTORY.md` 에 나열된 Semrush UI/UX를 `semrush-clone` 이 **누락·오류 없이 완벽하게 구현**한 상태.

"완벽"의 조작적 정의 — 아래 4개 완료 조건을 모두 만족.

| # | 완료 조건 | 측정 방법 |
|---|---|---|
| C1 | 인벤토리 템플릿 계열 전부에 라우트와 데이터가 연결됨 | 템플릿 × 라우트 매핑표 |
| C2 | 전 라우트 HTTP 200, 런타임 오류 0, 깨진 링크·자산 0 | `scripts/audit-site.mjs` + 대표 페이지 CDP 스윕 |
| C3 | 모든 analytics/CRUD 엔드포인트가 실제 데이터를 반환 (500/빈응답 없음) | `verify-crud.mjs` + analytics API 직접 호출 |
| C4 | 인벤토리의 핵심 사용자 흐름(공개→인증→앱 분석)이 끊기지 않음 | 브라우저 E2E 스윕 |

## 마일스톤

| ID | 마일스톤 | 완료 조건 |
|---|---|---|
| M1 | 건전성 확보 | C2 + C3 달성 (오류·500 0) |
| M2 | 커버리지 완결 | C1 달성 (누락 라우트·데이터 0) |
| M3 | 흐름 완결 | C4 달성 |

## Phase 목표

- **Phase 0** — 진단: 코드 건전성과 누락 라우트·데이터를 실측으로 확정 (추측 배제)
- **Phase 1** — 오류 해소: analytics 500 및 실행 오류를 모두 0으로
- **Phase 2** — 커버리지: 누락 라우트·템플릿 연결·시드 데이터 보강
- **Phase 3** — 흐름 검증: 핵심 사용자 흐름 E2E + 최종 게이트

## 범위 밖 (Non-goals)

- Semrush의 실제 SEO/트래픽 데이터 재현 (외부 수집 인프라 의존)
- 인벤토리에 없는 신규 기능
- 상표·로고·원문 마케팅 카피 복제

## 현재 진단 요약 (2026-07-28 17:35 실측)

| 상태 | 내용 |
|---|---|
| 템플릿 | 9개 전부 존재 (ContentDetail/List/Corp/Detail/Hub/Pricing/Solution/Tool/Auth) |
| 라우트 | 공개 15개 전부 + 앱 15개 전부 존재, page.tsx 107개 |
| analytics 코드 | 이미 커밋됨 (`6029dac`), 도메인 대시보드 + domain-overview API |
| **미적용** | DB에 analytics 원천 테이블 4개 미적용 (`keyword_metrics` 등) → API 500 |
| 자동개선 루프 | 다른 에이전트가 50/100 으로 진행 중 (guard pending) |
| 작업 디렉터리 | `.Codex`/`.omo`/`autoresearch` 진행 파일만 미커밋 |
