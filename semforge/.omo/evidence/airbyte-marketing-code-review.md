# Airbyte Marketing Intelligence 코드 리뷰

검토일: 2026-08-06
범위: `src/server/marketing`, `src/app/api/marketing`, Traffic/연결/광고 UI, 0035 마이그레이션, 환경·운영 문서
방식: 계획 대비 명세 검토 → 구현 품질 검토 → 공식 Airbyte Public API 재대조 → 실패 재현 테스트

## 결론

초기 구현에서 발견한 차단급 데이터 정확성·운영 문제를 수정했다. 현재 로컬 계약 테스트 기준으로 차단급 미해결 항목은 없다. 실제 Airbyte Cloud 계정과 운영 Postgres 자격증명을 사용하는 라이브 연결 검증은 배포 전 별도 게이트로 남는다.

## 발견 및 조치

| 심각도 | 발견 | 영향 | 조치 | 검증 |
|---|---|---|---|---|
| Critical | GSC와 GA4가 별도 배치로 들어오면 나중 배치가 반대편 지표를 0으로 덮음 | 페이지 퍼널 데이터 손실 | fact 테이블을 기준으로 affected key를 재조인해 mart upsert | 분리 배치 PGlite 회귀 테스트 |
| Critical | Airbyte 성공 job을 변환 콜백 없이 성공 처리 | raw만 있고 제품 mart는 비어 있는데 성공으로 표시 | raw read → canonical transform → mart upsert → retention 완료 후에만 성공 처리 | marketing 테스트 및 상태 코드 검토 |
| Critical | Airbyte 예약 job을 로컬에서 발견하지 않음 | 매시간 적재가 제품 화면에 반영되지 않음 | 활성 연결별 최근 sync job discovery를 cron 앞단에 추가 | Adapter 계약 테스트 |
| High | 앱 reader URL을 Airbyte writer·transformer·삭제에 재사용 | 최소권한 위반 또는 운영 실패 | destination writer, transformer, app reader URL을 분리 | 환경 계약·타입 검사 |
| High | 연결 생성의 namespace enum 오기와 스트림 설정 누락 | API 4xx 또는 기본 Full Refresh/수동 연결 | `custom_format`, `/v1/streams`, 시간 단위 incremental deduped 설정 | 공식 명세 및 요청 body 테스트 |
| High | 워크스페이스 공용 raw namespace를 한 연결 삭제 시 함께 제거 | 다른 공급자 raw 데이터 손실 | Airbyte workspace는 1:1 유지하되 raw namespace는 연결별 opaque 값 사용 | namespace 테스트·삭제 순서 테스트 |
| High | raw 삭제 뒤 외부 삭제 순서와 역할이 불명확 | 부분 삭제 시 민감 raw 잔존 | transformer가 raw를 먼저 삭제하고 성공 후 connection/source/tombstone 순서 | 실패 중단·순서 테스트 |
| High | CRM 가명 ID가 전 워크스페이스에서 같은 salt 사용 | 외부 ID가 같은 테넌트 간 상관 가능 | workspace ID를 HMAC 도메인 분리값에 포함 | 교차 테넌트 테스트 |
| Medium | 통합 탭 진입만으로 기존 GSC 7회·시장 4회 API 호출 | 불필요한 비용·지연 | 해당 탭에서만 조회하고 mart 부재 시 GSC 2개 요청으로 폴백 | 코드 검토·기존 브라우저 QA |
| Medium | 폴더 전환 직후 이전 프로젝트 결과가 잠시 표시 | 잘못된 프로젝트 문맥과 오작동 가능 | 폴더 변경 시 결과·연결 목록을 즉시 초기화 | 코드 검토 |
| Medium | attribution snapshot이 CRM flag를 우회 | 비활성 기능 데이터 노출 | snapshot 서비스에서 CRM flag 재검증 | 코드 검토 |
| Medium | raw/PII/canonical 보존 규칙이 문서에만 존재 | 보존기간 위반 | HubSpot raw 7일, 일반 raw 30일, canonical 25개월 purge 구현 | PGlite retention 테스트 |

## 외부 검증 한계

- Airbyte API 토큰, 실제 OAuth 계정, 운영 Postgres 세 역할 자격증명이 없어 라이브 API 호출은 수행하지 않았다.
- Airbyte Connector 버전에 따라 실제 stream 이름·필드가 달라질 수 있으므로 베타 연결 전 `/v1/streams` 응답과 raw table fixture를 실제 계정으로 고정해야 한다.
- Gemini 교차 리뷰 MCP는 현재 환경에 없어 동일 검토를 별도 모델로 반복하지 못했다.
