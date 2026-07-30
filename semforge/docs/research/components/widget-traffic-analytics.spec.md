# WidgetTrafficAnalytics Specification

## Overview
- **Target file:** `src/components/seo-dash/WidgetTrafficAnalytics.tsx`
- **Screenshot:** `docs/design-references/ko.semrush.com/seo-dashboard-current-1440.png` (전폭 위젯)
- **Interaction model:** 탭 클릭(Semrush 데이터/Google 데이터) — Google은 미연결 상태 표시
- **데이터:** 실측 — domain-overview 리포트(visitsEstimate, uniqueVisitorsEstimate, pagesPerVisit, bounceRate, trend[].visitsEstimate, channels)

## DOM Structure
```
<section card big (전폭)>
  <header flex justify-between align-center wrap>
    <div flex align-center gap-3>
      <h3>Traffic Analytics</h3>
      <tabs pill> [Semrush 데이터] [Google 데이터] </tabs>
    </div>
    <div flex gap-2 align-center>
      <button link>루트 도메인 ⌄</button>
      <span>이전 데이터: 2026년 6월</span>
    </div>
  </header>
  <div stat row (5개 균등)>
    <stat><label>방문수</label><big>3.7M</big><delta red>-9.84%</delta></stat>
    <stat><label>유니크 방문자 수</label><big>2M</big><delta red>-6.56%</delta></stat>
    <stat><label>방문당 페이지수</label><big>3.71</big><delta red>-4.86%</delta></stat>
    <stat><label>평균 체류 시간</label><big>00:08:14</big><delta red>-6.97%</delta></stat>
    <stat><label>이탈률</label><big>51.12%</big><delta green>-2.35%</delta></stat>
  </div>
  <div chart area>
    <span caption>최근 6개월</span>
    <bar chart (월별 6개 막대 + y축 3M/2M/1M/0)>
    <legend channels>직접/추천/자연 검색/자연 소셜/유료 소셜/유료 검색/디스플레이 광고/이메일</legend>
  </div>
  <footer right><a>전체 보고서 보기 →</a></footer>
</section>
```

## Computed Styles (실측)
### 카드/헤더
- 카드 공통, padding 20px
- h3: 16px/700 oklch(0.23 0.01 140)
- 탭 텍스트: 14px/400 rgba(1,5,0,0.898); 활성 탭은 pill 배경/볼드 처리(스크린샷: 밑줄 또는 pill — pill 형태)
- "루트 도메인": 14px/400 rgb(35, 95, 226)
- "이전 데이터: ...": 14px/400 oklch(0.53 0.004 149.6)

### 스탯
- 라벨: 14px/400 rgba(1,5,0,0.898)
- 값: 20px/700 oklch(0.23 0.01 140)
- 델타: 12px/400; 감소(빨강) oklch(0.53 0.206 27.3); 개선(초록) oklch(0.53 0.142 170) — 이탈률 감소는 초록

### 차트
- 캡션 "최근 6개월": 14px/400 oklch(0.53 0.004 149.6)
- y축 라벨: 12px/400 rgba(1,5,0,0.898) (3M/2M/1M/0)
- x축 월 라벨: 12px/400 (26년 1월…26년 6월)
- 막대: 채널별 스택 또는 단색(스크린샷 주황 계열 막대) — 채널 데이터가 있으면 스택, 없으면 단색 주황(#f7651e 계열)로
- 범례: 14px/400, 8개 채널

### 푸터 링크
- "전체 보고서 보기": 14px/500, color display-p3(0.00228 0.01289 0.00252/0.583) → /analytics/traffic/

## Data mapping (clone)
- 방문수 ← metrics.visitsEstimate, 유니크 ← uniqueVisitorsEstimate, 방문당 페이지 ← pagesPerVisit, 이탈률 ← bounceRate
- 평균 체류 시간 ← 원천 없음 → 데모 값(00:08:14) + "데모" 배지(위젯 우상단)
- 델타 % ← trend 마지막 2개월 비교
- 6개월 막대 ← trend 최근 6개월 visitsEstimate
- 채널 범례/스택 ← channels (있으면 share 비례 스택 막대)
- "Google 데이터" 탭 → 클릭 시 미연결 안내 패널("Google 서비스 연결하기"와 동일 CTA) — 탭 전환은 로컬 state

## Text Content (verbatim)
- "Traffic Analytics", "Semrush 데이터", "Google 데이터", "루트 도메인", "이전 데이터: 2026년 6월", "방문수", "유니크 방문자 수", "방문당 페이지수", "평균 체류 시간", "이탈률", "최근 6개월", "직접", "추천", "자연 검색", "자연 소셜", "유료 소셜", "유료 검색", "디스플레이 광고", "이메일", "전체 보고서 보기"

## Props
- `report: DomainAnalyticsReport | null`, `previousMonthLabel: string`
- report null → 빈 상태

## Responsive
- 1440: 스탯 5열. 768~1024: 3+2열. 390: 1열 스택 + 차트 가로 스크롤
