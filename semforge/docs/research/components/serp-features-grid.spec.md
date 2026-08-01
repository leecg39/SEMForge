# SerpFeaturesGrid 명세 (SERP 구성 요소)

## 개요
- 대상 파일: `src/components/analytics/organic/SerpFeaturesGrid.tsx` (+ 아이콘은 파일 내 정의)
- 스크린샷: `docs/design-references/semrush-organic/09-serp-features-grid.png`
- 원본 DOM: `docs/research/extract/serp-features-grid-full.json`
- 인터랙션: 활성 항목만 링크. 나머지 정적.

## 구조
- 전폭 카드(OrganicCard title=`SERP 구성 요소`).
- 그룹 2개, 각각 그룹 제목(13px/600 검정, 마진 상 16px/하 8px):
  1. `도메인으로 연결됨`
  2. `도메인으로 연결되지 않음`
- 각 그룹: **6열 그리드** (열 폭 균등, 행 갭 8px, 열 갭 16px). 항목:
  - 아이콘 32px 원형 컨테이너(연회색 배경 #f4f5f7, 활성이면 연파랑 #eef4ff) 안 16px 아이콘
  - 우측 2줄: 피처명(13px — 활성: 파란 링크 rgb(35,95,226) / 비활성: 회색 rgba(0,3,0,0.584)) + `키워드 {n}개`(12px 회색)
  - 활성 판정: keywords > 0 (연결됨 그룹) — 원본에서 연결됨 그룹의 카운트>0 항목만 파란 링크·컬러 아이콘, 0짜리는 회색.
- 피처 목록(연결됨 그룹, 원본 순서): 추천 스니펫, 사이트 링크, AI 개요, FAQ, 리뷰, 목표 결과, 뉴스, 이미지, 이미지 팩, 동영상, 추천 동영상, 동영상 캐러셀, 관련 질문, 로컬 팩, 지식 패널, 주요 뉴스, 레시피, 직책, X, X 캐러셀, 가이드 구매, 데이터세트, 토론 및 포럼, 브랜드 살펴보기, 다음에서 결과 찾기, 자연 검색 캐러셀, 질문과 답변, 알아두면 좋은 정보
- 연결되지 않음 그룹 추가 항목: 연관 검색, 빠른 답변, 캐러셀, 이벤트, 호텔 팩, 항공편, 주소 팩, 연관 제품, 사용자의 관련 검색, 인기있는 제품, 상세 검색, 다음에 대한 결과, 쇼핑 광고, Google Ads 상위 등
- **아이콘**: 외부 에셋 복사 금지. 파일 내에서 16px 오리지널 미니 아이콘 ~14종 제작(스니펫=문서, 링크, AI=별4각, FAQ=?, 리뷰=별, 뉴스=신문, 이미지=산, 동영상=▶, 질문=말풍선, 로컬=핀, 지식=모자, X=x, 쇼핑=카트, 기본=격자) + 미매핑 피처는 기본 아이콘.

## Props
```ts
interface SerpFeatureItem { key: string; label: string; keywords: number; href?: string }
{ linked: SerpFeatureItem[]; notLinked: SerpFeatureItem[];
  copy: { title: string; linkedTitle: string; notLinkedTitle: string; keywordCount: (n: number) => string } }
```

## 정직성
- keywords 값은 실측 serpFeatures 집계. "연결되지 않음" 판별 데이터가 없으면 부모가 전 항목 keywords=0 으로 전달 → 회색 0개 렌더(원본 하단 그룹과 동일한 모습).
