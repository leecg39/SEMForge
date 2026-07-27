# Public Shell Specification (TopBanner / GlobalHeader / PublicFooter)

## Overview
- Target files: `src/components/shell/TopBanner.tsx`, `src/components/shell/GlobalHeader.tsx`, `src/components/shell/PublicFooter.tsx`, `src/app/(public)/layout.tsx`
- Interaction model: 헤더 메가메뉴 = 데스크톱 hover-driven + 클릭 토글, 모바일 = 드로어(클릭). 푸터 그룹 = 데스크톱 다열 정적, 모바일 아코디언.
- 데이터 소스: `src/data/nav.ts` (topBanner, headerMenus, footerGroups, footerSocial, footerCta, footerLegal, footerLanguages), 아이콘: `src/components/shell/icon-data.ts`

## TopBanner (.srf_top_banner)
- 높이 36px, backgroundColor `#c190ff` (--mp-lavendar), 전체가 signup 링크
- 텍스트: "TRY SEMRUSH ONE FOR FREE" (Lazzer 14px 600) + "The unified SEO and AI search solution" (14px 400), 가로 중앙, gap ~8px, padding 8px 16px
- hover 시 배경 `#b072ff` (--mp-lavendar-hover), transition 200ms ease-in-out

## GlobalHeader (header)
- position: sticky; top: 0; z-index: 500; height 84px
- 배경: `#dceeeb`(mint 계열, oklab(0.9349...) ≈ --mp-mint). 스크롤 시 배경이 미묘하게 밝아짐(oklab 0.9628) — 구현: 배경을 `--mp-mint`로 두고 스크롤>50px에서 `#eaf4f2`로 전환, transition all 200ms
- 내부 컨테이너: max-width 1440px, padding-inline 32px, 좌: 로고, 중: 메뉴, 우: 버튼
- 로고: 150x36px (icon-data.ts logoDataUri, `<img>` 또는 background)
- 메뉴 항목(버튼/링크): Lazzer 16px/19.2px 600, letter-spacing -0.32px, color #181e15, padding 4px 8px, border-radius 10px, hover 시 배경 rgba(0,0,0,0.06)
- 메뉴 순서: Product(드롭다운) · Pricing(/pricing/) · Solutions(드롭다운) · Resources(드롭다운) · Enterprise(외부 https://enterprise.semrush.com/ → /ext/enterprise.semrush.com/)
- Log In 버튼: pill(radius 100px), border 1px solid #181e15, padding 16px 24px, Lazzer 16px 600, 투명 배경, hover 배경 rgba(0,0,0,0.05)
- Sign Up 버튼: pill, 배경 #181e15, 흰 텍스트, padding 16px 24px, hover 살짝 밝게(#2a2f27)

### 메가메뉴 드롭다운
- 트리거: 데스크톱 hover(마우스엔터로 열림, 벗어나면 닫힘) + 키보드 접근용 클릭 토글
- 패널: 헤더 아래 풀폭 중앙 정렬 카드. 배경 #fff, border-radius 24px, box-shadow 0 2px 12px rgba(0,0,0,0.05)+0 12px 40px rgba(0,0,0,0.08), padding 40px, max-width ~1376px
- 레이아웃: N개 그룹 컬럼(grid, gap 32px) + 우측 프로모 카드 1개
- 그룹 heading: Lazzer 14px 600 uppercase 회색(#6c6e79) 하단 여백 12px
- 그룹 링크: Lazzer 16px 500 #181e15, padding 6px 0, hover 색 #6c6e79
- 프로모 카드: 배경 --mp-product-gradient(linear-gradient(180deg,#dceeeb,#eee9ff)), radius 16px, padding 24px, 타이틀 Lazzer 18px 600 + 설명 14px, 전체 링크
- 데이터: nav.ts의 productMenu/solutionsMenu/resourcesMenu (groups[].heading/links, promo)
- 등장 애니메이션: opacity 0→1 + translateY(-8px→0) 200ms ease-in-out

### 모바일 (~1024px 미만)
- 로고 + 버거 버튼(burgerDataUri)만 표시. 버거 클릭 → 전면 드로어(배경 #fff, 헤더 70px: 뒤로/로고/닫기)
- 1단계 리스트: Product/Pricing/Solutions/Resources/Enterprise (33px 행) + 하단 Log In/Sign Up 버튼(48px, 풀폭 pill)
- Product/Solutions/Resources 탭하면 그룹 리스트로 단계 이동(뒤로 버튼)

## PublicFooter (.srf-footer)
- 상단 CTA 밴드: heading "GET STARTED WITH SEMRUSH TODAY" — Lazzer 48px/48px 600, letter-spacing -1.92px, uppercase, 아래 "Try Semrush free for seven days. Cancel anytime." 16px. 버튼 "Start free trial": pill, 배경 #c190ff, padding 21px 30px(높이 58px), Lazzer 16px 600 #181e15, hover #b072ff
- 본문: 배경 #fff, 6그룹 다열(데스크톱 6열 grid, gap 32px; 태블릿 3열; 모바일 아코디언)
- 그룹 제목: Lazzer 16px 600 #181e15, 아래 여백 31px. 모바일에서는 버튼(아코디언 토글, chevron)
- 링크: Lazzer 14px 500 #181e15, padding 6px 0, line-height 19.6px, hover #6c6e79
- 소셜 아이콘 행: 6개 (socialIconDataUris), 24px, gap 16px
- 언어 선택 버튼: "English" + globe/check 아이콘, 클릭 시 12개 언어 리스트(정적 UI)
- 하단: Adobe 로고(adobeLogoDataUri, 62x15) + "© 2026 Semrush Holdings. All rights reserved." 14px #6c6e79 + Privacy Policy / Terms of Service / Cookies Settings 링크
- Cookies Settings 클릭 → CookieConsentModal 열기 이벤트(전역 window CustomEvent 'open-cookie-settings' 디스패치만; 모달은 추후 별도 컴포넌트)

## (public) 레이아웃
- `src/app/(public)/layout.tsx`: <TopBanner/> + <GlobalHeader/> + {children} + <PublicFooter/>
- 배너는 스크롤 시 함께 스크롤되어 사라짐(스티키 아님). 헤더만 sticky top 0.

## 검증
- `npx tsc --noEmit` 통과 필수. 클라이언트 인터랙션 컴포넌트는 "use client".
