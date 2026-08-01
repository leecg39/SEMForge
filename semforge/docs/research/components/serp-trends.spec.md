# SerpTrendsChart 명세 (SERP 구성 요소 트렌드)

## 개요
- 대상 파일: `src/components/analytics/organic/SerpTrendsChart.tsx`
- 스크린샷: `docs/design-references/semrush-organic/08-serp-trends.png`
- 원본 DOM: `docs/research/extract/serp-trends-full.json`
- 인터랙션: 체크박스 3개 토글, `기타 구성 요소` 셀렉트(시각+기본 항목), 기간 필(기본 `1m`=1개월)

## 구조
- 전폭 카드(OrganicCard title=`SERP 구성 요소 트렌드`).
- 컨트롤 행: 좌 — 색 체크박스 3개(OrganicLegendCheckbox): `AI 개요`(oklch(0.74 0.225 330) 마젠타) / `추천 동영상`(oklch(0.58 0.168 278.2) 인디고) / `관련 질문`(oklch(0.82 0.18 80) 주황), 이어서 `기타 구성 요소` 아웃라인 셀렉트(높이 28px, radius 6px, 보더 rgba(0,12,8,0.16), 캐럿). 우 — OrganicPeriodPills 기본 `1m`.
- 차트 (높이 ~160px, recharts LineChart):
  - 일 단위 x축(`7월 1일` 형식, 격일 라벨) 11px, 축선 rgb(214,216,215). y축 숨김(원본은 데이터 없으면 그리드 미표시).
  - 라인: 각 피처 색, 1.5px, 도트 없음.
  - 마지막 구간 반투명 회색 세로 밴드.
  - 데이터 전부 0/없음이어도 축은 렌더(원본처럼 빈 차트).
- 하단: OrganicCta `모든 키워드 보기`.

## Props
```ts
interface SerpTrendPoint { period: string; aiOverview: number | null; featuredVideo: number | null; relatedQuestions: number | null }
{ points: SerpTrendPoint[]; period: OrganicPeriod; onPeriodChange: (p: OrganicPeriod) => void;
  viewAllHref: string;
  copy: { title: string; features: { aiOverview: string; featuredVideo: string; relatedQuestions: string };
          otherSelect: string; periods: Record<OrganicPeriod, string>; viewAll: string } }
```
- 체크 상태 내부 state(기본 전부 true). null 값 구간은 라인 미표시(connectNulls={false}).

## 정직성
- 이력 데이터가 없으면 points 는 기간 축만 있는 null 값 배열 → 원본과 동일한 "빈 차트 + 축" 렌더.
