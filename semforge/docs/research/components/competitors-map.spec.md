# CompetitorsCard + PositioningMapCard 명세

## 개요
- 대상 파일: `src/components/analytics/organic/CompetitorsCards.tsx` (2개 export)
- 스크린샷: `docs/design-references/semrush-organic/12-competitors.png`, `13-positioning-map.png`
- 원본 DOM: `docs/research/extract/competitors-full.json`, `positioning-map-full.json`
- 인터랙션: 링크, 행 hover, 버블 hover 툴팁

## CompetitorsCard (주요 자연 경쟁자)
- 534px 카드(OrganicCard title=`주요 자연 경쟁자`).
- 테이블 헤더: `도메인`(좌) | `공통 키워드`(우) | `경쟁 수준`(우, sortable)
- 행 최대 6개:
  - 도메인: 파란 링크 + 외부링크 아이콘
  - 공통 키워드: 정수 우측
  - 경쟁 수준: **수평 바** (트랙 64×8px 회색 #ecedf0 radius 4px, 채움 인디고 oklch(0.58 0.168 278.2) radius 4px) + 우측 `{n}%` 12px 검정 (`100 %` 줄바꿈 없이)
- 하단: OrganicCta `경쟁자 {n}개 모두 보기`.
- rows 비면 12px 회색 empty 문구.

```ts
interface CompetitorRow { domain: string; href: string; commonKeywords: number; levelPct: number }
{ rows: CompetitorRow[]; totalCount: number; viewAllHref: string;
  copy: { title: string; headers: { domain: string; common: string; level: string }; viewAll: (n: number) => string; empty: string } }
```

## PositioningMapCard (경쟁 포지셔닝 지도)
- 534px 카드(OrganicCard title=`경쟁 포지셔닝 지도`).
- 범례: 12px 색 도트 + 도메인명 13px 검정, 2행 flex wrap, 갭 16px/8px. 색 = ORGANIC_COLORS.bubbles 순환.
- 차트 (recharts ScatterChart 또는 커스텀 SVG, 높이 ~240px):
  - x축 `키워드 수` / y축 `자연 검색 트래픽(N)` — 라벨 11px 회색(rgba(0,3,0,0.584)), y축 제목 세로 회전, 그리드 rgba(0,21,16,0.07), 축선 rgb(214,216,215).
  - 버블: 반투명(불투명도 ~0.45) 채움 + 중심 `+` 마커(2px 십자, 진한 동일색). 반지름은 부모 제공 r(px).
  - hover: 툴팁(도메인, 키워드 수, 트래픽).
- rows 비면 12px 회색 empty 문구.

```ts
interface BubbleRow { domain: string; keywords: number; traffic: number; r: number }
{ bubbles: BubbleRow[]; copy: { title: string; xLabel: string; yLabel: string; empty: string } }
```

## 구현 노트
- recharts ScatterChart 의 ZAxis 로 버블 크기 매핑 가능하나, `+` 마커·불투명도 제어를 위해 커스텀 shape 사용 권장.
- 색은 인덱스 순환(ORGANIC_COLORS.bubbles[i % 6]).

## 정직성
- 경쟁자·버블 데이터는 실측 스냅샷의 공유 키워드 집계(부모 계산). 없으면 빈 상태.
