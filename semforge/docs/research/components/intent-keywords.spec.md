# IntentKeywordsCard 명세 (의도별 키워드)

## 개요
- 대상 파일: `src/components/analytics/organic/IntentKeywordsCard.tsx`
- 스크린샷: `docs/design-references/semrush-organic/05-intent-keywords.png`
- 원본 DOM: `docs/research/extract/intent-keywords-full.json`
- 인터랙션: 링크(%, 라벨), 행 hover. (우측 하단 보라 원은 원본 페이지의 AI 어시스턴트 FAB — 클론 제외)

## 구조
- 534px 카드(OrganicCard title=`의도별 키워드`).
- **분포 바**: 높이 16px, 전폭. 세그먼트 = share 비율. 첫 세그먼트 radius `2px 0 0 2px`, 끝 `0 2px 2px 0`. 색 = ORGANIC_COLORS.intent[의도].
- 테이블: 헤더 `의도`(좌) | `키워드`(우) | `트래픽`(우, sortable)
  - 행: 12px 색 도트(radius 50%) + 의도 라벨 검정 14px (`정보제공(I)` / `탐색(N)` / `상업(C)` / `거래(T)`) … 가운데 `50%` 파란 링크(rgb(35,95,226)) … 키워드 수 … 트래픽 값(null → `—`)
  - 행 높이 37px, 하단 보더 rgba(0,21,16,0.07), hover 틴트.
- 행 아래 중앙: `더 이상 결과가 없습니다` 12px 회색 (rows < 4 일 때).
- 하단: OrganicCta `전체 보고서 보기`.

## Props
```ts
interface IntentRow { intent: "informational"|"navigational"|"commercial"|"transactional";
  label: string; sharePct: number; keywords: number; traffic: number | null; href?: string }
{ rows: IntentRow[]; viewAllHref: string;
  copy: { title: string; headers: { intent: string; keywords: string; traffic: string };
          noMore: string; viewAll: string; empty: string } }
```
- rows 비면 카드 본문에 empty 문구(12px 회색 중앙).

## 정직성
- traffic 은 부모가 실측 파생 못 하면 null → `—`.
- sharePct 는 실측 intentDistribution 값.
