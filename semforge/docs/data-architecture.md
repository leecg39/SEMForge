# Semrush 데이터 아키텍처 역추론

> 조사일: 2026-07-28 · 근거: Semrush 공식 KB/블로그 문서 + 제3자 정확도 분석 (문서 하단 출처 참조)

## 결론

Semrush에서 실측 데이터는 Site Audit(사용자 사이트 직접 크롤)뿐이다. 트래픽·검색량·순위·SEO 지표는 전부 **원천 3축 — SERP 스냅샷, 클릭스트림 패널, 자체 링크 그래프 — 를 ML 모델로 조합한 통계적 추정치**다.

비유하면 닐슨 시청률 조사와 같다. 전 가구의 TV를 들여다보는 게 아니라 표본 패널 가구의 시청 기록으로 전국 시청률을 통계적으로 추정하듯, Semrush도 인터넷 전체가 아닌 표본(패널 + SERP 스냅샷 + 크롤)에서 전체를 역산한다.

클론 관점 시사점: 해자는 UI가 아니라 수집 인프라와 2012년부터의 히스토리다. 아키텍처는 "원천 스토어 3개 + 파생 지표 계산 레이어" 구조로 재현 가능하다.

## 1. 원천 데이터: 수집 → 산출 구조

| 분석 기능 | 데이터 원천 | 수집 방식 | 산출 방식 (핵심 엔진) | 갱신 주기 | 확신도 |
|---|---|---|---|---|---|
| 순위·도메인 분석 (Organic Research) | SERP 스냅샷 DB | 서드파티 공급자가 인기 키워드 수억 개의 구글 상위 100위 수집 (오가닉+광고) | 키워드→도메인 테이블을 뒤집은 **역인덱스 조회** | 키워드 인기도 따라 매일~매월 (우선순위 큐) | 수집: 공식 / 역인덱스: 추론 |
| 검색량 (Search Volume) | 구글 측 키워드 데이터 + 클릭스트림 이력 | 두 데이터를 오버레이 → 클러스터에서 모델 학습 | 학습된 모델이 **수십억 키워드 볼륨을 예측** (관측 아님), 최근 12개월 합 ÷ 12 | 월 1회, 히스토리 2012.1~ | 공식 (캘리브레이션 세부는 추정) |
| 트래픽 (Traffic & Market) | 클릭스트림 패널 190개국 2억+ 명 | 수백 개 데이터 공급자에게서 1~2일마다 TB 단위 구매 | 정제(ML 이상치 제거) → 국가·기기·산업별 정규화 → **지도학습 신경망**으로 표본→모집단 보정 | 일/주 단위 (구모델은 월 단위) | 공식 |
| 트래픽 (Domain Overview의 Organic Traffic) | SERP DB + 검색량 DB | 별도 수집 없음 (파생) | **Σ(키워드 검색량 × 순위별 기대 CTR)** — 클릭스트림과 무관 | 키워드 DB 갱신 따름 | 제3자 분석 (중간~높음) |
| 백링크 분석 | 자체 링크 그래프 | SemrushBot이 **하루 약 100억 페이지** 크롤 | 43조 링크 그래프 누적 | 상시 | 공식 |
| 광고 데이터 | 서드파티 수집 | Google Ads / Shopping 광고 수집 | 10억+ 광고, 히스토리 2012.1~ | 상시 | 공식 |
| AI Visibility | AI 검색 클릭스트림 + 구글 AI Overviews 키워드셋 | 289M+ 프롬프트 수집, ChatGPT(검색 모드)·Gemini 등 응답 분석 | 프롬프트별 브랜드 언급·인용 집계 | 월(DB)/주(브랜드)/일(추적) | 공식 |
| Site Audit | 사용자 사이트 직접 크롤 | 등록 도메인 온디맨드 크롤 | 유일한 **실측** 영역 | 요청/스케줄 시 | 공식 |

## 2. 트래픽 추정 파이프라인 (공식 4단계)

1. **수집** — 수백 개 클릭스트림 공급자로부터 1~2일마다 테라바이트 단위 수신. 익명화된 실사용자의 온라인 여정(이벤트 = 페이지 방문, 세션 = 방문).
2. **정제** — 공통 포맷 정렬 → 자체 ML 모델로 이상치 제거 → **백링크 DB·SERP 포지션 DB와 교차검증** (국가·기기별 정합성 확인).
3. **모델링** — 도메인 인기도, 국가·인구통계·기기·산업별 "정상 행동" 기준으로 정규화. 활동량이 극히 낮은 사용자 제거. 지도학습으로 상시 개선.
4. **제공** — 신모델 도입 후 일 단위 처리로 일/주 지표 제공. 커버리지 +20% 확장.

역추론 포인트: 신경망의 실제 역할은 **편향된 패널 표본을 모집단으로 보정하는 가중치 학습**이다. 백링크·순위 DB를 피처로 섞는 이유는 패널에 거의 잡히지 않는 소형 사이트의 트래픽을 다른 신호로 보간하기 위함이며, 소형 사이트에서 GA 대비 오차가 큰 근본 원인이다.

## 3. 파생 지표: 원천 DB를 조합하는 공식

| 지표 | 입력 | 계산 방식 |
|---|---|---|
| Authority Score (0–100) | 백링크 양+질, 오가닉 트래픽 추정치, 스팸 팩터(비정상 링크 증가, 동일 IP 다수 링크) | 3요소 ML 합성 |
| KD% (0–100) | 해당 키워드 상위 10개 결과의 프로필 | 순위 도메인 중앙값 AS **16.99%** + 검색량 **9.47%** + referring domains 중앙값, dofollow/nofollow 비율, SERP 피처, 브랜드 여부 + 지역 DB 보정 |
| Organic Traffic | 순위(SERP DB) + 검색량 | 검색량 × CTR 곡선 합산 |
| Keyword Intent | SERP 피처·키워드 패턴 | 자동 분류 (공식 문서 kb/1226) |

파생 체인: `SERP DB → 트래픽 추정 → Authority Score → KD` 순으로 지표가 서로를 참조한다.

주의: **"트래픽"이 두 종류다.** Domain Overview의 Organic Traffic은 SERP 모델 값(검색량×CTR), Traffic Analytics의 Visits는 클릭스트림 패널 추정값. 같은 도메인이라도 두 화면의 숫자가 다른 이유.

## 4. 데이터베이스 규모 (2026 공식 발표 기준)

| 항목 | 규모 |
|---|---|
| 지역 데이터베이스 | 142개 |
| 키워드 | 27.9B |
| 도메인 프로필 | 808M |
| 백링크 | 43T |
| 원본 트래픽 데이터 | 500TB |
| AI 프롬프트 | 289M+ |
| Google Ads 히스토리 | 1B+ (2012.1~) |

지원 검색엔진: 대부분 Google 기준. Position Tracking은 Google/Baidu/Bing(상위 50), Traffic & Market은 Google/DuckDuckGo/Bing/Yandex/Baidu.

## 5. 클론 재현 전략

원천 스토어 3개(`serp_snapshots`, `clickstream_events`, `link_graph`) + 키워드 메타(`volume`, `cpc`)를 두고, KD·AS·Organic Traffic은 원천을 읽는 **파생 계산 레이어(순수 함수)** 로 구현하면 실제 Semrush와 동일한 데이터 흐름이 된다.

| Semrush 원천 | 규모 | 소규모 대체재 |
|---|---|---|
| SERP 스냅샷 | 27.9B 키워드 × 142 지역 DB | DataForSEO, SerpAPI 등 SERP API |
| 검색량 | 지역 DB별 월 갱신 | Google Keyword Planner API |
| 클릭스트림 패널 | 2억+ 명, 원본 500TB | 구매 사실상 불가 → CrUX·Tranco 순위를 프록시로 |
| 링크 그래프 | 43T 링크, 808M 도메인 | Common Crawl 덤프 |

파생 지표는 공개 가중치(KD의 AS 16.99% / 볼륨 9.47%, AS의 3요소)를 그대로 클론의 계산식으로 사용 가능하다.

## 6. 확신도 구분

- **높음 (공식 문서 명시)**: 수집 원천 구성, 트래픽 4단계 파이프라인, 갱신 주기, 검색량 산출 3단계, KD 가중치, AS 3요소, DB 규모.
- **중간 (제3자 분석 + 제품 동작 정황)**: Organic Traffic = 검색량×CTR 모델, 검색량의 Keyword Planner 계열 캘리브레이션, 패널 = 데이터 브로커 구매.
- **추론 (구조상 필연이나 미공개)**: 도메인 분석 = SERP DB 역인덱스, 인기도 기반 크롤 우선순위 큐, 신경망 = 표본 편향 보정.

## 출처

- https://www.semrush.com/kb/997-semrush-data — 데이터 총론 (수집 방식 전체)
- https://www.semrush.com/kb/1211-how-semrush-turns-traffic-data-into-traffic-intelligence — 트래픽 4단계 파이프라인
- https://www.semrush.com/kb/683-what-is-search-volume-in-semrush — 검색량 산출 방법
- https://www.semrush.com/kb/1158-what-is-kd — KD 정의·요소
- https://www.semrush.com/blog/most-accurate-keyword-difficulty/ — KD 공식 가중치
- https://www.semrush.com/blog/semrush-authority-score-explained/ — AS 3요소
- https://www.semrush.com/kb/1607-semrush-ai-visibility-data — AI Visibility 데이터 원천
- https://www.promodo.com/blog/data-accuracy-at-similarweb-ahrefs-and-semrush — 제3자: 검색량×CTR 모델 분석
- https://seolocale.com/how-accurate-is-semrush-for-tracking-your-seo-success/ — 제3자: 클릭스트림 추정 정확도 분석
