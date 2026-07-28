# ToolkitPromoCarousel + AppFooter Specification

## ToolkitPromoCarousel

### Overview
- **Target file:** `src/components/crud/ToolkitPromoCarousel.tsx` (신규)
- **Screenshot:** `docs/design-references/ko.semrush.com/app-home-desktop-1440.png`
- **Interaction model:** click (우측 `›` 버튼으로 슬라이드)

### 섹션 (실측)
- x: `109`, y: `77`, width: `1299`, height: `130`
- display: `flex`, gap: `24px`
- 카드 5장 노출 + 우측 원형 다음 버튼

### 카드
- width: `248px`, height: `128px`
- background: `rgb(255, 255, 255)`
- border-radius: `8px`
- border: 없음
- box-shadow: `rgba(0,21,16,0.07) 0px 0px 1px 0px, rgba(0,21,16,0.07) 0px 1px 3px 0px`
- x 좌표: `110, 366, 622, 878, 1134` (스텝 256 = 248 + gap 8… 실제 gap 은 flex `24px`, 관측 스텝 256)

카드 내부:
- 아이콘 `32×32` (원본은 `static.semrush.com/recommendations/widget_icons/*.svg`)
- 제목: `14px / 500`, color `rgba(1, 5, 0, 0.898)`, line-height `19.88px`
- 설명: `14px / 400`, color `oklch(0.088 0.026 147.7 / 0.583)`, line-height `19.88px`

### 카드 내용 (원문 그대로)
| 제목 | 링크 | 설명 |
|---|---|---|
| 지역 | `/local-business/` | 리뷰를 관리하고, 로컬 검색 가시성을 높이고, 로컬 경쟁자를 추적하세요. |
| 콘텐츠 아이디어 | `/content/` | AI와 경쟁 데이터를 활용해 SEO 친화적인 콘텐츠를 만들어 보세요. |
| 광고 | `/advertising/` | 경쟁자를 조사하고, Google 광고와 Meta 광고를 시작하고 최적화하세요. |
| AI PR | `/pr-toolkit/` | LLM에서의 브랜드 가시성을 좌우하는 언론 노출을 확보하세요. |
| 소셜 | `/social-media/` | 생성, 예약, 분석까지 소셜 미디어의 전체 사이클을 관리하세요. |

아이콘은 원본 URL 을 그대로 쓰지 않고 로컬 SVG 로 대체한다 (자산 정책).

---

## AppFooter

### Overview
- **Target file:** `src/components/crud/AppFooter.tsx` (신규)
- **Interaction model:** click (언어 드롭다운)

### 컨테이너 (실측)
- x: `77`, y: `784`, width: `1363`, height: `116`
- background: `rgb(244, 245, 245)`
- padding: `24px 32px`
- gap: `12px`
- display: flex column (2행)

### 1행 (y=808~840)
좌측 링크 (`14px`, color `rgb(108, 110, 121)`, height 24):
- `문의하기` x=109
- `회사 정보` x=177
- `블로그` x=250
- `한국어` x=306 (아이콘 + 드롭다운, padding `0 18px 0 22px`)

우측 버튼 (height 32, radius 6px, padding `3px 12px`, `14px`):
- `요금제 및 가격 보기` x=1128 — bg `rgba(138,142,155,0.1)`, border `1px solid rgb(196,199,207)`, color `rgb(108,110,121)`
- `Semrush 시작하기` x=1271 — bg `rgb(0,170,125)`, border `1px solid rgb(0,170,125)`, color `rgb(255,255,255)`

### 2행 (y=852~876)
좌측 링크 (`14px`, color `rgb(108,110,121)`):
- `쿠키 설정` x=109
- `법률 정보` x=181
- `개인정보처리방침` x=254
- `내 개인 정보를 판매하지 마세요` x=371

우측: `© 2026 Semrush Holdings. All rights reserved.` (x=1099)

### 언어 드롭다운 항목
English / Deutsch / Español / Français / Italiano / Nederlands / Polski / Português (Brasil) /
Svenska / Tiếng Việt / Türkçe / 中文 / 日本語 / 한국어 — 각 `14px`, padding `7px 9px`

---

## 기타 섹션

### 모니터링할 도메인 아코디언
- x=109, y=519, `1299×44`, 배경 투명
- 텍스트 `모니터링할 도메인` + 우측 `Open` 토글

### 피드백 전송
- x=109, y=587, `12px`, color `oklch(0.1 0.03 137 / 0.899)`, 말풍선 아이콘 + 밑줄
