# Traffic & Market 통합 구현 계획

## 목표

Semrush Traffic & Market의 정보 구조와 비교 흐름을 SEMForge에 적용하되, 확보하지 않은 클릭스트림 수치를 만들지 않는다. 자사 검색 유입은 Google Search Console 실측값으로, 시장 경쟁은 TalorData SERP 관측값과 Position Tracking 집계로 제공한다.

## 원본 분석

- 공개 진입 화면은 도메인 입력 → 경쟁 도메인 추가 → 분석 순서이며, 주요 진입점은 트래픽 소스·시장 벤치마킹·오디언스·경쟁사 모니터링이다.
- Traffic Overview는 방문·방문자·참여·채널·상위 페이지와 기간 비교를 한 화면에서 다룬다.
- Market Overview는 시장 요약, 성장/경쟁 구도, 플레이어와 채널 비교를 제공한다.
- Top Pages는 신규·성장·하락 페이지를 분리하고 페이지별 트래픽/참여/채널을 비교한다.
- 공개 페이지에서 실제 도메인 분석은 로그인/유료 데이터 경계로 이동한다. SEMForge는 이 경계를 숨기지 않고 데이터 출처를 화면에 항상 표시한다.

참고 문서:

- https://www.semrush.com/kb/1506-traffic-and-market-traffic-overview
- https://www.semrush.com/kb/1512-traffic-and-market-market-overview
- https://www.semrush.com/kb/1523-traffic-and-market-pages-categories-top-pages
- https://www.semrush.com/kb/1121-semrush-traffic-and-market

## 적용 구조

| 화면 | SEMForge 데이터 | 구현 범위 |
| --- | --- | --- |
| 개요 | GSC + Position Tracking | 실측 트래픽, SERP 시장, 페이지 변동, 출처 상태 카드 |
| 트래픽 분석 | GSC | 클릭·노출·CTR·평균순위, 이전 기간 변화, 일별 추이, 국가·기기 분포 |
| 시장 개요 | TalorData SERP + Position Tracking | 관측 경쟁사, SERP 출현율, 평균순위 기반 경쟁 구도, 키워드 기회 |
| 인기 페이지 | GSC | 신규·성장·하락 페이지, 클릭·노출·CTR·순위, 직전 기간 비교 |

## 데이터 진실성 규칙

1. `Google Search Console 실측`, `TalorData SERP 관측`, `clone-traffic-v1 추정` 배지를 구분한다.
2. GSC 데이터가 0건이면 0을 꾸며 채우지 않고 연결/기간 안내를 표시한다.
3. Position Tracking 예상 트래픽은 기존 `clone-traffic-v1` 계산 결과에만 사용하고 모델명을 함께 노출한다.
4. Direct, Referral, Paid, Social, Email, Display, 인구통계는 클릭스트림/광고/분석 공급자 없이는 수치를 제공하지 않는다.
5. 시장 점유율로 오인될 수 있는 SERP 값은 `관측 출현율`과 `순위 강도`로 명명한다.

## 실행 단계

1. GSC 현재 기간과 동일 길이의 직전 기간을 병렬 조회해 스냅샷 변화량을 계산한다.
2. 페이지·국가·기기 차원을 추가하고 신규/성장/하락 페이지를 분류한다.
3. Position Tracking 캠페인을 선택해 overview, discovered competitors, highlights, pages를 결합한다.
4. 하나의 반응형 대시보드에 개요/트래픽/시장/페이지 탭을 구성하고 기존 사이드바 URL과 연결한다.
5. 연결되지 않은 공급자와 데이터 공백은 명시적 빈 상태로 처리한다.
6. 변환 로직 단위 테스트, TypeScript, ESLint, 프로덕션 빌드, 데스크톱/모바일 브라우저 검증을 통과시킨다.

## 후속 확장

- GA4 연결: 방문, 사용자, 참여시간, 이탈/참여율과 채널 믹스 실측
- 광고 계정 연결: Paid Search/Social/Display 실측
- 유료 클릭스트림 또는 Semrush API 연결: 경쟁 도메인의 방문/방문자/채널/오디언스 벤치마킹
- 정기 수집 작업: 기간별 시장 스냅샷과 알림
