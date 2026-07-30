# AppTopBar Specification

## Overview
- **Target file:** `src/components/crud/CrudShell.tsx` (헤더 부분)
- **Screenshot:** `docs/design-references/ko.semrush.com/app-home-desktop-1440.png`
- **Interaction model:** click (검색 드롭다운, 더보기 메가메뉴, 프로필 메뉴)

## Computed Styles (실측, 1440px)

### 헤더 컨테이너
- height: `53px`
- background-color: `rgb(244, 245, 245)`
- border-bottom: **없음** (`0px none`)
- wrapper padding: `0 32px`
- position: `relative` (sticky 아님 — 이 페이지는 스크롤 없음)

### 전역 검색
- x: `110`, y: `11`, width: `515`, height: `30`
- placeholder: **"작업, 웹사이트 또는 키워드를 입력하세요"**
- font-size: `14px`
- color: `rgba(1, 5, 0, 0.898)`
- background: 투명 (래퍼가 흰 배경)
- padding: `0 8px 0 12px`
- 검색 버튼: 입력 우측에 붙은 어두운 사각 버튼 (스크린샷 기준 약 `32×30`, 어두운 배경 + 흰 돋보기)

검색 시작 x=110 은 레일 77 + 패딩 32 와 정렬된다.

### 우측 유틸리티
| 항목 | x | width | height | font-size | color | padding | radius |
|---|---|---|---|---|---|---|---|
| 가격 책정 | 1111 | 76 | 32 | 14px | `oklch(0.1 0.03 137 / 0.899)` | `9px 12px` | 6px |
| 엔터프라이즈 | 1191 | 97 | 32 | 14px | 동일 | `9px 12px` | 6px |
| 더보기 (⌄) | 1292 | 80 | 32 | 14px | 동일 | `9px 12px` | 6px |
| 아바타 `L` | 1376 | 32 | 32 | 14px | — | `9px 4px` | 6px |

- 배경은 모두 투명, font-weight `400`
- 아바타는 보라색 원형 (스크린샷 기준), 이니셜 흰색

## States & Behaviors

### 프로필 메뉴 (아바타 클릭)
항목: `내 프로필 • ID:<번호>` / `구독 정보` / `사용자 관리` / `로그아웃`
- 각 항목 font-size `14px`, padding `7px 9px`

### 더보기 메가메뉴
가격 책정 / 솔루션 / 기능 / 블로그 / 리소스 / 지원 센터 / 새로운 소식 / 웨비나 / 인사이트 /
신뢰할 수 있는 에이전시 찾기 / 아카데미 / 상위 웹사이트 / AI 가시성 지수 / 로컬 마케팅 허브 /
회사 정보 / 뉴스룸 / … / Semrush API / Semrush MCP / 문서 등 다수

### 스크롤 동작
없음. 이 페이지는 문서 높이가 뷰포트와 같아 스크롤이 발생하지 않는다.

## Responsive Behavior
- **1440px:** 위 배치 그대로
- **390px:** 햄버거 + 아바타만 남고 전역 검색이 헤더 아래 별도 전체폭 행으로 이동

## Typography
- 앱 전역 폰트: `Inter, sans-serif` (Google Fonts)
- body 기본: `12px`, color `rgb(51,51,51)`
- 헤더 유틸리티: `14px / 400`
