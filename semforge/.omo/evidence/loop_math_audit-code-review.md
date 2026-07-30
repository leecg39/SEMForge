# loop_math_audit 코드 품질 감사

## 범위와 입력 상태

- 목표: `docs/data-architecture.md`와 현재 analytics 구현(`src/lib/analytics`, `src/server/analytics.ts`, analytics schema/seed/API)을 대조해 계산 정확성, 데이터 의미, 엣지케이스의 P0/P1/P2 문제만 확인.
- 입력으로 별도 executor notepad, full diff, evidence artifact는 제공되지 않았다. 현재 작업트리와 관련 파일을 직접 읽어 검증했다.
- 현재 관련 변경은 untracked analytics 파일이 다수이며, tracked diff에는 `src/db/schema/index.ts`, `src/db/seed.ts`, `package.json` 변경이 포함된다.

## 스킬 관점 점검

- `remove-ai-slops` / `programming` 스킬은 노출된 스킬 목록에 없었고, `/Users/user01/.codex/skills/*` 및 `/Users/user01/.agents/skills/*`의 정확 경로 조회에서도 발견되지 않았다. 따라서 프롬프트에 명시된 기준을 적용했다.
- remove-ai-slops 관점: 삭제-only 테스트는 없지만, `src/lib/analytics/metrics.test.ts:22-29`는 기대값 계산에 같은 모듈의 `ctrForPosition`을 재사용해 구현 상수를 미러링한다. 보고서 조립 계층 엣지케이스도 빠져 있어 false confidence 위험이 있다.
- programming 관점: 신규 추상화는 과하지 않지만, 보고서 조립 로직이 데이터 경계 의미(SERP 스냅샷 최신성, top10 KD 범위, 클릭스트림 유무와 Domain Overview 가능 여부)를 코드로 고정하지 못한다.

## 검증

- `npm run test:analytics`: PASS, 5 tests.
- `npm run lint`: exit 0, 기존/무관 이미지 최적화 warning 13건.
- 추가 재현 스크립트(`npx tsx -e`, 순수 함수 호출): SERP-only 도메인 `null`, multi-snapshot 최신 10위 기대값 대신 1위/279 반환, KD top10 기대 7 대신 33 반환, channel share 합계 불일치 재현.

## CRITICAL

- 없음.

## HIGH

### H1 / P1: Domain Overview 조회 가능 여부가 클릭스트림 존재에 묶여 SERP-only 도메인을 버린다

증거:
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/docs/data-architecture.md:20`은 Domain Overview의 Organic Traffic이 클릭스트림과 무관한 `SERP DB + 검색량 DB` 파생값이라고 정의한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/docs/data-architecture.md:46`은 Domain Overview Organic Traffic과 Traffic Analytics Visits가 다른 지표라고 경고한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/docs/data-architecture.md:64`는 `serp_snapshots`, `clickstream_events`, `link_graph` 원천과 파생 계산 레이어 구조를 요구한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:312-318`은 `availableDomains`를 `scopedClicks`에서만 만들고, 여기에 없으면 보고서를 `null`로 반환한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/db/seed-analytics.ts:18-27`은 SERP 경쟁 도메인을 만들지만, `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/db/seed-analytics.ts:134-170`은 클릭스트림을 core domain 3개에만 만든다.

영향:
- SERP/키워드/링크 원천으로 Organic Traffic, Organic Keywords, Backlinks를 계산할 수 있는 도메인도 클릭스트림 패널 행이 없으면 API가 404를 낸다.
- 문서상 두 트래픽 지표를 분리해야 하는데, 구현은 Domain Overview 자체를 Traffic Analytics 데이터 존재 여부에 종속시킨다.

재현:
- synthetic dataset에서 `serponly.example.com`은 keyword+SERP+link가 있고 clickstream만 없도록 구성했다.
- `buildDomainAnalytics(..., { domain: "serponly.example.com" })` 결과: `null`.

개선 가설:
- `availableDomains`는 최신 SERP 도메인, 클릭스트림 도메인, 링크 target 도메인의 union으로 만들고, 클릭스트림이 없으면 `visitsEstimate=0`, `uniqueVisitorsEstimate=0`, confidence low/null로 표현한다.

기계 검증:
- `buildDomainAnalytics` 보고서 조립 테스트 추가: SERP-only 도메인이 `null`이 아니며 `organicTrafficEstimate`는 `volume * CTR`, `visitsEstimate`는 0인지 확인.
- seed 기반 smoke test: `atlas.example` 같은 SERP 경쟁 도메인이 조회 가능한지 확인.

### H2 / P1: 같은 키워드의 여러 SERP 스냅샷이 최신 스냅샷으로 축소되지 않아 오래된 최고 순위가 현재 순위처럼 표시된다

증거:
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/docs/data-architecture.md:17`은 SERP 스냅샷 DB가 키워드 인기도에 따라 매일~매월 갱신된다고 설명한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:309-322`은 최신 keyword row의 SERP를 가져오지만 `capturedAt` 기준 최신 스냅샷을 고르지 않는다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:350-359`은 같은 keywordMetricId 아래 여러 스냅샷이 있으면 도메인별 organic 신호에 모두 더한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:377-381`은 모든 snapshot row를 position으로 정렬한 뒤 target을 찾아 오래된 1위가 최신 10위보다 우선될 수 있다.

영향:
- SERP collector가 같은 keywordMetricId에 두 번 이상 캡처하면 현재 Domain Overview가 과거 최고 순위를 현재 순위로 표시하고 Organic Traffic, Authority Score 입력, trend가 오염된다.

재현:
- 같은 keywordMetricId에 `2026-07-01 position=1`, `2026-07-20 position=10` 두 row를 넣었다.
- 실제 반환: `position=1`, `trafficContribution=279`.
- 기대: 최신 스냅샷 기준 `position=10`, `trafficContribution=24`.

개선 가설:
- keywordMetricId/searchEngine 단위로 최신 `capturedAt`을 선택하고, 같은 snapshot 시점의 row만 ranking에 사용한다.
- trend는 각 keyword period 내 최신 snapshot을 선택하거나 snapshot period 모델을 명시한다.

기계 검증:
- multi-snapshot fixture 테스트 추가: 오래된 1위와 최신 10위가 있을 때 topKeywords[0].position이 10인지, Organic Traffic이 24인지 확인.
- 같은 keywordMetricId에 2개 capturedAt을 넣은 DB/API integration test로 404 없이 최신값만 반환하는지 확인.

## MEDIUM

### M1 / P2: KD 계산에서 top 10 외 결과의 링크 프로필과 SERP feature가 섞인다

증거:
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/docs/data-architecture.md:40`은 KD 입력을 "해당 키워드 상위 10개 결과의 프로필"로 정의한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:377-390`은 `ranking` 전체를 사용해 `profiles`, `medianReferringDomains`, `followShare`, `serpFeatureCount`를 계산한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:235-254`에서 authority score만 slice(0, 10)되고 나머지 KD 입력은 호출자가 넘긴 전체 median을 그대로 사용한다.

영향:
- SERP가 문서처럼 top100까지 저장되면 11~100위 결과의 링크 품질이 KD를 움직인다. top10 난이도 지표가 아닌 전체 저장 범위 의존 지표가 된다.

재현:
- top10은 링크가 없고 11~20위에만 링크 100개씩 넣은 fixture.
- 실제 `topKeywords[0].difficulty`: 33.
- top10만 쓰는 기대값: 7.

개선 가설:
- `const top10Ranking = ranking.filter(row => row.position <= 10).slice(0, 10)`를 만들고 authority, referring domain median, follow/nofollow, SERP feature count, branded 판단 입력을 모두 그 범위에서 산출한다.

기계 검증:
- 11~20위 링크만 부풀린 fixture에서 KD가 top10-only 기대값과 같고, 11~20위 링크 변경에 불변인지 property-style test 추가.

### M2 / P2: 채널 breakdown이 visit summary와 같은 세션 가중치 규칙을 쓰지 않아 share 합계가 틀릴 수 있다

증거:
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:118-124`는 동일 세션의 populationWeight를 max로 병합한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:137-149`는 병합된 세션 weight로 visitsEstimate를 만든다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:449-458`은 channel 집계에서 첫 event만 보관하고 raw `populationWeight`를 더한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.ts:464-466`은 그 raw channel total을 max-weight 기반 `clickSummary.visitsEstimate`로 나눈다.

영향:
- 한 세션 안에서 page event별 weight가 다르거나 attribution channel이 바뀌면 총 visitsEstimate와 channel visits/share가 서로 다른 모집단 기준이 된다.

재현:
- 같은 sessionHash에 weight 10 organic, weight 50 direct 두 event를 넣었다.
- 실제 반환: `visitsEstimate=50`, `channels=[{ organic, visitsEstimate:10, share:20 }]`.

개선 가설:
- channel breakdown도 `summarizeWeightedClickstream`과 동일한 세션 병합 결과를 사용한다. channel attribution은 landing event, first non-direct, 또는 max-weight event 중 하나로 명시한다.

기계 검증:
- 같은 sessionHash의 weight가 달라도 channel visits 합계와 share 합계가 `clickSummary.visitsEstimate`와 일치하는 테스트 추가.

## LOW

### L1: analytics 테스트가 보고서 조립 엣지케이스를 보지 않고 일부 기대값을 구현 함수로 미러링한다

증거:
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.test.ts:22-29`은 `estimateOrganicTraffic` 기대값 계산에 같은 모듈의 `ctrForPosition`을 사용한다.
- `/Users/user01/Desktop/SEMRUSH/semrush-clone/src/lib/analytics/metrics.test.ts:3-11`의 import 목록에는 `buildDomainAnalytics`가 없어 H1/H2/M1/M2 같은 보고서 조립 버그가 테스트되지 않는다.

영향:
- CTR curve나 snapshot 범위 해석이 틀려도 테스트가 같이 움직이거나 아예 실행 경로를 통과하지 않는다.

기계 검증:
- fixture 기반 `buildDomainAnalytics` 테스트를 추가하고, 기대 CTR 값은 공개 상수의 숫자 literal 또는 named fixture expectation으로 둔다.

## 결과

- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- reportPath: `.omo/evidence/loop_math_audit-code-review.md`
- blockers:
  - H1/P1: Domain Overview가 클릭스트림 없는 SERP-only 도메인을 조회 불가 처리한다.
  - H2/P1: 여러 SERP 스냅샷이 최신 snapshot으로 축소되지 않아 오래된 순위가 현재 지표를 오염시킨다.
