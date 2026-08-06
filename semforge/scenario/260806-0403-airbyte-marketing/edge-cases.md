# 조합·확장 엣지 케이스

## 조합 결과

- **concurrent + recovery:** GA4 변환 중 같은 connection의 새 예약 job이 완료돼도 canonical upsert는 source key 기준 멱등이어야 한다.
- **temporal + permission:** OAuth state가 만료되는 순간 callback과 정리 job이 겹쳐도 한 번만 소비되어야 한다.
- **scale + integration:** Airbyte가 100개 job 페이지를 반환해도 connection별 최근 sync만 제한적으로 발견하고 API rate limit을 관찰해야 한다.
- **edge_case + concurrent:** sessions=0인 날 GA4와 GSC가 역순으로 들어와도 클릭 대비 세션 비율은 null이며 데이터는 유지되어야 한다.
- **abuse + data_variation:** Unicode·제어문자·SQL 문자가 섞인 external property ID는 Airbyte configuration 값으로만 전달되고 schema 식별자로 사용되면 안 된다.
- **state_transition + recovery:** raw 삭제 성공 뒤 Airbyte delete가 실패하면 재시도 시 raw drop이 멱등이고 local tombstone은 아직 생성되지 않아야 한다.

## 확장 판단

1. **What-if:** 실제 Connector stream 이름이 후보 목록과 다르면 raw를 추정하지 않고 변환 실패로 남긴다.
2. **Boundary:** fresh 90분, stale 24시간, HubSpot raw 7일, 일반 raw 30일, canonical 25개월의 직전·정확한 시각·직후를 검증한다.
3. **Interruption:** OAuth source 생성 후 connection 생성 전에 실패하면 생성한 source를 정리하고 pending local row를 error로 전환한다.
4. **Ordering:** 삭제는 raw를 먼저 처리한다. 민감 raw를 남긴 채 외부 연결 정보만 잃는 상태를 피한다.
5. **Missing data:** 한 공급자 mart가 없으면 다른 공급자 절대값만 표시하고 빠진 값을 0으로 주장하지 않는다.
6. **Stale data:** report freshness는 행의 가장 최근 insert만 보지 않고 관련 connection의 가장 오래된 마지막 성공 시각을 사용한다.

## 후속 라이브 게이트

- 실제 Airbyte Cloud `/v1/streams` 응답 fixture를 connector 버전과 함께 저장한다.
- GA4·GSC 각 14일 예약 sync의 성공률·지연·중복·URL join율을 측정한다.
- 100,000행을 넘는 source는 SQL 기반 incremental transform 또는 page cursor를 도입하기 전 공개 베타에 포함하지 않는다.
