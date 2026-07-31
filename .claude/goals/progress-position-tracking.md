# 진행 상황 — 포지션 추적 재구축

> 참고: progress.md 는 병행 작업(도메인 개요 재구성)이 사용 중이라
> 이 작업의 진행 기록은 본 파일로 분리한다. 목표 정의는 objectives.md 참조.

## 전체 진행률: 100% ████████████████████

## 마일스톤 현황
| 마일스톤 | 상태 | 진행률 |
|----------|------|--------|
| M1: 랜딩 목록 + KPI/분포 | ✅ 완료 (7445f73) | 100% |
| M2: 하이라이트/페이지/피처/Summary | ✅ 완료 (c1f03bb) | 100% |
| M3: 태그/관점 전환/버블 | ✅ 완료 | 100% |

## M1 완료 내역
- [x] overview.ts: getCampaignListSummary / getCampaignOverview / getRankDistributionHistory
- [x] API: [campaignId]/overview/, [campaignId]/rank-history/
- [x] PositionTrackingProjects 목록 테이블 + page.tsx 분기
- [x] OverviewKpiCards + RankDistributionPanel 일별 스택 차트
- 게이트: tsc ✅ eslint ✅ 서버 테스트 17/17 ✅ (Node 25 — better-sqlite3 ABI=141)

## M2 완료 내역
- [x] highlights.ts: getKeywordHighlights / getPagesBreakdown + API 2종
- [x] KeywordHighlightsRow(상위/효율/비효율 3열, CTR 곡선 배지)
- [x] PagesPanel(상위·상승·하락 탭) / SerpFeaturesPanel / CampaignSummaryCard
- [x] overview.test.ts 통합 테스트 5건 + test:position 스크립트
- 게이트: tsc ✅ eslint ✅ overview.test 5/5 ✅

## M3 완료 내역
- [x] tracked_keywords.tags 컬럼 + 0016 마이그레이션 (적용 확인: 17개)
- [x] tags.ts(updateKeywordTags — 정규화·중복 제거·소유권) + POST keywords/tags API
- [x] TagsPanel(태그 칩 필터·빈 상태) + TagManageModal(일괄 추가/제거)
- [x] 도메인 관점 전환: rank-distribution/rank-history ?domain= + 대시보드 칩 +
      키워드 테이블 순위 열 전환 (이전/변동·GSC 열은 자사 전용 명시)
- [x] CompetitiveMapCard 버블 차트 (관측된 SERP 등장 빈도 × 평균 순위, 자사 점 포함)
- [x] tags.test.ts 3건
- 게이트: tsc ✅(내 파일 기준 — OrganicTrendChart 오류는 병행 작업 진행분)
  eslint ✅ position 테스트 11/11 ✅

## 남긴 참고
- 병행 onpage 작업의 0015 마이그레이션·스키마는 저널 무결성을 위해 P3 커밋에
  함께 포함 (앱 코드 store.ts/analyze route 는 해당 작업이 커밋할 것)
- 로컬 main 은 origin/main 과 분기 상태 (keyword overview 0014 번호 충돌 포함,
  병합 시 마이그레이션 재생성 필요)
