# BEHAVIORS — 공개 사이트 인터랙션 스윕 (2026-07-27)

## 전역

- 스크롤 라이브러리 없음 (Lenis/Locomotive 미사용, 네이티브 스크롤)
- 트랜지션 기본값: 200ms ease-in-out (--mp-transition-*)

## TopBanner + GlobalHeader

- 배너(36px, #c190ff)는 일반 흐름 — 스크롤하면 사라짐
- 헤더는 sticky top 0, z-index 500, 높이 84px 고정
- 스크롤 0: 배경 oklab(0.9349…) ≈ #dceeeb / 스크롤 400: oklab(0.9628…) ≈ 밝아짐. 그림자 없음, 높이 변화 없음
- 메가메뉴: 데스크톱 hover 트리거, 패널은 lazy 렌더(초기 DOM에 없음). 클릭도 동작. 패널: 흰 카드, 그룹 컬럼 + 우측 프로모 카드
- 모바일(390px): 로고+버거만. 버거 → 전면 드로어(뒤로/로고/닫기 헤더 70px, 1단계 메뉴 리스트 → 서브패널 단계 이동)

## 홈 섹션 인터랙션

- 히어로 폼: 도메인 입력 + 국가 선택(listbox) + Get insights (제출 시 signup 유도)
- 로고 월: marquee(무한 수평 스크롤 애니메이션), 로고 12종 반복 2벌
- 툴킷 슬라이더(SOLUTIONS 9): Prev/Next 버튼 클릭 슬라이드, 카드 내 Expand 버튼(카드 상세 열림), aria-live polite
- 리소스 슬라이더(RESOURCES 9): 동일 슬라이더 패턴
- 섹션 등장: `.section-in-view` 클래스 토글(IntersectionObserver) — 히어로에서 관찰됨. fade/translate 등장 효과
- 프로모 카드 비디오: hero 데모 영상 autoplay/loop/muted, 프로모 카드 포스터+hover 재생

## 푸터

- 데스크톱: 6그룹 다열 정적, 그룹 제목은 button 태그(모바일 아코디언 겸용)
- 모바일: 그룹별 아코디언 접힘/펼침
- 언어 선택: 12개 언어 리스트
- Cookies Settings / Do not sell → 동의 설정 모달(window.showConsentSettings)

## PUB-AUTH (signup 관찰)

- 최소 헤더(로고 + Terms/Privacy/Log in 링크), 중앙 카드
- H1 "Create your account" Lazzer 26px 600
- 이메일/비밀번호 input 38-40px, "Create account" 버튼: 다크(oklch 0.23), radius 6px, 40px — 앱 디자인 시스템(마케팅 pill과 다름)
- "or" 구분선, 소셜 로그인(구글 등) 아이콘 버튼

## 앱 셸 (로그인 후 — 세션 확보 시 갱신 예정)

- /home/ 비로그인 → 공개 홈 리다이렉트 확인 (인벤토리와 일치)
