# PAGE TOPOLOGY — ko.semrush.com/seo/30605634/ (SEO 대시보드)

> 측정: 2026-07-29, 1440×900 (DPR 1), 로그인 상태(프로젝트: 맥킨지 코리아 / mckinsey.co.kr)
> 주의: 초기 SSR은 랜딩형 카드(내 도구/새로운 기회)로 렌더되다가, 하이드레이션 후 **위젯 대시보드**로 대체된다. 클론 대상은 하이드레이션 후의 위젯 대시보드다.

## 전체 구조

```
body (bg #ffffff, Inter 12px/400 rgb(51,51,51))
└─ div.srf-layout
   ├─ header.snav-header                1425×53, bg rgb(244,245,245), position: relative (sticky 아님)
   │   └─ 전역 검색 + 가격책정/엔터프라이즈/더보기/언어/아바타
   ├─ snav-sidebar (웹 컴포넌트, shadow DOM)  77px 고정 아이콘 레일 (호스트 w=0, 내부 fixed)
   └─ div.srf-layout-main-content-wrapper  bg rgb(244,245,245)
      └─ main.srf-layout__body           x=0, y=53, w=1425
         └─ div (Inter 14px/20 oklch(0.1 0.03 137 / 0.899))
            ├─ [H] section.seo_d_header  padding 16px 20px, maxWidth max(100% - 14px, 1030px), h=143
            │   ├─ 행1: "프로젝트" 라벨 + 피드백 보내기 버튼 (space-between, h=26)
            │   └─ 행2: "SEO 대시보드: 맥킨지 코리아" (h1급 20px/600) + 프로젝트 pill(맥킨지 코리아 ⌄)
            │         + SEO 프로젝트 만들기 버튼 + 공유 버튼 + 설정 열기 아이콘 (gap 12, h=77)
            ├─ divider (1px, color(display-p3 0.00798 0.04498 0.03219 / 0.161)) y=196
            └─ div.seo_d_widgetsLayout     display: grid, gridTemplateColumns: 322.25px ×4, gap: 24px
                                          padding: 16px 18px 76px 32px, maxWidth max(100% - 14px, 1030px)
               ├─ [W1] AI 검색        widgetMedium 669×285 (2열 span), y=213
               ├─ [W2] SEO            widgetMedium 669×285 (2열 span), y=213
               ├─ [W3] 포지션 추적     widgetSmall + Secondary 322×224, y=522
               ├─ [W4] 사이트 진단     widgetSmall + Secondary 322×224, y=522
               ├─ [W5] 온페이지 SEO    widgetSmall + Secondary 322×224, y=522
               ├─ [W6] 백링크 진단     widgetSmall + Secondary 322×224, y=522
               ├─ [W7] 자연 트래픽 인사이트  widgetSmall + Secondary 322×224, y=770 (홀수 행 1개)
               ├─ [W8] Traffic Analytics   widgetBig 1361×634 (전폭), y=1018
               ├─ [W9] 자연검색 순위   widgetStandard 669×606, y=1676
               ├─ [W10] 백링크         widgetStandard 669×606, y=1676
               ├─ [W11] Google 서비스 연결하기  widgetBig + Stub 1361×304, y=2306
               ├─ [W12] 숨겨진 위젯    widgetStandard + Stub 1361×213, y=2634
               └─ [W13] seo_d_suggestWidget 1361×20, y=2863 ("위젯 제안" 링크)
```

## 위젯 카드 공통 스타일

- `section.seo_d_widget_*`: bg #fff, radius 8px, padding `8px 20px 20px`(big/stub은 20px)
- shadow: `color(display-p3 0.01753 0.08157 0.06372 / 0.07) 0 0 1px, ... 0 1px 3px`
- overflow hidden (일부 visible), position relative
- 호버: **변화 없음** (shadow/transform 동일 — 정적 카드)

## 인터랙션 모델 (요약 — 상세는 BEHAVIORS.md)

| 요소 | 모델 |
|---|---|
| 페이지 스크롤 | 일반 문서 스크롤 (snap 없음, Lenis 없음, 헤더 relative) |
| 카드 | 정적 (호버 변화 없음) |
| 차트 | SVG 66개 (canvas 0). 고해상도 SVG 차트 + "탭을 누르면 접근성 모듈" 안내 |
| 위젯 설정(⌄) | 클릭 → 드롭다운 (루트 도메인/국가/기기/기간 선택) |
| Traffic Analytics "Semrush 데이터/Google 데이터" | 클릭 전환 (role=tab 아닌 커스텀) |
| 설정 버튼(보조 위젯) | 해당 도구 설정 페이지로 이동 |
| 설정 열기 아이콘(헤더) | 위젯 편집 모달 |

## 반응형

- 390px: 섹션 카드들이 가로 스크롤 캐러셀로 전환 (좌/우 버튼 + 도트 페이지네이션 — 추천 앱 영역)
- 1440px: 4열 그리드. 위젯 medium=2열, small=1열, big/standard=전폭~2열

## 클론 데이터 매핑

| 위젯 | 클론 데이터 소스 |
|---|---|
| W1 AI 검색 | 원천 없음 → 데모 표기 mock |
| W2 SEO (AS/순위/유료/자연) | domain-overview API 실측(authorityScore, organicTraffic+trend) + 미보유 필드는 데모 표기 |
| W3~W7 보조 위젯 | 정적 설명 + 각 도구 링크 (실재) |
| W8 Traffic Analytics | domain-overview 실측(visits/uniqueVisitors/pagesPerVisit/bounceRate+trend) + 체류시간 데모 |
| W9 자연검색 순위 | 실측 trend(organicTraffic) 면적 차트 + 포지션 변동은 스냅샷 기반 계산 또는 데모 |
| W10 백링크 | 실측 backlinks/referringDomains + firstSeenAt 월별 누적 + refDomainsByAuthority |
| W11/W12 스텁 | 정적 |
