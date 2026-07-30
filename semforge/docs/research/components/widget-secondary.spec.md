# WidgetSecondary (보조 위젯 ×5) Specification

## Overview
- **Target file:** `src/components/seo-dash/WidgetSecondary.tsx` (1개 컴포넌트, 5개 인스턴스)
- **Screenshot:** `docs/design-references/ko.semrush.com/seo-dashboard-current-1440.png` (3행 소형 카드들)
- **Interaction model:** 설정 버튼 클릭 → 각 도구 페이지 이동

## 인스턴스 목록 (실측 텍스트 verbatim)
| key | 타이틀 | 설명 | 버튼 | 링크 |
|---|---|---|---|---|
| positionTracking | 포지션 추적 | Google의 또는 Bing의 상위 100위 자연 및 유료 검색 결과의 포지션에 대한 일일 업데이트를 받아보실 수 있습니다. | 설정 | /position-tracking/ |
| siteAudit | 사이트 진단 | 크롤러빌리티, 콘텐츠, 링크 및 코딩 관련 문제를 감지합니다. | 설정 | /siteaudit/ |
| onPageSeo | 온페이지 SEO 분석 도구 | 전략, 콘텐츠, 백링크 등에 대한 아이디어를 수집하세요. | 설정 | /on-page-seo-checker/ |
| backlinkAudit | 백링크 진단 | 백링크 포트폴리오를 디톡스하고 웹사이트 순위를 강화하세요. | 설정 | /backlink_audit/ |
| organicTrafficInsights | 자연 트래픽 인사이트 | GA, GSC 및 Semrush 데이터를 통합하여 "제공되지 않음" 키워드를 발굴하세요. | 설정 | /organic_traffic_insights/ |

## DOM Structure
```
<section card small (322×224)>
  <h3>{title}</h3>
  <p>{description}</p>
  <footer mt-auto>
    <button dark>설정</button>
  </footer>
</section>
```

## Computed Styles (실측)
### 카드
- 322×224 (그리드 1열), 공통 카드 스타일(radius 8px, --a2-card-shadow), padding 8px 20px 20px
- 내부는 flex column — 버튼이 하단에 오도록(mt-auto)

### 타이틀
- 16px/700, color: oklch(0.23 0.01 140)

### 설명
- 14px/400/20px, color: rgba(1, 5, 0, 0.898)

### 설정 버튼
- bg: rgb(26, 30, 26); color: rgba(254, 255, 255, 0.95); radius 6px; 14px/500; h ~28-32px (카드 하단 정렬)
- hover: 표준 다크닝

## 동작
- 설정 클릭 → 위 링크로 next/link 이동
- 카드 자체는 호버 효과 없음(원본과 동일)

## Props
- `title: string`, `description: string`, `href: string`, `ctaLabel?: string`(기본 "설정")
- 부모(그리드)가 5개 인스턴스를 렌더. 위 표의 기본 데이터를 컴포넌트 기본값으로 export해도 됨 (`SECONDARY_WIDGETS` 상수)

## Responsive
- 1440: 1열(322px) ×5 배치(4+1). 768~1024: 2열 그리드. 390: 전폭 스택
