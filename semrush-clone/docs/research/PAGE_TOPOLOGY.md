# PAGE TOPOLOGY — Semrush 공개 홈 (PUB-001)

레이아웃: TopBanner(36px) → GlobalHeader(sticky 84px) → main 섹션들 → Footer CTA → Footer nav → legal

| # | 섹션 | 클래스 | 높이(1440px) | 배경 | 비고 |
|---|---|---|---|---|---|
| 1 | Hero | .mp-hero | ~1325px | pattern-hero.svg repeat-x + hero-gradient | H1 84px, 서브 18px, 폼, 제품 데모 비디오(autoplay), padding-top 64px |
| 2 | Logo marquee | .mp-logo-marquee | 180px | 투명 | 로고 12종 x2 무한 스크롤, 로고 높이 ~28px(natural 100) |
| 3 | Promo: Semrush One | .mp-promo-block__card--semrush-one | 569px | #c190ff | 좌 텍스트+CTA, 우 영상 포스터(sem_one.webp), padding 56px, radius 카드 |
| 4 | Promo: MCP | .mp-promo-block__card--semrush-mcp | 569px | #f3f6f6 | "Ask AI. Get Semrush data." + sem_mcp.webp |
| 5 | Promo: Enterprise | .mp-promo-cards.mp-enterprise | 620px | enterprise_bg.webp | "Bigger scale. Bigger advantage." + Book a demo |
| 6 | Toolkits slider | .mp-section.mp-toolkits.mp-slider | 932px | 흰색 | 라벨 "SOLUTIONS (9)", 헤딩 "GET SEEN...", 카드 430x500 민트+패턴, 9장, Prev/Next |
| 7 | Stats | .mp-section.mp-stats | 1407px | 다크 블록 | 5개 스탯(28B/43T/808M/142/289M+), 숫자 Lazzer 180px 500 white ls -10.8px, Learn more |
| 8 | AI Visibility Index | .mp-section.mp-ai-visibility-index | 1382px | #181e15 + pattern | 다크 섹션, 브랜드 언급 테이블 10행, Explore CTA |
| 9 | Testimonials | .mp-client-testimonials | 704px | 흰색 | ZoomInfo 후기 + +373% 스탯 카드(패턴 배경) |
| 10 | Resources slider | .mp-section.mp-resources.mp-slider | 953px | 흰색 | 라벨 "RESOURCES (9)", 카드 9장(이미지+제목+설명+태그) |

공통: 섹션 패딩 120px 상하(--mp-vertical-padding), 컨테이너 max 1440px + 32px 인라인 패딩.
섹션 라벨 패턴: 소형 uppercase 라벨(h2) + 대형 uppercase 헤딩(h3, 48~64px)
z-index: 헤더 500, 드로어/모달 600+

## 공개 페이지 셸 공통 구조 (모든 PUB-* 템플릿)

TopBanner + GlobalHeader + [템플릿 본문] + FooterCTA + FooterNav

## 앱 셸 구조 (로그인 후 확정 예정)

앱 헤더(로고/검색/Pricing/More/Profile) + 좌측 AppGlobalNav(11 툴킷) + ToolkitSideNav + 작업 캔버스
