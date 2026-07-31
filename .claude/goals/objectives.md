# 포지션 추적 화면 재구축 — 목표 정의

> 원본: 사용자 제공 화면 녹화(ko.semrush.com 포지션 추적, 2026-08-01) 분석 결과.
> 원칙: 모든 지표는 실측(serp_snapshots·tracked_keywords·visibility_history) 기반.
> 계산식 값(예상 트래픽·가시성 기여)은 provenance 배지를 반드시 표기한다.

## 프로젝트 목표 (Project Goal)
포지션 추적을 실제 Semrush 구성으로 재편: 랜딩은 프로젝트 목록 테이블,
상세는 KPI → Summary → 순위 분포 → 키워드 하이라이트 → 태그 → 경쟁 →
SERP 피처 → 페이지 순의 단일 스크롤 '현황' 화면.

## 마일스톤 (Milestones)
- M1 = P1: 랜딩 목록 테이블 + KPI 3카드 + 키워드 버킷 카드 + 순위 분포 일별 차트
- M2 = P2: 상위/효율/비효율 3열 + 페이지 섹션 + SERP 구성 요소 + Summary 카드
- M3 = P3: 키워드 태그 + 도메인 관점 전환 + 경쟁 버블 차트

## Phase 목표
### P1 (Goal: 목록→상세 첫인상 일치)
- [ ] T1.1 `server/position-tracking/overview.ts`: getCampaignListSummary / getCampaignOverview / getRankDistributionHistory
- [ ] T1.2 API: `GET /api/position-tracking/summary/`, `[campaignId]/overview/`, `[campaignId]/rank-history/`
- [ ] T1.3 `PositionTrackingProjects.tsx` 목록 테이블 + page.tsx 분기
- [ ] T1.4 KPI 3카드(`OverviewKpiCards`) + 키워드 버킷 카드 + RankDistributionPanel 일별 스택 차트

### P2 (Goal: 현황 탭 정보 밀도 완성)
- [ ] T2.1 서버: getKeywordHighlights / getPagesBreakdown / getSerpFeatureBreakdown + API 3종
- [ ] T2.2 UI: KeywordHighlightsRow / PagesPanel / SerpFeaturesPanel / CampaignSummaryCard

### P3 (Goal: 운영 도구 완성)
- [ ] T3.1 tracked_keywords.tags 컬럼 + 마이그레이션 + bulk 태그 API + TagsPanel/TagManageModal
- [ ] T3.2 도메인 관점 전환 칩(분포·테이블) + CompetitiveMapCard 버블 차트

## 완료 조건 (Quality Gate)
- tsc --noEmit 통과, eslint 통과
- 기존 테스트 회귀 없음 (insights.test.ts / schedule.test.ts / collect.test.ts)
- Phase 단위 커밋 (P1/P2/P3 각 1커밋)
