# 진행 상황 대시보드 — 포지션 추적 재구축

## 전체 진행률: 40% ████████░░░░░░░░░░░░

## 마일스톤 현황
| 마일스톤 | 상태 | 진행률 |
|----------|------|--------|
| M1: 랜딩 목록 + KPI/분포 | ✅ 완료 | 100% |
| M2: 하이라이트/페이지/피처/Summary | 🔄 진행중 | 0% |
| M3: 태그/관점 전환/버블 | ⏸️ 대기 | 0% |

## M1 완료 내역
- [x] T1.1 overview.ts: getCampaignListSummary / getCampaignOverview / getRankDistributionHistory
- [x] T1.2 API: [campaignId]/overview/, [campaignId]/rank-history/ (목록 요약은 page.tsx 서버 호출)
- [x] T1.3 PositionTrackingProjects 목록 테이블 + page.tsx 분기
- [x] T1.4 OverviewKpiCards(KPI 3카드+버킷 카드) + RankDistributionPanel 일별 스택 차트
- 게이트: tsc ✅ eslint ✅ insights/schedule/collect/talordata-insights 테스트 17/17 ✅
  (테스트는 Node 25(/opt/homebrew/bin) 로 실행 — better-sqlite3 바이너리가 MODULE_VERSION 141)

## 현재 작업
🔄 P2-T2.1: 하이라이트·페이지·SERP 피처 서버 집계

## 블로커
없음
