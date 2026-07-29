# WidgetOrganicRank + WidgetBacklinks + 스텁 위젯 Specification

## Overview
- **Target files:** `src/components/seo-dash/WidgetOrganicRank.tsx`, `WidgetBacklinks.tsx`, `WidgetStubs.tsx`(Google 연결 + 숨겨진 위젯)
- **Screenshot:** `docs/design-references/ko.semrush.com/seo-dashboard-current-1440.png` (4행 차트 위젯 + 하단 스텁)
- **Interaction model:** 정적 차트 + 셀렉트 링크(시각) + 보고서 링크

## A. WidgetOrganicRank (자연검색 순위, standard 669×606)

### DOM
```
<section card standard>
  <header flex justify-between>
    <h3>자연검색 순위</h3>
    <div selects><span gray>지난 달 ⌄</span><button link>루트 도메인 ⌄</button><button link>United States ⌄</button><button link>데스크톱 ⌄</button></div>
  </header>
  <label>자연 트래픽</label>
  <area chart (y: 750K/500K/250K, 12px 라벨)>
  <label>키워드 포지션 변동</label>
  <bar chart (y: 1K/500/0, x: 6월 29일~7월 27일 날짜 라벨 12px)>
  <legend>상승(초록)/하락(빨강)</legend>
  <footer right><a>전체 보고서 보기 →</a></footer>
</section>
```

### Styles (실측)
- h3: 16px/700 oklch(0.23 0.01 140)
- 셀렉트: 링크 14px/400 rgb(35,95,226), "지난 달" 14px/400 color(display-p3 0.00228 0.01289 0.00252 / 0.583)
- 차트 라벨(축): 12px/400 rgba(1,5,0,0.898)
- "전체 보고서 보기": 14px/500 color(display-p3 0.00228 0.01289 0.00252 / 0.583)

### 데이터 (clone)
- 면적 차트 ← `trend[].organicTrafficEstimate` (실측, recharts TrendChart 프리미티브 또는 커스텀 SVG)
- 포지션 변동 ← `positionDistribution` 기반 상승/하락 데모 막대 (원천 시계열 부족 시 데모 표기 없이 단순화: 최신 분포로 상승=1-3위, 하락=나머지)

## B. WidgetBacklinks (백링크, standard 669×606)

### DOM
```
<section card standard>
  <header flex justify-between>
    <h3>백링크</h3>
    <span gray>범위: 루트 도메인 ⌄</span>
  </header>
  <label>추천 도메인</label> <span caption>최근 12개월</span>
  <area chart (y: 350K/325K/300K/275K, x: 월 라벨 12px)>
  <label>Authority Score별 추천 도메인</label> <span caption>2026년 7월</span>
  <stacked/grouped bars (x: 0-20, 21-40, 41-60, 61-80, 81-100 라벨 14px)>
  <percentages row (65.78%, 28.53%, 4.89% 등)>
  <footer right><a>전체 보고서 보기 →</a></footer>
</section>
```

### 데이터 (clone)
- 추천 도메인 면적 ← link_graph_edges의 firstSeenAt 월별 누적(서버 계산)
- AS별 추천 도메인 ← `refDomainsByAuthority` (5버킷으로 재집계: 0-20, 21-40, 41-60, 61-80, 81-100, % 계산)
- "전체 보고서 보기" → /analytics/backlinks/overview/

## C. WidgetStubs (전폭 스텁 2종)

### Google 서비스 연결하기 (big stub 1361×304, 전체 mute)
- 타이틀 16px/700 color(display-p3 .../0.583)
- 설명 14px/400 동일 gray: "SEO 대시보드에서 Google 애널리틱스와 Google Search Console의 실시간 데이터를 사용해 분석의 품질을 높여보세요."
- "연결" 버튼 14px/500 gray(비활성 스타일), "면책조항" 14px/400 gray
- 스크린샷: 카드 내부 중앙에 GA+GSC 로고 조합 일러스트 — 텍스트/SVG 아이콘으로 간소화 가능

### 숨겨진 위젯 (standard stub 1361×213)
- "숨겨진 위젯" 16px/700 rgba(1,5,0,0.898)
- "대시보드에 모든 위젯이 표시됩니다" 16px/700 color(display-p3 .../0.583)

## Responsive
- 1440: standard 2열(669px) 나란히. 768~1024: 1열 스택. 390: 전폭
