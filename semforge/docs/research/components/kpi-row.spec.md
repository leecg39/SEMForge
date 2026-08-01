# OrganicKpiRow 명세

## 개요
- 대상 파일: `src/components/analytics/organic/OrganicKpiRow.tsx`
- 스크린샷: `docs/design-references/semrush-organic/02-kpi-row.png`
- 원본 DOM: `docs/research/extract/kpi-row-full.json`
- 인터랙션: 정적 (라벨 hover 시 title 툴팁 허용)

## 구조
- 전폭(1085px) 카드 1개(OrganicCard, title 없음, padding 16px), 내부 5열 그리드.
- 열 구분: 열 사이 수직 보더 1px rgba(0,21,16,0.07), 열 좌우 패딩 16px (첫 열 좌 0, 끝 열 우 0).
- 각 KPI 셀:
  1. 라벨 행: 12px, 색 rgba(0,3,0,0.584), 점선 밑줄(cursor help) — `키워드`, `트래픽`, `트래픽 비용`, `브랜드 트래픽`, `비브랜드 트래픽`
  2. 값 행: **24px/700** 검정 + 우측 변화율 배지(OrganicDeltaBadge, 12px) `0%`
  3. 스파크라인 (높이 ~32px, 값 아래 8px):
     - 키워드: 막대형 — 12개 막대, 색 oklch(0.82 0.088 272.1), 마지막 막대 oklch(0.58 0.168 278.2), 막대 폭 6px 갭 2px, radius 1px
     - 트래픽: 라인+영역형 — 선 rgb(102,107,219) 1.5px, 영역 동일색 12% 불투명, 끝점 도트 3px, 기준선 rgb(224,225,233) 1px
     - 트래픽 비용/브랜드/비브랜드: 스파크라인 없음(원본과 동일하게 값만)
- 값 포맷: 정수 천단위(`67`), 통화(`US$16.0`) — 문자열로 받은 그대로 렌더.

## Props
```ts
interface OrganicKpiItem {
  key: string;
  label: string;
  /** 미제공이면 null → "—" + note 툴팁 */
  value: string | null;
  delta: number | null; // 0 => "0%" 회색
  spark?: { type: "bar" | "line"; points: number[] } | null;
  unavailableNote?: string;
}
{ items: OrganicKpiItem[] } // 항상 5개
```

## 스파크라인 구현
- 외부 라이브러리 없이 인라인 SVG로 직접 그리기 (폭 ~140px, viewBox 계산).
- points 비었거나 1개면 렌더 생략.

## 정직성
- 트래픽 비용은 CPC 소스 없으면 value=null (“—” + unavailableNote 툴팁).
- delta 는 비교 시점 데이터 없으면 null (“—”), 있으면 실측.
