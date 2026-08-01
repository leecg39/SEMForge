# OrganicTrendChart 명세 (자연 키워드 추세)

## 개요
- 대상 파일: `src/components/analytics/organic/OrganicTrendChart.tsx`
- 스크린샷: `docs/design-references/semrush-organic/03-trend-chart.png`
- 원본 DOM: `docs/research/extract/trend-chart-full.json`
- 인터랙션: 범례 체크박스 토글(시리즈 표시/숨김, 즉시), 기간 필 전환, 막대 hover 툴팁

## 구조
- 전폭 카드(OrganicCard). 제목 `자연 키워드 추세` 16px/600 + 우측 X 닫기 아이콘 버튼(회색, 시각만).
- **컨트롤 행** (제목 아래 12px, 좌우 분산):
  - 좌: 범례 체크박스 6개(OrganicLegendCheckbox, 간격 16px) — 상위 3개(oklch(0.82 0.18 80)) / 4-10(oklch(0.46 0.141 280.7)) / 11-20(oklch(0.58 0.168 278.2)) / 21-50(oklch(0.74 0.117 274.1)) / 51-100(oklch(0.82 0.088 272.1)) / SERP 구성 요소(oklch(0.82 0.19 143)) — 전부 기본 체크 | 수직 구분선 | `메모` 토글(말풍선 아이콘+캐럿, 시각만)
  - 우: OrganicPeriodPills (기본 `all`=항상)
- **차트** (높이 195px, recharts BarChart stackId 스택):
  - 주 단위 포인트. 막대 폭 ~6px. 스택 순서 아래→위: top3, 4-10, 11-20, 21-50, 51-100, serpFeatures.
  - y축: 좌측, 4개 눈금, 라벨 11px rgba(0,3,0,0.584), 그리드 수평선 rgba(0,21,16,0.07).
  - x축: 연 단위 라벨(`16년 12월` 형식) 11px, 축선 rgb(214,216,215).
  - 마지막(현재 진행) 구간: 반투명 회색 세로 밴드 배경.
  - 툴팁: 흰 카드, 기간 + 버킷별 색 도트/값.
- 하단 마커 행(구글 업데이트 G 아이콘)·세로 주석선: **데이터 없으므로 렌더 생략** (props 로 받되 옵션).

## Props
```ts
interface TrendPoint { period: string; top3: number; p4_10: number; p11_20: number; p21_50: number; p51_100: number; serpFeatures: number }
{
  points: TrendPoint[];            // 실측만. 빈 배열 → 차트 영역에 빈 상태 문구(작게, 회색)
  period: OrganicPeriod; onPeriodChange: (p: OrganicPeriod) => void;
  copy: { title: string; legend: Record<string, string>; periods: Record<OrganicPeriod, string>; memo: string; empty: string };
}
```
- 체크 상태는 컴포넌트 내부 state (기본 전부 true).
- 기간 필터링은 부모 책임(점 배열이 이미 잘려 옴) — 컴포넌트는 그대로 그림.

## 구현 노트
- recharts: `BarChart` + `Bar stackId="pos"` 6개 + `CartesianGrid horizontal only` + `XAxis/YAxis` + `Tooltip`.
- 색은 organic-ui `ORGANIC_COLORS.bucket` 사용.
- 애니메이션 비활성(isAnimationActive={false}) — 원본은 즉시 렌더.
