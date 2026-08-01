# TopKeywordsCard 명세 (상위 키워드)

## 개요
- 대상 파일: `src/components/analytics/organic/TopKeywordsCard.tsx`
- 스크린샷: `docs/design-references/semrush-organic/04-top-keywords.png`
- 원본 DOM: `docs/research/extract/top-keywords-full.json`
- 인터랙션: 세그먼트 3종 전환(즉시 필터), 행 hover 틴트, 키워드 링크

## 구조
- 534px 카드(OrganicCard title=`상위 키워드`).
- 제목 아래: OrganicSegmented — `모든 포지션` / `유기적` / `SERP 구성 요소` (기본 첫번째).
- 테이블 (OrganicTable/Th/Tr/Td):
  - 헤더: `키워드`(좌) | `포지션`(우) | `SF`(우) | `검색량`(우) | `트래픽 %`(우, sortable 아이콘)
  - 행 5개 고정 표시(최대), 높이 37px, 하단 보더 rgba(0,21,16,0.07):
    - 키워드: 파란 링크 rgb(35,95,226) 14px (keyword overview 딥링크) + 뒤 SERP 미리보기 아이콘(16px 회색 사각+선 아이콘, hover 시 진해짐, title="SERP 보기")
    - 포지션: 검정 14px 우측
    - SF: OrganicDottedValue (점선 밑줄 회색, title=피처 목록) — null 이면 `—`
    - 검색량: 검정 우측 — null 이면 `—`
    - 트래픽 %: `76.11`, `< 0.01` 형식 문자열 우측
- 하단: OrganicCta `키워드 {n}개 모두 보기` (href).

## Props
```ts
interface TopKeywordRow {
  keyword: string; href: string; serpHref?: string;
  position: number; sf: number | null; sfTitle?: string;
  volume: number | null; trafficPct: string;
  hasSerpFeatures: boolean; // 세그먼트 필터용
}
{
  rows: TopKeywordRow[]; totalCount: number; viewAllHref: string;
  copy: { title: string; segments: { all: string; organic: string; serp: string };
          headers: { keyword: string; position: string; sf: string; volume: string; traffic: string };
          viewAll: (n: number) => string; empty: string };
}
```
- 세그먼트 필터는 내부 state: all=전체, organic=광고 아닌 것(전부), serp=hasSerpFeatures 만. 결과 0이면 회색 12px `empty` 문구 행.

## 정직성
- volume/sf null → `—` 렌더 (가짜 숫자 금지). trafficPct 는 모델 추정치 문자열(부모가 계산·포맷).
