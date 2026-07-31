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

---

# 목표 2 — AI 가시성 카테고리 구현 (2026-07-31 설정)

## 목표

> Semrush AI 가시성(참조 영상 기준)의 구조를 SEMForge에 이식하되, **실제로 측정 가능한 것만 측정하고
> 나머지는 정직하게 `unavailable` 로 표시**하는 상태.

## 확정된 제약 (실측)

| 항목 | 사실 |
|---|---|
| 현재 수집 가능 | Google AI Overview 인용 여부 (TalorData `parseAiOverview`) |
| 현재 저장 범위 | `ai_visibility_snapshots` 의 aioPresent / cited / citedDomains 뿐. 답변 본문 없음 |
| LLM 자격증명 | **없음** — `.env.local` 9개 변수에 OpenAI·Anthropic·Gemini·Perplexity 키 0개 |
| 따라서 | ChatGPT·Gemini 언급률, 감정·내러티브 분석은 **착수 불가** |

## Phase 목표

| Phase | 내용 | 신규 외부 API | 상태 |
|---|---|---|---|
| Phase 0 | AI 크롤러 접근성 진단 (robots.txt AI 봇 차단 + llms.txt 품질) | 0개 | 진행 중 |
| Phase 1 | 프롬프트 데이터 모델 (`ai_visibility_prompts` / `_answers`) | 0개 | 진행 중 |
| Phase 2 | 가시성 개요 화면 (AIO 만 live, 타 플랫폼 `unavailable` 배지) | 0개 | 대기 |
| Phase 3 | LLM 플랫폼 연동 (ChatGPT·Gemini) | **키 필요** | **차단 — 자격증명 게이트** |
| Phase 4+ | 경쟁자 리서치 / 인식 / 내러티브 / 프롬프트 리서치 | Phase 3 의존 | 차단 |

## 완료 조건

| # | 조건 | 측정 |
|---|---|---|
| A1 | robots.txt 의 AI 봇 차단 여부를 봇별로 판정 (Allow 우선·와일드카드·$ 포함) | 단위 테스트 |
| A2 | llms.txt 파싱 + 0~100 품질 점수 | 단위 테스트 |
| A3 | 프롬프트·답변 스키마 마이그레이션 적용, 기존 AIO 경로 무손상 | `db:migrate` + 기존 테스트 통과 |
| A4 | 가시성 개요가 AIO 는 실데이터, 미연동 플랫폼은 `unavailable` 로 표시 | 화면 + `ProviderResult` 배지 |
| A5 | 전 구간 `npm run verify` 통과 | 게이트 exit 0 |

## 범위 밖

- 가짜 LLM 언급률·감정 점수 생성 (데이터 원칙 위반)
- Semrush 독자 지표(AI 검색량·주제 난이도)의 수치 재현
- 7.9만 프롬프트 규모 수집 (개인 프로젝트 비용 범위 밖)

## 작업 분담

| 작업 | 담당 | 소유 파일 |
|---|---|---|
| AIV-T1 크롤러 접근성 모듈 | Codex 패널 (term_c384550a) | `server/ai-visibility/crawler-access.ts(.test)` |
| AIV-T2 llms.txt 모듈 | Codex 패널 (term_8ee26b1a) | `server/ai-visibility/llms-txt.ts(.test)` |
| AIV-T3 스키마·마이그레이션 | 오케스트레이터 | `db/schema/ai-visibility.ts`, `db/migrations/**` (직렬 전용) |
| AIV-T4 조립·API·화면 | 오케스트레이터 | T1·T2 완료 후 |

---

## 현재 진단 요약 (2026-07-28 17:35 실측)

| 상태 | 내용 |
|---|---|
| 템플릿 | 9개 전부 존재 (ContentDetail/List/Corp/Detail/Hub/Pricing/Solution/Tool/Auth) |
| 라우트 | 공개 15개 전부 + 앱 15개 전부 존재, page.tsx 107개 |
| analytics 코드 | 이미 커밋됨 (`6029dac`), 도메인 대시보드 + domain-overview API |
| **미적용** | DB에 analytics 원천 테이블 4개 미적용 (`keyword_metrics` 등) → API 500 |
| 자동개선 루프 | 다른 에이전트가 50/100 으로 진행 중 (guard pending) |
| 작업 디렉터리 | `.Codex`/`.omo`/`autoresearch` 진행 파일만 미커밋 |
