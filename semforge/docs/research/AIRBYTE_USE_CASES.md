# SEMForge의 Airbyte 이용 목적 검토

> 조사 기준일: 2026-08-06
> 범위: Airbyte 공식 문서·공식 GitHub와 현재 SEMForge 저장소만 사용

## 결론

Airbyte의 가장 타당한 목적은 **GA4·Google Search Console·Google Ads·Meta 광고 데이터를 별도 원천 저장소에 주기적으로 적재해 장기 추이와 교차 채널 리포트를 만드는 배치 ELT 계층**이다. Airbyte 자체도 데이터 복제를 여러 데이터셋을 한곳에 모아 조인·저장하는 용도로 설명하며, 작은 데이터·낮은 지연·부수 효과가 필요한 작업에는 부적합하다고 명시한다. ([공식 플랫폼 개요](https://docs.airbyte.com/platform))

따라서 현재의 NAVER/GSC/Bing/TalorData 클라이언트를 대체하거나 `data/app.db`에 직접 쓰는 제품 런타임으로 도입하지 않는다. 현재 SEMForge는 외부 API의 실측값만 사용하고 실패·출처를 UI까지 전달하며([README](../../README.md#데이터-연동-원칙)), 로컬 단일 프로세스·수 MB 워크로드에는 SQLite가 적합하다고 판단한다([DB_SCHEMA](../DB_SCHEMA.md#엔진-판단-sqlite-유지-postgresql-이행-기준)). 이 규모에서는 Airbyte 운영 복잡도가 이득보다 크다.

## 추천 목적 우선순위

| 우선순위 | 이용 목적 | SEMForge 가치 | 판단 |
|---|---|---|---|
| 1 | **GA4 + GSC 이력 통합** | GSC 클릭·노출과 GA4 세션·참여·채널·페이지를 날짜/페이지별로 결합해 Traffic & Market의 현재 데이터 공백을 채움 | 가장 유력한 PoC |
| 2 | **Google Ads + Meta 광고 읽기 전용 분석** | 캠페인·광고·인사이트를 공통 저장소에 축적해 SEO→방문→유료 전환의 교차 채널 리포트 제공 | 광고 계정 연동이 제품 범위로 확정될 때 |
| 3 | **운영 DB 분석 복제** | 향후 PostgreSQL 다중 인스턴스 전환 후 운영 데이터를 분석 저장소로 분리 | 현재 SQLite 단계에서는 보류 |
| 4 | **NAVER/TalorData용 커스텀 소스** | 다수 워크스페이스의 대량 이력을 공통 파이프라인으로 수집 | 기존 직접 클라이언트 유지비가 임계점을 넘을 때만 |

GA4 커넥터는 Airbyte 지원 등급이며 `pages`, `traffic_sources`, `website_overview` 등과 Incremental/Full Refresh 모드를 제공한다. ([GA4 커넥터](https://docs.airbyte.com/integrations/sources/google-analytics-data-api)) GSC 커넥터도 Airbyte 지원 등급이며 날짜·국가·기기·페이지·쿼리 리포트를 제공하지만, 일 단위 커서 때문에 단순 Incremental Append는 중복될 수 있으므로 Append + Deduped를 써야 한다. ([GSC 커넥터](https://docs.airbyte.com/integrations/sources/google-search-console))

Google Ads와 Facebook Marketing도 Airbyte 지원 등급과 증분 동기화를 제공한다. ([Google Ads](https://docs.airbyte.com/integrations/sources/google-ads), [Facebook Marketing](https://docs.airbyte.com/integrations/sources/facebook-marketing)) 이는 현재 계획에 명시된 GA4·광고 계정 후속 확장([Traffic & Market 계획](../plans/traffic-market-integration.md#후속-확장))과 직접 맞닿는다.

## 제품 경계: 무엇을 Airbyte에 맡기지 않는가

- **사용자 요청의 실시간 조회:** NAVER 키워드, GSC 즉시 조회, Bing 백링크, TalorData SERP는 기존 서버 클라이언트를 유지한다. Cloud Standard의 예약/cron 동기화 최소 간격은 60분이고, Airbyte도 낮은 지연이 중요한 작업에는 데이터 복제가 부적합하다고 설명한다. ([Cloud 제한](https://docs.airbyte.com/platform/cloud/managing-airbyte-cloud/understand-airbyte-cloud-limits), [플랫폼 개요](https://docs.airbyte.com/platform))
- **쓰기와 부수 효과:** Meta 게시, GBP 리뷰 답글, 이메일·콘텐츠 생성 같은 액션은 Airbyte 대상이 아니다. Connector Builder는 현재 **소스 커넥터만** 만들며 목적지 커넥터는 만들 수 없다. ([Connector Builder](https://docs.airbyte.com/platform/connector-development/connector-builder-ui/overview))
- **사이트 크롤·SERP 수집 오케스트레이션:** 도메인 규칙, 비용 승인, 재시도, 캐시, `ProviderResult` 출처 계약이 제품 로직에 결합돼 있어 기존 due-runner와 직접 공급자 계층을 유지한다.
- **`data/app.db` 직접 적재:** 공식 Local SQLite 목적지는 Marketplace 등급, 낮은 성공률, 로컬 워크스테이션 전용이며 Kubernetes에서 동작하지 않는다. 결과도 `_airbyte_raw_*` JSON 테이블이고 Deduped 모드를 지원하지 않는다. ([Local SQLite 목적지](https://docs.airbyte.com/integrations/destinations/sqlite)) 따라서 PoC도 별도 DB/스키마에 적재하고 변환 어댑터를 거친다.
- **현재 SQLite의 CDC:** Airbyte CDC는 DB 로그를 주기적으로 읽는 방식이지 무한 스트리밍이 아니며, 현재 지원 목록에 SQLite가 없다. PostgreSQL 등으로 전환한 뒤 분석 복제가 필요할 때만 검토한다. ([CDC](https://docs.airbyte.com/platform/understanding-airbyte/cdc))

## 배포·보안·비용 판단

| 선택지 | 장점 | 현재 SEMForge 판단 |
|---|---|---|
| Cloud Standard | 완전 관리형, 월 $10부터, API/커스텀 소스는 100만 행당 $15 | 비민감 PoC의 우선 선택; 60분 주기면 충분 |
| Airbyte Core | 무료 오픈소스, 자체 인프라에 데이터 유지 | 현 규모에는 과함: 권장 4 CPU/8GB이며 보안·신뢰성 운영 책임이 사용자에게 있음 |
| Plus/Pro/Flex | 15분 주기, RBAC·SSO·별도 data plane 등 | PoC 범위 밖; 규제·다중 팀·더 빠른 갱신이 필요할 때 |

Cloud 가격과 과금 단위는 공식 기준으로 월 $10에 4 credits, 추가 credit $2.50, API/커스텀 소스 100만 행당 $15, DB/파일 GB당 $10이다. Full Refresh는 매번 모든 행이 과금되므로 증분 동기화와 필드 선택이 중요하다. ([Cloud 과금](https://docs.airbyte.com/platform/cloud/managing-airbyte-cloud/manage-credits))

Cloud의 control plane은 미국에 있고 managed data plane은 미국과 EU에 제공된다. 선택 리전에서 데이터가 처리돼도 cursor와 primary key는 미국 control plane을 통과하며, Connector Builder의 개발·테스트 데이터도 리전 설정과 무관하게 control plane을 통과한다. ([보안](https://docs.airbyte.com/platform/operating-airbyte/security), [데이터 레지던시](https://docs.airbyte.com/platform/cloud/managing-airbyte-cloud/manage-data-residency)) 한국 내 처리 또는 개인정보 국외 이전 제한이 있으면 Cloud PoC 전에 별도 검토하고, 충족할 수 없으면 Core/Enterprise Flex를 비교한다.

Core는 무료지만 공식 quickstart가 권장하는 자원은 4 CPU/8GB이고 로컬에서도 Kubernetes를 사용한다. ([Core Quickstart](https://docs.airbyte.com/platform/using-airbyte/getting-started/oss-quickstart)) 또한 Core에는 사용자 관리/RBAC가 없어 사설망·방화벽·역방향 프록시를 운영자가 책임져야 한다. ([보안](https://docs.airbyte.com/platform/operating-airbyte/security))

## 2주 PoC 범위

**목표:** Airbyte가 “커넥터 추가”가 아니라 “GSC 검색 성과와 GA4 방문 품질을 안정적으로 결합하는 배치 데이터 계층”으로 실제 가치를 만드는지 검증한다.

1. 테스트용 GA4 1개 속성과 GSC 1개 속성만 연결한다.
2. GA4의 `pages`, `traffic_sources`, `website_overview`와 GSC의 날짜·페이지·쿼리 리포트만 선택한다.
3. 1시간 증분 Append + Deduped로 **별도 Postgres `airbyte_raw` 스키마**에 적재한다. 공식 Postgres 목적지는 모든 주요 sync mode를 지원하며 10GB 미만 또는 테스트 용도를 권장한다. ([Postgres 목적지](https://docs.airbyte.com/integrations/destinations/postgres))
4. 읽기 전용 변환 어댑터가 날짜·정규화 URL로 두 소스를 결합하고, `source`, `fetchedAt`, sync 상태를 SEMForge의 provenance 형식으로 변환한다.
5. 기존 `/api/gsc/*` 실시간 경로와 OAuth 토큰 저장은 변경하지 않는다.

**통과 기준:** 14일 동안 예약 sync 성공률 95% 이상, 동일 키 재실행 중복 0, 화면 데이터 지연 90분 이하, 기존 실시간 API 회귀 0, 월 예상 Airbyte 비용과 별도 Postgres 운영비 산출 완료.

**중단 기준:** GA4+GSC 결합 리포트가 제품 로드맵에 없거나, 데이터 레지던시 요구를 충족하지 못하거나, 직접 API 두 개를 유지하는 비용보다 Airbyte+Postgres 운영비가 큰 경우다.

## 최종 권고

**지금 전면 도입하지 말고, GA4 연동이 확정되는 시점에 Cloud Standard 기반 2주 PoC만 수행한다.** 성공하면 Airbyte를 “마케팅 원천 데이터의 배치 수집·이력 저장 계층”으로 제한해 채택하고, NAVER/GSC/Bing/TalorData의 실시간 제품 경로와 사용자 액션은 계속 SEMForge가 직접 소유한다. Airbyte의 600개 이상 커넥터와 커스텀 소스 확장성은 이후 데이터 소스가 늘 때의 선택권이지, 현재 직접 연동을 즉시 교체할 이유는 아니다. ([커넥터·플랫폼 개요](https://docs.airbyte.com/platform), [지원 등급](https://docs.airbyte.com/integrations/connector-support-levels))

## 구현 반영 상태 (2026-08-06)

로드맵의 공통 기반과 기능 플래그별 화면을 코드에 반영했다.

- SQLite 제어 데이터: `0035_nosy_snowbird.sql`에 연결·속성 바인딩·OAuth state hash·동기화 실행·보고서 스냅샷·외부 엔터티 바인딩을 additive migration으로 추가했다. OAuth token과 Airbyte `secretId` 컬럼은 없다.
- Airbyte 경계: `src/server/marketing/airbyte.ts`가 workspace/source/destination/connection/OAuth/job/delete API를 감싸고 공급자의 원시 오류를 외부로 전달하지 않는다.
- Postgres 경계: `src/server/marketing/postgres.ts`가 Airbyte 완료 job의 지원 stream을 읽어 canonical fact와 5개 mart를 멱등 갱신한다. Airbyte workspace는 SEMForge workspace와 1:1이고 raw namespace는 연결별 opaque 값으로 분리해 한 소스 삭제가 다른 소스 데이터를 제거하지 않게 한다. 일반 앱 코드는 raw namespace를 직접 조회하지 않는다.
- 정규화: `src/server/marketing/transform.ts`가 선택한 Airbyte stream을 canonical batch로 바꾸며 HubSpot 이메일·이름·전화는 출력하지 않고 workspace secret 기반 가명 ID만 남긴다.
- 제품 화면: `/analytics/traffic/` 통합 성과, `/analytics/traffic/sources-destinations/` 연결 센터, `/paid-search/`, `/paid-social/` 읽기 전용 성과 화면을 제공한다. 마트가 없거나 24시간을 넘으면 값을 만들지 않고 기존 `/api/gsc/*` 탭을 폴백으로 유지한다.
- 보고서: `/api/marketing/reports/snapshots/`이 조회 결과와 provenance를 고정하고, PDF renderer는 저장된 snapshot만 읽는다.

PoC 시작 순서는 다음과 같다.

```bash
npm run db:migrate
npm run marketing:db:init
npm run test:marketing
```

그 다음 `.env.local`에 Airbyte·Postgres 서버 전용 값과 `AIRBYTE_MARKETING_INGESTION_ENABLED=true`, `MARKETING_INTELLIGENCE_ENABLED=true`를 설정한다. Postgres URL은 `AIRBYTE_DESTINATION_DATABASE_URL`(raw writer), `ANALYTICS_TRANSFORM_DATABASE_URL`(transformer), `ANALYTICS_DATABASE_URL`(앱 mart reader)로 분리한다. PoC 동안 연결은 Airbyte Cloud 관리자 화면에서 수동으로 구성할 수 있다. 셀프서비스를 열 때만 `MARKETING_SELF_SERVICE_CONNECTIONS_ENABLED=true`로 바꾸며, Airbyte OAuth의 redirect URL 제약 때문에 `APP_PUBLIC_URL`은 HTTPS여야 한다.

Airbyte raw 추출 결과를 표준 stream record JSON으로 내보낸 PoC에서는 다음 명령으로 멱등 변환을 검증할 수 있다.

```bash
MARKETING_BATCH_FILE=/secure/path/records.json \
MARKETING_WORKSPACE_ID=wsp_xxx \
MARKETING_FOLDER_ID=fld_xxx \
npm run marketing:transform:file
```

운영에서는 `airbyte_writer`, `marketing_transformer`, `semforge_reader` 역할을 분리한다. Airbyte destination에는 `AIRBYTE_DESTINATION_DATABASE_URL`, 초기 스키마 생성·완료 job 변환에는 `ANALYTICS_TRANSFORM_DATABASE_URL`, 앱에는 `ANALYTICS_DATABASE_URL`을 사용한다.
