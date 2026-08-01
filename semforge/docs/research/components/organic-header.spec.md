# OrganicHeader + OrganicFilterBar + OrganicPageTabs 명세

## 개요
- 대상 파일: `src/components/analytics/organic/OrganicHeader.tsx` (3개 컴포넌트 export)
- 스크린샷: `docs/design-references/semrush-organic/01-header-filter-tabbar.png` (좌측 ~208px 사이드바는 AppShell 소유 — 무시)
- 인터랙션 모델: 클릭(페이지 탭·DB 탭·드롭다운 트리거). sticky 아님.
- 원본 DOM: `docs/research/extract/header-filter-tabbar-full.json`

## 구조 (위→아래)
1. **브레드크럼 행** (상단 패딩 16px): `홈페이지 > SEO > 도메인 개요 > 자연검색 순위`
   - 링크: 12px, 색 rgba(0,3,0,0.584), hover 밑줄. 구분자 `>` 같은 색. 현재 항목(자연검색 순위)은 링크 아님.
   - 우측 정렬 링크 2개: `사용자 매뉴얼`(책 아이콘), `피드백 보내기`(말풍선 아이콘) — 12px, 색 rgb(35,95,226), 아이콘 16px.
2. **제목 행** (마진 상 8px):
   - h1: `자연검색 순위: {domain}` — 20px/600, 색 rgba(1,5,0,0.898). 도메인 뒤 외부링크 아이콘(14px, 회색, hover 파랑) = 실제 도메인 새 탭 링크.
   - 우측: `PDF로 내보내기` 아웃라인 버튼 — 높이 28px, radius 6px, 보더 1px rgba(0,12,8,0.16), 흰 배경, 14px 검정, 좌측 내보내기(업로드 화살표) 아이콘 16px. hover: 배경 rgba(0,22,16,0.027).
3. **필터바 행** (마진 상 12px, 요소 간 24px):
   - **DB 세그먼트**: organic-ui `OrganicSegmented` 재사용하되 커스텀 라벨: 국기(16px 인라인 SVG) + 코드(`KR`) + 카운트(회색 12px). 마지막에 `⋯` 버튼(같은 그룹 스타일). 국기: 자체 제작 단순 SVG(태극기/성조기/유니언잭 단순화 16×12px) — 외부 스프라이트 금지.
   - **장치**: 라벨 `장치:` 12px 회색 + 트리거(모니터 아이콘 + `데스크톱` + 파란 캐럿) — 값 부분 색 rgb(35,95,226), 13.33px.
   - **날짜**: 라벨 `날짜:` + 값 `2026년 7월 31일`(파랑) + 캐럿.
   - **통화**: 라벨 `통화:` + 값 `USD`(파랑) + 캐럿.
   - 드롭다운 실동작: 장치만 데스크톱/모바일 선택 가능(콜백), 날짜·통화는 트리거만(비활성 메뉴 or 무동작).
4. **페이지 탭바** (마진 상 16px, 하단 전폭 보더 1px rgba(0,12,8,0.16)):
   - 탭: `개요` `포지션` `포지션 변경` `경쟁자` `주제` `서브도메인` — button[role=tab], 높이 40px, 13.33px/500, 색 rgba(1,5,0,0.898), 탭 간 가로 간격 32px.
   - 활성(개요): 하단 3px 바 rgba(0,40,230,0.42), bottom -1px (보더 위 겹침).
   - 비활성 hover: 글자 파랑 계열 틴트.

## Props
```ts
// OrganicHeader
{ domain: string; domainHref: string; onExportPdf?: () => void; copy: HeaderCopy }
// OrganicFilterBar
{ databases: Array<{ code: string; label: string; count: number }>; activeDb: string;
  onDbChange: (code: string) => void; device: "desktop" | "mobile";
  onDeviceChange: (d: "desktop" | "mobile") => void; dateLabel: string; currency: string; copy: FilterCopy }
// OrganicPageTabs
{ tabs: Array<{ key: string; label: string }>; active: string; onChange?: (key: string) => void }
```

## 카피 (ko/en 오케스트레이터 제공, 컴포넌트는 copy prop 사용)
- ko: 홈페이지/SEO/도메인 개요/자연검색 순위/사용자 매뉴얼/피드백 보내기/자연검색 순위:/PDF로 내보내기/장치:/데스크톱/모바일/날짜:/통화:
- en: Home/SEO/Domain Overview/Organic Research/User manual/Send feedback/Organic Research:/Export to PDF/Device:/Desktop/Mobile/Date:/Currency:

## 정직성
- 날짜 = 실제 최신 스냅샷 시각(오케스트레이터 제공 문자열). 데이터 없으면 `—`.
- DB 카운트 = 실측 키워드 수. 미수집 국가는 0.
