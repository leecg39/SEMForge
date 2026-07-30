# AppRail Specification

## Overview
- **Target file:** `src/components/crud/CrudShell.tsx` (좌측 레일 부분)
- **Screenshot:** `docs/design-references/ko.semrush.com/app-home-desktop-1440.png`
- **Interaction model:** static (링크 + hover)
- **원본 구현:** `<snav-sidebar>` 웹 컴포넌트 + `<snav-sidebar-ribbon-item>` (shadow DOM).
  클론은 일반 DOM 으로 같은 시각 결과를 재현한다.

## DOM Structure
```
aside (레일 컨테이너, w=77)
└─ a (항목) × 11        64×64, x=6
   ├─ svg              24×24
   └─ span (라벨)      12px / 16px
```
그룹 구분: `[홈페이지, SEO, AI, 트래픽 & 시장]` `[지역, 콘텐츠, 광고, AI PR, 소셜]` `[보고서, App Center]`

## Computed Styles (getComputedStyle 실측)

### 컨테이너
- width: `77px`
- height: `100%` (뷰포트 전체)
- background-color: `rgba(0, 0, 0, 0)` — 투명. 뒤의 `rgb(244,245,245)` 가 비침
- border-right: **없음** (`0px none`)
- position: 좌측 고정 열

### 항목 (a)
- width: `64px`, height: `64px` (2줄 라벨은 `80px`: 트래픽 & 시장, App Center)
- x: `6px` (좌우 6px 인셋)
- border-radius: `6px`
- padding: `10px 4px`
- gap: `4px`
- display: `flex`, flex-direction: `column`, align-items: `center`, justify-content: `center`
- text-align: `center`
- font-size: `12px`, font-weight: `500`, line-height: `16px`
- 아이콘: `24×24`

### 항목 y 좌표 (실측)
`6, 74, 142, 210(h80), 305, 373, 441, 509, 577, 656, 724(h80)`
- 일반 간격: `4px` (64 + 4 = 68 스텝)
- 그룹 간격: `15px` (트래픽 & 시장 뒤, 소셜 뒤)

### 상태별 색
| 상태 | background | 라벨 color |
|---|---|---|
| 활성 (홈페이지) | `rgb(227, 227, 227)` | `rgba(0, 3, 0, 0.584)` |
| 기본 | `transparent` | `rgba(0, 4, 1, 0.525)` |
| hover | 옅은 회색 채움 | 기본과 동일 |

항목 자체의 `color` 는 활성 `rgba(1, 5, 0, 0.898)` / 기본 `rgba(0, 3, 0, 0.584)`.

## 항목 목록 (라벨 · 링크)
| 라벨 | href |
|---|---|
| 홈페이지 | `/home/?fid=<id>` |
| SEO | `/seo/?fid=<id>` |
| AI | `/ai-seo/overview/?fid=<id>` |
| 트래픽 & 시장 | `/analytics/traffic/?fid=<id>` |
| 지역 | `/local-business/?fid=<id>` |
| 콘텐츠 | `/content/?fid=<id>` |
| 광고 | `/advertising/?fid=<id>` |
| AI PR | `/pr-toolkit/?fid=<id>` |
| 소셜 | `/social-media/?fid=<id>` |
| 보고서 | `/my_reports/grid/?fid=<id>` |
| App Center | `/apps/?fid=<id>` |

폴더 컨텍스트(`fid`)가 모든 링크에 전파된다.

## Responsive Behavior
- **1440px:** 레일 노출, 콘텐츠 x=109
- **768px 이하:** 레일 `display:none`, 콘텐츠 x=32
- 클론은 레일을 숨기는 대신 상단 가로 스크롤 탭으로 대체한다 (원본은 햄버거 드로어 — 다른 점으로 기록)

## States & Behaviors
- 활성 항목은 현재 경로로 판정. 배경 `rgb(227,227,227)` + radius 6px.
- 전환 효과: 원본에서 별도 transition 미검출 (즉시 적용).
