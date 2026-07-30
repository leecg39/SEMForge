# WidgetSeoMetrics Specification

## Overview
- **Target file:** `src/components/seo-dash/WidgetSeoMetrics.tsx`
- **Screenshot:** `docs/design-references/ko.semrush.com/seo-dashboard-current-1440.png` (우상단 위젯)
- **Interaction model:** 정적 + 셀렉트 링크(시각) + 차트
- **데이터:** 실측 — `domain-overview` 리포트(authorityScore, organicTrafficEstimate, trend, paidKeywords는 없음→데모 표기)

## DOM Structure
```
<section card (2열 span)>
  <header flex justify-between align-center>
    <h3>SEO</h3>
    <div selects flex gap-2>
      <button link>루트 도메인 ⌄</button><button link>United States ⌄</button><button link>데스크톱 ⌄</button>
      <span date>2026년 7월 27일</span>
    </div>
  </header>
  <div authority row>
    <label>Authority Score</label>
    <big>700</big>
    <span>Semrush 순위</span><big>5.6K</big>
  </div>
  <hr divider (margin: 0 0 20px -20px)>
  <div grid metrics (gridTemplateColumns: 154px 154px 154px, gap 20px 12px)>
    <item>라벨 "유료 키워드" | 값 235 + 증감 배지 +16.92% (초록)</item>
    <item>라벨 "유료 트래픽" | 값 9.5K + sparkline svg 130×30</item>
    <item>라벨 "자연 트래픽" | 값 419K + 증감 배지 −9.73% (빨강) + sparkline svg 130×30</item>
    <item 2행>동일 패턴 (sparkline 또는 배지)</item>
  </div>
</section>
```

## Computed Styles (실측)
### 카드/타이틀/링크
- 카드 공통 (shadow=--a2-card-shadow, radius 8px, padding 8px 20px 20px)
- h3: 16px/700, color oklch(0.23 0.01 140)
- 셀렉트 링크: 14px/400 rgb(35, 95, 226); 날짜: 14px/400 oklch(0.53 0.004 149.6)

### Authority Score 블록
- 라벨 14px/400 rgba(1,5,0,0.898); 값 20px/700급 oklch(0.23 0.01 140)
- "Semrush 순위" 라벨 동일 + 값

### 지표 그리드 아이템 (seo_d_domainAnalyticsItem)
- 아이템: flex column, w~154px, h~80px; 일부 아이템 padding-left 22px
- 아이템 헤더 라벨: 14px/400, lineHeight 14px, color rgba(1,5,0,0.898), margin-bottom 8px, 아이콘(i) 14px gap 4px
- 값 행: flex align-center gap 8px, h 24px, margin-bottom 8px — 값 20px/700 oklch(0.23 0.01 140)
- 증감 배지: 12px/400; 증가 color oklch(0.53 0.142 170) (초록), 감소 color oklch(0.53 0.206 27.3) (빨강)
- sparkline: svg 130×30 (margin -5px) — trend 데이터로 polyline path 생성

### divider
- bg: color(display-p3 0.00798 0.04498 0.03219 / 0.161), h 1px, margin: 0 0 20px -20px

## Data mapping (clone)
- Authority Score ← `metrics.authorityScore.value`
- 자연 트래픽 ← `metrics.organicTrafficEstimate.value` + sparkline ← `trend[].organicTrafficEstimate`
- 증감 % ← trend 마지막 2개월 비교로 계산
- Semrush 순위 / 유료 키워드 / 유료 트래픽 ← 원천 없음 → 데모 값 + "데모" 배지(위젯 우상단)

## Text Content
- "SEO", "루트 도메인", "United States", "데스크톱", "Authority Score", "Semrush 순위", "유료 키워드", "유료 트래픽", "자연 트래픽"

## Props
- `report: DomainAnalyticsReport | null`, `dateLabel: string`, `demo?: boolean`
- report null → 빈 상태 "데이터 없음"

## Responsive
- 1440: 2열 span, 지표 3열(154px). 768~1024: 1열 span, 지표 2열. 390: 지표 1열 스택
