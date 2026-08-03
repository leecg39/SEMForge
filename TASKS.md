# TASKS.md — SEMForge 프로젝트 작업 목표

# 프로젝트 A — 도메인 개요(Domain Overview) SEMrush 스타일 재구성

## 프로젝트 목표 (Project Goal)
> SEMrush 도메인 개요 화면(영상 분석 기준)을 SEMForge `/analytics/overview/`에 재구성한다.
> 원칙: 모의 데이터 금지 — 실데이터(TalorData·AI 가시성·GSC·링크 그래프)만 라이브 표시, 무소스 지표는 미제공/빈 상태.

## 마일스톤 (Milestones)
- M1: Phase 1 완료 — 화면 골격 재구성 (랜딩 + 리포트 헤더 + 듀얼 KPI + 섹션 배치)
- M2: Phase 2 완료 — 서버 리포트 확장 (AI 가시성·경쟁자·국가별·의도)
- M3: Phase 3 완료 — 차트·인터랙션 (기간 필터·스택차트·도넛·버블)
- M4: Phase 4 완료 — 마감 (광고/백링크/티저/내보내기/QA) + 커밋

## 완료 조건 (공통)
- `semforge`에서 lint/typecheck(빌드) 통과, 기존 기능 회귀 없음
- 각 Phase 완료 시 커밋 (커밋 메시지에 Phase 명시)
- 무소스 지표는 MetricUnavailable/EmptyState로 정직하게 표시

---

## Phase 1: 화면 골격 재구성 (Goal: SEMrush 레이아웃 뼈대 완성)
- [ ] T1.1 랜딩 화면 — `domain` 파라미터 없으면 검색 히어로(입력+국가+검색) + 최근 확인 도메인(`availableDomains`)
- [ ] T1.2 컴포넌트 분할 — `src/components/analytics/domain-overview/` (Landing, ReportHeader, KpiPanels, TrendsSection, OrganicResearchSection, AdvertisingSection, BacklinksSection, primitives)
- [ ] T1.3 리포트 헤더 — 브레드크럼 + `도메인 개요: {domain}` + 국가 탭 + 기기 토글 + 갱신일 + 내보내기
- [ ] T1.4 듀얼 KPI 패널 — AI 검색 패널(골격) + SEO 패널 배치
- [ ] T1.5 섹션 재배치 + 회귀 확인 (기존 수집/리포트 흐름 유지, lint/빌드 통과)

## Phase 2: 서버 리포트 확장 (Goal: 신규 섹션에 실데이터 공급)
- [ ] T2.1 `DomainAnalyticsReport` 타입 확장 — aiSearch, countries, competitors, positionTrend, paid
- [ ] T2.2 `lib/analytics/metrics.ts` 계산 추가 — 경쟁자 교차 집계·국가별 분포·포지션 버킷 시계열
- [ ] T2.3 `server/analytics.ts`에 `getAiVisibilityOverview()` 병합 (AI 가시성·언급·인용 소스)
- [ ] T2.4 의도별 키워드 라이브 전환 — `계산식 clone-intent-v1` provenance 배지
- [ ] T2.5 API/SSR 연결 검증 (`/api/analytics/domain-overview/`)

## Phase 3: 차트·인터랙션 (Goal: 시각화·필터 완성)
- [ ] T3.1 기간 필터 — 1/6/12/24개월/전체 + 일별/월별
- [ ] T3.2 키워드 스택 영역 차트(포지션 버킷) + SERP 포지션 도넛
- [ ] T3.3 경쟁 포지셔닝 버블 차트 (ScatterChart)
- [ ] T3.4 자연 포지션 분포 히스토그램 전환 + Follow/Nofollow 도넛
- [ ] T3.5 컬럼 헤더 툴팁 + 카드별 "자세히 보기" 링크 연결

## Phase 4: 마감 (Goal: SEMrush 충실도 + 품질 게이트)
- [ ] T4.1 광고 리서치 4카드 + 샘플 텍스트 광고 — 빈 상태 UX
- [ ] T4.2 백링크 섹션 — site-audit 링크 그래프 연동 (followShare·refDomainsByAuthority·topLinkedPages)
- [ ] T4.3 주요 주제 티저 — `UpgradeGate` 재사용
- [ ] T4.4 PDF 내보내기(print CSS) + 반응형/스켈레톤 정리
- [ ] T4.5 성장 보고서/국가별 비교 탭 최소 구현
- [ ] T4.6 최종 QA (lint/빌드/화면 확인) 및 최종 커밋

---

# 프로젝트 B — 키워드 갭(Keyword Gap) SEMrush 스타일 구현

> ⏹️ 중지됨 (사용자 요청, 2026-08-01 05:37 KST). 중지 시점 상태와 재개 가이드는 `.claude/goals/progress.md` 참고.

## 프로젝트 목표 (Project Goal)
> SEMrush 키워드 갭 화면(랜딩+리포트, 스크린샷 2장 기준)을 `/analytics/keywordgap/` 전용 라이브 페이지로 구현한다.
> 원칙: 모의 데이터 금지 — 수집된 키워드 유니버스(keyword_metrics × 최신 serp_snapshots) 기준 집합 비교만 표시, 추가 API 비용 0.

## 마일스톤 (Milestones)
- MB1: G1–G2 완료 — 갭 계산 엔진 + 서버/API 연결
- MB2: G3–G4 완료 — 랜딩 + 리포트 화면
- MB3: G5 완료 — 라우트 연결·QA·커밋

## 완료 조건 (공통)
- `semforge`에서 lint/typecheck(빌드) + `test:analytics` 통과, 기존 기능 회귀 없음
- 무소스 지표(유료/PLA 키워드 유형, CPC=0)는 비활성/미표시로 정직하게 처리
- 유니버스 출처 배너(키워드 수·최종 수집 시각) 상시 노출

## Phase G1: 갭 계산 엔진
- [x] G1.1 `src/lib/analytics/keyword-gap.ts` — buildKeywordGap 순수 함수 (scope 매칭 4종, 카테고리 7종, 겹침 집계)
- [x] G1.2 `src/lib/analytics/keyword-gap.test.ts` — 카테고리/scope/겹침 단위 테스트 + `test:analytics` 등록 (18건 통과)

## Phase G2: 서버/API 연결
- [x] G2.1 `src/server/keyword-gap.ts` — getKeywordGap (getAnalyticsDataset 재사용)
- [x] G2.2 `src/app/api/analytics/keyword-gap/route.ts` — zod 검증 GET 라우트

## Phase G3: 랜딩 화면
- [x] G3.1 `components/analytics/keyword-gap/copy.ts` + `recent.ts` (ko/en, localStorage 최근 비교)
- [x] G3.2 `Landing.tsx` — 히어로 + 다중 도메인 입력(최대 5) + 사용법 3블록 + 데이터 원칙 카드

## Phase G4: 리포트 화면 — ⏹️ 중지 (lint 1건 잔여)
- [ ] G4.1 `KeywordGapDashboard.tsx` — 코드 작성 완료, `:152` react-hooks/set-state-in-effect 에러 미해결
- [x] G4.2 겹침 섹션 — 상위 기회 카드(누락/약함/미개발 탭) + 키워드 겹침 벤 SVG
- [ ] G4.3 키워드 세부 정보 — 코드 작성 완료 (G4.1 과 같은 파일, lint 통과 후 완료 처리)

## Phase G5: 연결·마감 — ⏹️ 중지
- [x] G5.1 `app/(app)/analytics/keywordgap/page.tsx` 신설 + 캐치올 params에서 keywordgap 제거
- [x] G5.2 `docs/research/CLONE_TRACKER.md` SEO-008 갱신 (Q 표기 — QA 미수행이므로 재개 시 재검토)
- [ ] G5.3 lint/빌드/테스트 + 화면 QA(ego-browser) + 키워드 갭 파일 선별 커밋 — 미수행

---

# 프로젝트 C — Content Workspace 단순화·고도화

> 계획 문서: `semforge/docs/plans/content-workspace-simplification.md`

## 프로젝트 목표 (Project Goal)
> `/content/`를 홈·작업판·라이브러리 3개 화면으로 단순화하고, 실제 TalorData·Firecrawl·ChatMock 데이터로 기사 생성부터 저장·재개·실패 복구까지 완성한다.

## 마일스톤 (Milestones)
- MC1: C0–C1 완료 — 계약·영구 작업판·라이브러리 골격
- MC2: C2 완료 — 실제 기사 생성 세로 슬라이스
- MC3: C3–C4 완료 — 최적화·브리프·재활용·편집 검토
- MC4: C5 완료 — 호환 전환·반응형·접근성·최종 QA

## 완료 조건 (공통)
- 모의/하드코딩 결과 없이 공급자·실행 시각·실패 상태를 표시
- 워크스페이스/폴더 데이터 격리 및 감사 로그 유지
- lint, TypeScript, build, 관련 단위·통합·E2E 테스트 통과
- 1904×947과 390×844 핵심 흐름 검증

## Phase C0: 계약과 상태 모델
- [x] C0.1 board/message/run 계약과 Zod 입력·출력 정의
- [x] C0.2 상태 전이·워크스페이스 격리·중복 실행 방지 테스트
- [x] C0.3 `content_boards`, `content_messages`, `content_runs` 스키마와 제목 유니크 제약 완화 마이그레이션

## Phase C1: 홈·작업판·라이브러리
- [x] C1.1 Content 사이드바를 Home/Workspaces/Library 3항목으로 축소
- [x] C1.2 명령 입력 + 실제 최근 작업판 구현(후속 intent는 준비 안내만 표시)
- [x] C1.3 Workspaces 목록 + 대화 패널 + 결과 캔버스 + 실제 진행 상태 골격 구현
- [x] C1.4 기존 `/api/content`를 연결한 라이브러리 구현
- [x] C1.5 이전 도구 URL의 intent 리다이렉트와 `fid` 문맥 보존

## Phase C2: 기사 생성 세로 슬라이스
- [x] C2.1 TalorData 연구와 추천 설정 생성
- [x] C2.2 공용 ChatMock Responses 클라이언트 + Zod 검증 기사 생성
- [x] C2.3 실제 단계 기록·취소·실패·재시도·출처 UI
- [x] C2.4 `content_articles` 저장·Markdown 편집·새로고침 복원

## Phase C3: 후속 워크플로
- [ ] C3.1 Firecrawl URL 가져오기 + 직접 입력 최적화
- [x] C3.2 `semforge-content-v1` 규칙 기반 SEO 점수와 근거 부족 게이팅
- [ ] C3.3 Topic Finder → SEO 브리프 → 기사 생성 문맥 연결
- [ ] C3.4 기존 문서 재활용과 파생 문서 관계 저장

## Phase C4: 편집·검토
- [x] C4.1 자동 저장과 version 충돌 처리
- [ ] C4.2 SEO 검사 제안 적용/되돌리기
- [x] C4.3 draft/in_review/published 상태와 권한·감사 로그

## Phase C5: 전환·품질 게이트
- [x] C5.1 단위·통합·브라우저 E2E 테스트
- [x] C5.2 1904×947·390×844 반응형 및 접근 가능한 레이블·`aria-live` QA
- [x] C5.3 lint, TypeScript, build 및 기존 URL 회귀 확인
- [x] C5.4 준비된 Content URL의 기존 정적 템플릿 제거·서버 리다이렉트
