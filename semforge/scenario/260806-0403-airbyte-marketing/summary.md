# 시나리오 탐색 요약

- 깊이: standard
- 생성: 25개
- 차원: 12/12 포함
- 결과: 24개 로컬 검증, 1개 조건부 라이브 부하 게이트
- Critical: 9개, High: 12개, Medium: 4개

## 탐색이 구현에 만든 변화

1. 별도 GSC·GA4 배치가 서로의 수치를 지우는 mart 결합 결함을 회귀 테스트로 고정했다.
2. 수동 job뿐 아니라 Airbyte 예약 job을 cron이 발견하도록 추가했다.
3. Airbyte 연결 생성이 공식 `custom_format`과 incremental deduped stream 설정을 사용하도록 수정했다.
4. 연결별 raw namespace, writer/transformer/reader 자격증명 분리, workspace별 CRM HMAC 도메인 분리를 적용했다.
5. HubSpot raw 7일·일반 raw 30일·canonical 25개월 보존 실행 코드를 추가했다.
6. 통합 mart가 없을 때 기존 GSC 직접 조회를 제한적으로 폴백하고 GA4 값은 사용 불가로 표시했다.

## 출시 판정

코드·로컬 QA는 통과 후보이다. 공개 베타 전에는 실제 Airbyte Cloud와 세 Postgres 역할로 AIR-001, AIR-003, AIR-008, AIR-022를 다시 실행하고 14일 PoC 성공률·지연·중복·비용을 기록해야 한다.
