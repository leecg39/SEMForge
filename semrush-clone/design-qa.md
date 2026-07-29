# 광고 랜딩 Design QA

- Source visual truth: `/Users/user01/Desktop/SEMRUSH/광고.png`
- Implementation URL: `http://localhost:3000/advertising/`
- Implementation screenshot: `.design-qa/advertising-dashboard-final.png`
- Full-view combined comparison: `.design-qa/advertising-comparison-full.png`
- Focused comparisons: `.design-qa/advertising-comparison-top.png`, `.design-qa/advertising-comparison-features.png`, `.design-qa/advertising-comparison-lower.png`
- Responsive evidence: `.design-qa/advertising-mobile.png`
- Viewport: 1904 × 947 CSS px, deviceScaleFactor 1
- State: Korean locale, desktop shell, initial/default landing state, development overlays hidden only for visual capture

## Normalization

- Source pixels: 1904 × 6029.
- Implementation pixels: 1889 × 5259. The 15 px width difference is the desktop scrollbar area.
- The source was proportionally normalized from 1904 px to 1889 px wide, producing 1889 × 5982 px. The implementation remained at native density.
- Full comparison pixels: 3778 × 5982, with source on the left and implementation on the right. The shorter implementation is placed on a white canvas without stretching.
- Focused comparisons use equal 1889 px-wide crops from the actual source and implementation. They cover the hero/discovery panel, alternating feature sections, and testimonial/FAQ/final CTA regions.

## Findings

- No actionable P0, P1, or P2 differences remain.
- [P3] The implementation is about 12% shorter than the normalized reference because its feature copy and footer whitespace are more compact. Section minimum heights and gaps were increased in the final pass, and the remaining difference does not change hierarchy, order, or task usability.
- [P3] The shared application header and toolkit navigation retain the clone's current labels and controls instead of reproducing the older header variant visible in the source. This is an intentional shell-level consistency constraint.

## Full-view comparison evidence

`.design-qa/advertising-comparison-full.png` confirms the same major composition: dark navy hero, raised lavender discovery panel, ROI heading, six alternating product stories, testimonial, FAQ, dark final CTA, and footer. The post-fix feature sequence now alternates media/text on the same sides as the source.

## Focused region comparison evidence

- Top: `.design-qa/advertising-comparison-top.png` confirms hero scale, headline hierarchy, purple primary CTA, raised discovery card, domain form, example domains, and a real generated layered-card illustration.
- Features: `.design-qa/advertising-comparison-features.png` confirms the corrected alternating layout, pale blue/yellow/mint surfaces, real interface previews, generated room imagery, and consistent dark secondary CTAs.
- Lower page: `.design-qa/advertising-comparison-lower.png` confirms testimonial proportions, portrait treatment, FAQ rows, and final CTA composition.

## Required fidelity surfaces

- Fonts and typography: the existing product sans-serif stack is retained. The 42 px desktop hero heading, 26–32 px section headings, compact UI labels, weights, line heights, wrapping, and optical hierarchy follow the source without truncation. Mobile heading wrapping remains readable at 390 px.
- Spacing and layout rhythm: the 1040 px content rail, raised discovery panel, 420 px desktop feature minimum height, 48 px feature gaps, 64 px major section gaps, radii, borders, and restrained shadows preserve the source rhythm. There is no horizontal page overflow at 1904, 1024, or 390 px; the mobile toolkit nav intentionally scrolls horizontally.
- Colors and visual tokens: dark indigo hero/final CTA, lavender primary action, off-white page background, and pale blue/yellow/mint feature surfaces map to the reference palette with accessible foreground contrast. No gradients were introduced.
- Image quality and asset fidelity: hero keyboard, discovery cards, room creative, and testimonial portrait are generated raster assets with correct subjects and clean crops. All four loaded successfully at natural width in browser evidence. Radix icons are used for controls; no handcrafted SVG, emoji substitute, or CSS illustration replaces source imagery.
- Copy and content: all app-specific landing copy is coherent in Korean, mirrors the source information architecture, and clearly labels product previews as `예시 화면` so illustrative metrics are not presented as live analytics.

## Comparison history

### Iteration 1 — blocked

- [P2] The six product sections alternated on the opposite sides from the source.
- [P2] The discovery panel replaced the source's layered advertising-card artwork with generic summary cards.
- [P2] Feature spacing was materially denser than the source, shortening the page and weakening its campaign-story rhythm.
- Evidence: `.design-qa/advertising-viewport.png` records the first above-the-fold state; the initial combined comparison was reviewed before the iterative artifact was replaced by the latest required comparison.

### Iteration 2 — blocked

- Fixes: reversed all six feature layouts to match the source sequence and generated `public/images/advertising/discovery-cards.webp` for the discovery panel.
- Post-fix comparison removed the first two P2 findings, but the feature region still remained too compressed.

### Iteration 3 — passed

- Fixes: added a 420 px desktop minimum height to feature sections, increased feature gaps from 32 px to 48 px, and increased the lower page breathing room.
- Post-fix visual evidence: `.design-qa/advertising-comparison-full.png`, `.design-qa/advertising-comparison-top.png`, `.design-qa/advertising-comparison-features.png`, `.design-qa/advertising-comparison-lower.png`.
- No actionable P0, P1, or P2 findings remain.

## Primary interactions tested

- Clicking the `/home/` product card labeled `제품 카드 - 광고` navigates to `/advertising/`.
- Empty domain submission shows `도메인 또는 URL을 입력해 주세요.` and sets `aria-invalid="true"`.
- Example-domain selection fills `semrush.com`; submitting `www.uinus.co.kr` navigates to `/analytics/adwords/positions/?domain=www.uinus.co.kr`.
- Campaign platform selection changes from Google to Facebook & Instagram.
- Optimization action changes from `변경사항 적용` to `적용 완료`.
- Testimonial navigation advances from 1/4 to 2/4 and updates the customer name.
- The first FAQ expands and exposes its answer.
- Tablet 1024 × 768 and mobile 390 × 844 checks found no document-level horizontal overflow.
- Browser console errors checked after the final `/home/` → `/advertising/` flow: none.

## Implementation checklist

- [x] Home advertising card routes to the landing page.
- [x] Screenshot-led landing hierarchy and generated imagery are implemented.
- [x] Primary forms, selectors, carousel, accordion, and CTAs work.
- [x] Desktop, tablet, and mobile layouts are resilient.
- [x] Lint, TypeScript, production build, visual QA, and browser console checks pass.

## Follow-up polish

- [P3] If exact historical screenshot parity becomes a goal, the shared app header variant and remaining footer whitespace can be tuned separately without changing this landing page's core behavior.

## Final result

final result: passed

---

# 유기 연구 페이지 SEO 설정 마법사 Design QA

## 범위와 시각적 근거

- 원본 영상: `/Users/user01/Desktop/화면 기록 2026-07-30 오전 5.26.55.mov`
- 원본 영상 크기/길이: 2032 × 1162, 65.13초, H.264.
- 원본 핵심 화면: `.design-qa/organic-video/source-dialog-step-01.png`, `source-dialog-step-pages.png`, `source-dialog-step-02-41.png`, `source-dialog-step-03.png`.
- 브라우저 구현 화면: `.design-qa/organic-video/implementation-step-01-final.png`, `implementation-step-pages-final.png`, `implementation-step-02-final.png`, `implementation-step-03-loading-final.png`.
- 동일 상태 종합 비교: `.design-qa/organic-video/comparison-all-steps.png` (각 행 왼쪽 원본, 오른쪽 구현).
- 검증 경로/화면: `/analytics/organic/overview/`, 한국어, 1904 × 947 CSS px.
- 정규화: 원본 다이얼로그와 구현 다이얼로그를 모두 1012 × 700 px, device density 1로 맞춰 비교함.

## 구현된 흐름

- 위치 선택: 국가 검색, Region/시 선택, 데스크톱/휴대전화 전환.
- 페이지 및 키워드: 유기 연구 상위 키워드 자동 7개 구성, 직접 입력, CSV 가져오기, GSC/자연검색 소스 전환, 행 삭제와 자동 복원.
- 크롤러: SEMrushBot Desktop/Mobile 사용자 에이전트 전환과 실제 UA 문자열 노출.
- 스케줄: 주간/없음, 월요일 이메일 업데이트 선택, 완료 로딩 상태.
- 저장: 도메인별 로컬 설정 저장, 완료 요약 표시, 새로고침 후 설정 복원, 수정 재진입.

## 필수 충실도 표면

- 글꼴/타이포그래피: 24 px 단계 제목, 13–15 px 본문·컨트롤, 굵기와 줄 간격을 원본과 맞췄고 잘림 없음.
- 간격/레이아웃: 1012 × 700 다이얼로그, 220 px 보라색 단계 내비게이션, 792 px 콘텐츠 영역과 하단 고정 작업 영역을 원본 비율에 맞춤.
- 색상/토큰: 원본의 보라색 단계 패널, 연보라 활성 상태, 녹색 주요 버튼, 파란 보조 링크, 중립 표 경계선을 기존 앱 토큰과 조화되게 적용.
- 이미지/아이콘: 별도 이미지 자산이 없는 UI 흐름이며 Radix 아이콘을 사용함. 커스텀 SVG, CSS 삽화, 이모지 대체 없음.
- 문구/콘텐츠: 원본 한국어 단계 문구를 유지하되 키워드와 URL은 현재 `www.uinus.co.kr` 유기 연구 데이터로 연결함.

## 비교 이력

### 1차 비교 — blocked

- [P2] 구현 다이얼로그가 1080 px로 원본 1012 px보다 넓어 콘텐츠 영역 비율이 달랐음.
- [P2] 원본은 7개 키워드를 한 화면에 표시하지만 구현은 실제 데이터 2개만 구성하고 표의 마지막 행이 스크롤 안쪽에 가려졌음.
- [P2] 타겟 위치 단계에는 원본에 없는 유닛 수가 표시됐고, 완료 단계 번호를 체크 아이콘과 `완료` 문구로 바꿔 원본 내비게이션과 달랐음.

### 2차 비교 — passed

- 다이얼로그를 1012 × 700, 타겟 선택기를 320 px로 보정하고 표 높이를 410 px로 확장함.
- 유기 연구 데이터를 우선 사용하고 부족한 항목을 현실적인 키워드로 보완해 항상 7개를 구성함.
- 타겟 위치 단계의 유닛 수를 숨기고 단계 번호·선택사항 문구를 원본 규칙으로 복원함.
- 종합 비교 `.design-qa/organic-video/comparison-all-steps.png`에서 해결이 필요한 P0, P1, P2 차이 없음.
- 원본 크롤러 단계의 중앙 버튼은 네트워크 로딩 중인 상태이고 구현 비교는 조작 가능한 준비 상태다. 핵심 구조에는 영향이 없는 의도적 상태 차이로 분류함.

## 동작 검증

- [x] 자동 가져오기 7개 → 행 삭제 시 유닛 6 → 자동 가져오기 재선택 시 7로 복원.
- [x] 직접 입력으로 `SEO 컨설팅`과 URL 추가 시 유닛 8로 증가.
- [x] 아이디어 수집 후 크롤러 단계 이동, Mobile 선택 시 Android UA 문자열로 변경.
- [x] 주간/없음 선택 시 이메일 체크박스 활성/비활성 연동.
- [x] 설정 완료 후 다이얼로그 닫힘, 7개·매주 재수집 요약 표시, 새로고침 후 복원.
- [x] 프로덕션 브라우저 콘솔 오류 0건.
- [x] ESLint, TypeScript, 프로덕션 빌드, diff whitespace 검사 통과.

## 후속 다듬기

- [P3] 원본 영상은 크롤러 단계 중앙 버튼을 장시간 로딩 상태로 보여준다. 구현은 사용자가 진행할 수 있도록 정상 상태 버튼을 제공한다.
- [P3] 이번 시각 기준은 데스크톱 1904 × 947로만 제공되어 모바일 앱 셸 비교는 범위에서 제외했다.

## 최종 결과

final result: passed

---

# 포지션 추적 랜딩 Design QA

## 범위와 증거

- 기준 문서: `/Users/user01/Desktop/SEMRUSH/포지션추적.pdf`
- PDF 원본 스크린샷 합본: `.design-qa/position-tracking-reference-full.png`
- 구현 경로: `/position-tracking/`
- 구현 전체 캡처: `.design-qa/position-tracking-final.png`
- 전체 동일 폭 비교: `.design-qa/position-tracking-comparison-full.png` (왼쪽 기준, 오른쪽 구현)
- 집중 비교: `.design-qa/position-tracking-comparison-top.png`, `.design-qa/position-tracking-comparison-features.png`, `.design-qa/position-tracking-comparison-faq.png`
- 반응형 증거: `.design-qa/position-tracking-mobile.png`
- 검증 상태: 한국어, 랜딩 기본 상태, 1904 × 947 CSS px, deviceScaleFactor 1

## 정규화

- PDF에 포함된 세 장의 스크린샷은 각각 2848 × 3744, 2848 × 3744, 2848 × 1430 px이며, 순서대로 이어 붙인 기준 이미지는 2848 × 8918 px입니다.
- 기준 이미지를 구현 콘텐츠 폭인 1889 px로 비례 축소해 1889 × 5916 px로 정규화했습니다.
- 구현 전체 캡처는 1889 × 5397 px입니다. 1904 px 뷰포트와의 15 px 차이는 데스크톱 스크롤바 영역입니다.
- 전체 비교는 두 이미지를 늘리지 않고 1889 × 5916 px 캔버스에 상단 정렬한 3778 × 5916 px 결과입니다.

## 발견 사항

- 해결이 필요한 P0, P1, P2 차이는 남아 있지 않습니다.
- [P3] 구현 페이지는 정규화한 기준보다 약 9% 짧습니다. 기준 문서의 긴 설명과 하단 여백이 더 크기 때문이며, 핵심 섹션 순서·위계·기능에는 영향을 주지 않습니다.
- [P3] 공용 앱 헤더와 SEO 도구 탐색은 현재 프로젝트 셸을 유지했습니다. PDF의 이전 셸 변형과 일부 라벨이 다르지만 제품 전체 일관성을 위한 의도된 차이입니다.
- [P3] 기준의 곡선 화살표는 자산을 임의의 CSS 도형이나 수제 SVG로 대체하지 않고, 동일한 위치·색조·문맥을 가진 실제 HTML 안내 카드로 구현했습니다.

## 필수 충실도 표면

- 타이포그래피: 기존 제품 산세리프 스택을 유지하고 44 px 영웅 제목, 30 px 핵심 메시지, 27 px 기능 제목, 15 px 본문 위계를 기준과 맞췄습니다. 모바일에서는 줄바꿈과 크기가 자연스럽게 축소되며 잘림이 없습니다.
- 레이아웃과 리듬: 흰색 카드형 영웅, 순위 대시보드 미리보기, 세 개의 교차 기능 섹션, 하단 도메인 CTA, 10개 FAQ, 푸터 순서가 기준과 같습니다. 데스크톱 1904 px와 모바일 390 px에서 문서 수준 가로 오버플로가 없습니다.
- 색상과 표면: 연한 회색 배경, 흰색 카드, 중립 테두리, 검정 CTA, 보라색 안내 카드, 파랑·주황·민트 차트 계열을 기준과 기존 디자인 토큰에 맞췄습니다. 그라디언트는 사용하지 않았습니다.
- 미리보기 품질: 순위, 경쟁 구도, 알림, 보고서 영역은 실제 DOM과 Recharts로 구성하고 `예시 화면`으로 명확히 표기했습니다. 실시간 분석값처럼 보이는 가짜 데이터를 노출하지 않으며, 차트 애니메이션을 끄고 전체 페이지 캡처에서도 안정적으로 렌더링되게 했습니다.
- 콘텐츠: FAQ를 모두 기본 펼침 상태로 제공하고 기준과 비슷한 설명 밀도를 유지했습니다. 캠페인, 경쟁사, 이력, 기기, 로컬, SERP 구성 요소와 카니발리제이션 질문을 빠짐없이 다룹니다.

## 비교 이력

### 반복 1 — blocked

- [P2] 전체 페이지 캡처 시 화면 밖 Recharts가 애니메이션 초기 상태에 머물러 차트가 비어 보였습니다.
- [P2] 핵심 순위 미리보기의 보라색 안내 카드 두 개가 빠져 기준의 시각적 설명 흐름이 약했습니다.
- [P2] FAQ 답변이 한 줄 중심이라 기준보다 정보 밀도와 페이지 리듬이 현저히 낮았습니다.
- 증거: `.design-qa/position-tracking-initial.png`.

### 반복 2 — passed

- 수정: 모든 Recharts 애니메이션을 비활성화해 전체 캡처에서도 차트가 즉시 그려지도록 했습니다.
- 수정: 순위 미리보기 좌우에 보라색 안내 카드를 추가하고, 작은 화면에서는 읽기 순서에 맞춰 자연스럽게 쌓이도록 했습니다.
- 수정: FAQ 설명을 3문장 수준으로 확장하고 답변 높이·행간·하단 여백을 기준에 가깝게 조정했습니다.
- 최종 비교: `.design-qa/position-tracking-comparison-full.png`, `.design-qa/position-tracking-comparison-top.png`, `.design-qa/position-tracking-comparison-features.png`, `.design-qa/position-tracking-comparison-faq.png`.
- 수정 후 P0, P1, P2 차이는 없습니다.

## 주요 동작 검증

- 빈 도메인 제출 시 `올바른 도메인을 입력해 주세요.`가 표시되고 입력에 `aria-invalid="true"`가 설정됩니다.
- `uinus.co.kr` 제출 시 실제 `/api/position-tracking/` 요청으로 캠페인이 생성되고 `/position-tracking/?campaign=01KYQSKRDWJRFVW3NWD3K5CK8N`의 기존 실데이터 대시보드로 이동했습니다.
- 같은 도메인으로 다시 접근하면 중복 생성하지 않고 기존 캠페인 링크를 제공합니다.
- 순위 미리보기에서 `가시성` 탭 선택 상태가 반영됩니다.
- 순위 변동 알림에서 조건과 도메인을 선택하고 저장하면 버튼이 `저장됨`으로 바뀝니다.
- FAQ 첫 항목을 접으면 `aria-expanded="false"`로 변경됩니다.
- 1904 × 947에서 clientWidth와 scrollWidth가 모두 1889 px, 390 × 844에서 모두 390 px로 문서 수준 가로 오버플로가 없습니다.
- 최종 랜딩 재진입 후 브라우저 콘솔 오류 0건입니다.

## 구현 체크리스트

- [x] PDF의 랜딩 화면 구성과 콘텐츠 위계 구현
- [x] 실제 캠페인 생성 및 기존 캠페인 대시보드 연결
- [x] 탭, 알림 설정, 보고서 링크, FAQ 상호작용 구현
- [x] 데스크톱·모바일 반응형 및 접근성 상태 검증
- [x] ESLint, TypeScript, 시각 비교, 브라우저 콘솔 검증 통과

## 최종 결과

final result: passed

---

# 포지션 추적 위젯 Design QA

## 범위와 증거

- 기준 이미지: `/var/folders/04/y54015w94szby3vf2k72l9wr0000gp/T/orca-paste-1785356554405-0247591e-bd72-45da-92ad-dd153d67ca3d.png`
- 구현 캡처: `.design-qa/position-tracking-widget-final.png`
- 동일 상태 비교: `.design-qa/position-tracking-widget-comparison.png` (왼쪽 기준, 오른쪽 구현)
- 검증 화면: `/seo/`, 한국어, 1904 × 947
- 기준 이미지: 997 × 514, 구현 위젯 실측: 1521 × 474

## 시각 검증

- [x] 제목, 프로젝트 링크, 마지막 업데이트, 날짜 범위, 기간 선택, 닫기 동작이 기준 이미지와 같은 헤더 위계로 배치됨.
- [x] 가시성, 네 구간 도넛 지표, 상위 키워드 표가 데스크톱에서 균형 잡힌 3열로 표시됨.
- [x] 기준 이미지의 빈 추세 상태를 재현한 실제 래스터 이미지를 사용하고 텍스트·컨트롤과 겹치지 않음.
- [x] 보라색 핵심 수치, 파란색 링크, 중립 경계선·텍스트 색상, 카드 여백과 높이가 기존 대시보드 토큰에 맞음.
- [x] 1904 × 947 브라우저 비교에서 잘림, 겹침, 가로 오버플로가 발견되지 않음.
- [x] 비교 결과 해결이 필요한 P0, P1, P2 차이 없음.

## 동작 검증

- [x] 조회 기간을 지난 30일로 변경하면 `7월 1일 – 2026년 7월 30일`로 갱신되고, 지난 7일로 복귀하면 `7월 24일 – 2026년 7월 30일`로 복원됨.
- [x] `전체 보고서 보기` 클릭 시 `/position-tracking/`으로 이동함.
- [x] 최종 `/seo/` 재진입 후 브라우저 콘솔 오류 0건.
- [x] ESLint, TypeScript, 프로덕션 빌드, diff whitespace 검사를 통과함.

## 최종 결과

final result: passed
