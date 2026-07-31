# 진행 상황 — 포지션 추적 재구축

> 참고: progress.md 는 병행 작업(도메인 개요 재구성)이 사용 중이라
> 이 작업의 진행 기록은 본 파일로 분리한다. 목표 정의는 objectives.md 참조.

## 전체 진행률: 70% ██████████████░░░░░░

## 마일스톤 현황
| 마일스톤 | 상태 | 진행률 |
|----------|------|--------|
| M1: 랜딩 목록 + KPI/분포 | ✅ 완료 (7445f73) | 100% |
| M2: 하이라이트/페이지/피처/Summary | ✅ 완료 | 100% |
| M3: 태그/관점 전환/버블 | 🔄 진행중 | 0% |

## M1 완료 내역
- [x] overview.ts: getCampaignListSummary / getCampaignOverview / getRankDistributionHistory
- [x] API: [campaignId]/overview/, [campaignId]/rank-history/
- [x] PositionTrackingProjects 목록 테이블 + page.tsx 분기
- [x] OverviewKpiCards + RankDistributionPanel 일별 스택 차트
- 게이트: tsc ✅ eslint ✅ 서버 테스트 17/17 ✅ (Node 25 — better-sqlite3 ABI=141)

## M2 완료 내역
- [x] highlights.ts: getKeywordHighlights / getPagesBreakdown + API 2종
- [x] KeywordHighlightsRow(상위/효율/비효율 3열, CTR 곡선 배지)
- [x] PagesPanel(상위·상승·하락 탭, URL 집계)
- [x] SerpFeaturesPanel(피처별 자사 순위권 겹침 차트)
- [x] CampaignSummaryCard(규칙 기반 실측 요약)
- [x] overview.test.ts 통합 테스트 5건 + test:position 스크립트
- 게이트: tsc ✅ eslint ✅ overview.test 5/5 ✅

## 현재 작업
🔄 M3-T3.1: tracked_keywords.tags 스키마 + 태그 API/패널/모달

## 블로커
- 병행 에이전트(도메인 개요)가 같은 워킹트리에서 schema/index.ts,
  _journal.json 을 수정 중 → 태그 마이그레이션 생성 시 drizzle-kit 이
  그들의 스키마 변경을 함께 감지할 위험. 마이그레이션 생성 전 diff 로
  포지션 추적 변경만 포함되는지 확인할 것.
