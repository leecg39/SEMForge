# WidgetAiSearch Specification

## Overview
- **Target file:** `src/components/seo-dash/WidgetAiSearch.tsx`
- **Screenshot:** `docs/design-references/ko.semrush.com/seo-dashboard-current-1440.png` (좌상단 위젯)
- **Interaction model:** 정적 카드 + 국가 셀렉트 링크(클릭 시 드롭다운은 이번 범위 외, 시각만)
- **데이터:** 원천 데이터 없음 → mock 값 + "데모" 배지 표시

## DOM Structure
```
<section card>  (grid 2열 span)
  <header flex justify-between align-center>
    <h3>AI 검색</h3>
    <button link>United States ⌄</button>
  </header>
  <div flex gap>   <!-- 상단 3대 지표 -->
    <metric><label>AI 가시성</label><big>68</big></metric>
    <metric><label>언급</label><big>16.9K</big></metric>
    <metric><label>인용된 페이지</label><big>9.7K</big></metric>
  </div>
  <ul 엔진별 막대 행들>   <!-- 4개 엔진: 이름 + 막대 쌍 + 이전/현재 값 -->
    <li><span>ChatGPT</span><bar pair/><values>3.7K → 8K</values></li>
    <li><span>AI 개요</span><bar pair/><values>4.5K → 2.6K</values></li>
    <li><span>AI 모드</span><bar pair/><values>2.8K → 1.8K</values></li>
    <li><span>Gemini</span><bar pair/><values>5.9K → 648</values></li>
  </ul>
</section>
```

## Computed Styles (실측)
### 카드
- 공통 위젯 카드: bg #fff, radius 8px, padding 8px 20px 20px, shadow `color(display-p3 0.01753 0.08157 0.06372 / 0.07) 0 0 1px, 0 1px 3px` (= 프로젝트 `--a2-card-shadow`)

### 타이틀 "AI 검색"
- 14px/500, color: rgb(128, 41, 236) (보라)

### 국가 링크
- 14px/400, color rgb(35, 95, 226), chevron ⌄

### 지표 라벨
- 14px/400, color: oklch(0.23 0.01 140)

### 지표 빅 넘버 (68 / 16.9K / 9.7K)
- 24px/700, color: oklch(0.53 0.157 279.2) (보라)

### 엔진 행
- 엔진 이름: 14px/400, color rgba(1, 5, 0, 0.898)
- 이전/현재 값: 14px/400, color oklch(0.53 0.21 263)
- 막대: 이전(연보라)/현재(진보라) 쌍 horizontal bars — 스크린샷 참고. 값 비례 width

## Content (verbatim, mock 허용)
- AI 가시성 68, 언급 16.9K, 인용된 페이지 9.7K
- ChatGPT 3.7K→8K, AI 개요 4.5K→2.6K, AI 모드 2.8K→1.8K, Gemini 5.9K→648
- 우상단 또는 타이틀 옆에 작은 "데모" 배지 (기존 badge 토큰: bg-[#fff1eb] text-[#b63c0b])

## Props
- `visibility?: number`(기본 68), `mentions?: string`, `citedPages?: string`, `engines?: {name, prev, current}[]` (기본 위 값)
- 데이터가 props로 안 오면 mock 기본값 + 데모 배지 표시

## Responsive
- 1440: 2열 span. 768~1024: 1열. 390: 가로 카드(전폭)
