# PositionChangesCard + SerpPositionChangesCard 명세

## 개요
- 대상 파일: `src/components/analytics/organic/PositionChangesCards.tsx` (2개 export)
- 스크린샷: `docs/design-references/semrush-organic/06-position-changes.png`, `07-serp-position-changes.png`
- 원본 DOM: `docs/research/extract/position-changes-full.json`, `serp-position-changes-full.json`
- 인터랙션: 세그먼트 전환. 현재 데이터는 두 카드 모두 빈 상태가 기본.

## 구조 (공통)
- 534px 카드(OrganicCard).
  - PositionChangesCard title=`자연 검색 상위 포지션 변동`, 세그먼트 4개: `신규`/`누락`/`상승`/`하락` (기본 신규)
  - SerpPositionChangesCard title=`SERP 구성 요소 상위 포지션 변동`, 세그먼트 2개: `신규`/`누락`
- 세그먼트: OrganicSegmented (joined 그룹).
- 본문:
  - rows 없으면 **OrganicEmptyState** (`결과가 없습니다` / `필터를 변경해 보세요.`) — 원본과 동일한 중앙 배치, 최소 높이 ~200px.
  - rows 있으면 간단 테이블: 키워드(파란 링크) | 변동 전→후 포지션(예: `12 → 4`, 상승 초록/하락 빨강) | 검색량(null=`—`).

## Props
```ts
interface PositionChangeRow { keyword: string; href: string; from: number | null; to: number | null; volume: number | null }
// PositionChangesCard
{ segments: Record<"new"|"lost"|"improved"|"declined", PositionChangeRow[]>;
  copy: { title: string; segments: Record<"new"|"lost"|"improved"|"declined", string>; emptyTitle: string; emptyHint: string } }
// SerpPositionChangesCard
{ segments: Record<"new"|"lost", PositionChangeRow[]>;
  copy: { title: string; segments: Record<"new"|"lost", string>; emptyTitle: string; emptyHint: string } }
```

## 정직성
- 스냅샷 비교 데이터가 없으면 부모가 빈 segments 전달 → 빈 상태 (원본 화면도 이 도메인에서 빈 상태였음).
