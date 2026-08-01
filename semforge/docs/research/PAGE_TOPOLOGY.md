# Semrush Organic Research 개요 — 페이지 토폴로지

원본: `https://ko.semrush.com/analytics/organic/overview/?db=kr&q=https%3A%2F%2Fmega-info.co.kr&searchType=domain`
기준 스크린샷: `docs/design-references/semrush-organic/desktop-1440-full.png` (섹션별 크롭 01~13)

## 전역 레이아웃

- **비반응형**: 콘텐츠 최소 폭 ≈1050px. 390px 뷰포트에서도 데스크톱 레이아웃 유지(가로 스크롤). 모바일 브레이크포인트 없음.
- 1440px 기준: 사이드바(≈208px, SEMForge에서는 AppShell 담당) + 콘텐츠 영역.
- **콘텐츠 컬럼**: x=308 시작(사이드바 208 + 좌 패딩), 폭 **1085px**, 좌우 패딩 32px 계열.
- **2열 카드**: 각 폭 **534px**, 갭 **17px** (534+17+534=1085).
- 카드 세로 간격 **16px**.
- **Sticky/fixed 요소 없음** — 헤더·필터바·탭바 모두 일반 흐름(스크롤과 함께 사라짐).
- 페이지 배경 `rgb(255,255,255)`. 본문 기본 폰트 `Inter, sans-serif`, 12px, `rgb(51,51,51)`.
- Semrush 앱 푸터(요금제 안내 등)는 **클론 범위 제외** (SEMForge AppShell 소유).

## 섹션 순서 (SEMForge 컴포넌트 매핑)

| # | 섹션 | 폭 | 크롭 | 인터랙션 모델 | 컴포넌트 |
|---|---|---|---|---|---|
| 1 | 헤더(브레드크럼+제목+우측 링크) + 필터바(DB 탭/장치/날짜/통화) + 페이지 탭바 | 전체 | 01 | 클릭(탭·드롭다운) | `OrganicHeader`, `OrganicFilterBar`, `OrganicPageTabs` |
| 2 | KPI 행: 키워드/트래픽/트래픽 비용/브랜드 트래픽/비브랜드 트래픽 (스파크라인 포함) | 1085 | 02 | 정적+hover 툴팁 | `OrganicKpiRow` |
| 3 | 자연 키워드 추세 (스택 바 차트, 범례 체크박스, 기간 필) | 1085 | 03 | 클릭(체크박스·기간 필) | `OrganicTrendChart` |
| 4 | 상위 키워드 (세그먼트 탭 3종 + 테이블 + 모두 보기) | 534 | 04 | 클릭(세그먼트 전환) | `TopKeywordsCard` |
| 5 | 의도별 키워드 (분포 바 + 의도 테이블) | 534 | 05 | 정적+링크 | `IntentKeywordsCard` |
| 6 | 자연 검색 상위 포지션 변동 (신규/누락/상승/하락 세그먼트 + 빈 상태) | 534 | 06 | 클릭(세그먼트) | `PositionChangesCard` |
| 7 | SERP 구성 요소 상위 포지션 변동 (신규/누락 + 빈 상태) | 534 | 07 | 클릭(세그먼트) | `SerpPositionChangesCard` |
| 8 | SERP 구성 요소 트렌드 (3색 라인 차트 + 체크박스 + 기간 필) | 1085 | 08 | 클릭(체크박스·기간 필) | `SerpTrendsChart` |
| 9 | SERP 구성 요소 그리드 (도메인으로 연결됨/연결되지 않음 2그룹 × 아이콘+키워드 수) | 1085 | 09 | 정적+링크 | `SerpFeaturesGrid` |
| 10 | 상위 페이지 (URL 테이블) | 534 | 10 | 정적+링크 | `TopPagesCard` |
| 11 | 상위 서브도메인 (테이블) | 534 | 11 | 정적+링크 | `TopSubdomainsCard` |
| 12 | 주요 자연 경쟁자 (경쟁 수준 바 테이블) | 534 | 12 | 정적+링크 | `CompetitorsCard` |
| 13 | 경쟁 포지셔닝 지도 (버블 차트 + 범례) | 534 | 13 | hover 툴팁 | `PositioningMapCard` |

## 원본 DOM 추출물

- 카드별 computed-style 트리: `docs/research/extract/*-full.json` (13개)
- 헤더 영역: `extract/header-filter-tabbar-full.json`

## SEMForge 통합 방침

- 페이지: 기존 `/analytics/organic/overview/` (`src/app/(app)/analytics/organic/overview/page.tsx`) 유지, `OrganicResearchDashboard`를 신규 섹션 컴포넌트 조합으로 재작성.
- 신규 컴포넌트 위치: `src/components/analytics/organic/`.
- 데이터: `getDomainAnalytics` 실데이터(serp_snapshots) 유지. 원본에 있으나 데이터가 없는 지표(브랜드 트래픽, 의도, SERP 구성 요소 등)는 SEMForge 데이터 원칙대로 정직한 빈/미제공 상태로 렌더 (가짜 숫자 금지).
- 차트: recharts (기존 의존성) 사용, 원본 SVG 팔레트 재현.
- 빈 상태 일러스트: Semrush 에셋을 복사하지 않고 유사한 느낌의 자체 제작 미니 SVG 사용.
