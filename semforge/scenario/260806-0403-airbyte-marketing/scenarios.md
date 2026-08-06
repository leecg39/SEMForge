# Airbyte Marketing Intelligence 표준 시나리오 25개

범위는 Airbyte Cloud → 연결별 Postgres raw → canonical/mart → SEMForge Traffic·Ads·CRM·PDF이다. NAVER·Bing·TalorData·게시 액션은 제외한다.

### AIR-001 GA4·GSC 정상 통합
**Dimension:** happy_path · **Severity:** Critical
**Actors:** 관리자, Airbyte, transformer
**Precondition:** 두 source와 reader/transformer가 유효하다.
**Trigger:** 시간 단위 두 job이 성공한다.
**Expected Outcome:** URL별 클릭·세션·참여·key events가 한 행에 결합되고 provenance가 표시된다.

### AIR-002 공급자별 비동기 완료
**Dimension:** concurrent · **Severity:** Critical
**Actors:** GSC job, GA4 job
**Precondition:** 같은 날짜·URL fact가 서로 다른 시각에 도착한다.
**Trigger:** GSC 다음 GA4 배치를 별도로 upsert한다.
**Expected Outcome:** 나중 배치가 먼저 저장된 지표를 0으로 덮지 않는다.

### AIR-003 예약 job 자동 발견
**Dimension:** temporal · **Severity:** Critical
**Actors:** Airbyte scheduler, SEMForge cron
**Precondition:** Airbyte가 UI 밖에서 예약 job을 생성했다.
**Trigger:** `marketing_sync` due job이 실행된다.
**Expected Outcome:** 최근 job이 멱등 등록되고 성공 job만 변환된다.

### AIR-004 변환 실패 후 상태
**Dimension:** recovery · **Severity:** Critical
**Actors:** transformer, SQLite control
**Precondition:** Airbyte job은 성공했지만 raw schema가 없다.
**Trigger:** reconcile이 raw를 읽는다.
**Expected Outcome:** 성공으로 기록하지 않고 `MARKETING_TRANSFORM_FAILED`로 정제한다.

### AIR-005 중복 수동 동기화
**Dimension:** concurrent · **Severity:** High
**Actors:** 편집자 두 명, Airbyte
**Precondition:** 같은 connection job이 running이다.
**Trigger:** 동시에 수동 sync를 요청한다.
**Expected Outcome:** 두 번째 요청은 409이고 중복 job을 만들지 않는다.

### AIR-006 잘못된 날짜
**Dimension:** error · **Severity:** Medium
**Actors:** API 사용자
**Precondition:** 인증은 유효하다.
**Trigger:** `2026-02-30`을 조회한다.
**Expected Outcome:** Postgres 조회 전 validation 오류가 발생한다.

### AIR-007 90분·24시간 경계
**Dimension:** temporal · **Severity:** High
**Actors:** 보고서 사용자
**Precondition:** 마지막 성공 시각이 경계 전후다.
**Trigger:** traffic report를 연다.
**Expected Outcome:** 90분까지 fresh, 24시간까지 stale, 이후 unavailable이다.

### AIR-008 마트 부재 시 GSC 폴백
**Dimension:** integration · **Severity:** High
**Actors:** Traffic UI, GSC 직접 API
**Precondition:** GSC는 연결됐고 Airbyte mart는 없다.
**Trigger:** 통합 성과 탭을 연다.
**Expected Outcome:** GSC 절대값만 표시하고 GA4 값은 사용 불가로 명시한다.

### AIR-009 Airbyte 자격증명 누락
**Dimension:** integration · **Severity:** High
**Actors:** 운영자, 연결 API
**Precondition:** token 또는 DB URL이 없다.
**Trigger:** 연결·동기화를 요청한다.
**Expected Outcome:** 가짜 데이터 없이 안전한 unavailable/정제 오류를 반환한다.

### AIR-010 지원하지 않는 sync mode
**Dimension:** data_variation · **Severity:** High
**Actors:** 새 Connector 버전
**Precondition:** 선택 stream이 incremental deduped를 제공하지 않는다.
**Trigger:** connection을 자동 생성한다.
**Expected Outcome:** Full Refresh로 조용히 폴백하지 않고 연결 생성을 중단한다.

### AIR-011 raw namespace 주입
**Dimension:** abuse · **Severity:** Critical
**Actors:** 공격자
**Precondition:** raw namespace 입력 경계에 접근한다.
**Trigger:** SQL 조각이 포함된 namespace로 삭제를 시도한다.
**Expected Outcome:** allowlist 정규식에서 거절되고 SQL이 실행되지 않는다.

### AIR-012 워크스페이스 간 가명 상관
**Dimension:** permission · **Severity:** Critical
**Actors:** 서로 다른 두 고객
**Precondition:** 두 CRM에 같은 external deal ID가 있다.
**Trigger:** 두 워크스페이스를 변환한다.
**Expected Outcome:** 가명 ID가 서로 다르고 원본 PII는 mart에 없다.

### AIR-013 viewer 변경 요청
**Dimension:** permission · **Severity:** High
**Actors:** viewer
**Precondition:** 읽기 전용 세션이다.
**Trigger:** sync 또는 delete를 요청한다.
**Expected Outcome:** 외부 API 호출 전에 거절한다.

### AIR-014 다른 워크스페이스 connection ID
**Dimension:** abuse · **Severity:** Critical
**Actors:** 인증된 공격자
**Precondition:** 타 workspace의 local connection ID를 안다.
**Trigger:** sync/delete를 요청한다.
**Expected Outcome:** workspace 조건 조회가 null을 반환하고 404가 된다.

### AIR-015 연결 삭제 정상 순서
**Dimension:** state_transition · **Severity:** High
**Actors:** 관리자, transformer, Airbyte
**Precondition:** active connection이다.
**Trigger:** 연결 삭제를 확정한다.
**Expected Outcome:** raw → Airbyte connection → source → 비민감 tombstone 순서로 전이한다.

### AIR-016 raw 삭제 실패
**Dimension:** recovery · **Severity:** High
**Actors:** 관리자, 장애 난 Postgres
**Precondition:** raw drop 권한 또는 DB가 실패한다.
**Trigger:** 연결 삭제를 요청한다.
**Expected Outcome:** 외부 source와 local row를 삭제하지 않아 재시도 가능하다.

### AIR-017 OAuth state 재사용·만료
**Dimension:** state_transition · **Severity:** High
**Actors:** 사용자, 공격자
**Precondition:** state가 10분 경과했거나 이미 사용됐다.
**Trigger:** callback을 재호출한다.
**Expected Outcome:** hash·workspace·usedAt·expiresAt 검증에서 거절한다.

### AIR-018 secret·공급자 오류 노출
**Dimension:** abuse · **Severity:** Critical
**Actors:** 외부 공급자, API 사용자
**Precondition:** 원시 오류에 token·이메일·stack이 들어 있다.
**Trigger:** Airbyte가 401/5xx를 반환한다.
**Expected Outcome:** 응답·로그·SQLite에는 정제 오류만 남는다.

### AIR-019 HubSpot PII 보존 경계
**Dimension:** temporal · **Severity:** Critical
**Actors:** retention job
**Precondition:** raw deal이 7일 경계 전후다.
**Trigger:** purge를 실행한다.
**Expected Outcome:** 7일 초과 raw만 삭제하고 canonical 가명 fact는 정책 기간 유지한다.

### AIR-020 URL 변형 결합
**Dimension:** data_variation · **Severity:** High
**Actors:** GSC, GA4
**Precondition:** 대소문자 host, 기본 포트, fragment, UTM, trailing slash가 다르다.
**Trigger:** canonical batch를 upsert한다.
**Expected Outcome:** 동일한 정규화 URL로 결합하되 path case는 보존한다.

### AIR-021 0과 null 지표
**Dimension:** edge_case · **Severity:** Medium
**Actors:** 보고서 사용자
**Precondition:** 세션 또는 비용·전환이 0이다.
**Trigger:** KPI를 계산한다.
**Expected Outcome:** engagementRate·CPA·ROAS는 0으로 꾸미지 않고 null/대시로 표시한다.

### AIR-022 대량 raw 상한
**Dimension:** scale · **Severity:** High
**Actors:** transformer
**Precondition:** 한 stream에 100,000행 수준 데이터가 있다.
**Trigger:** 완료 job을 변환한다.
**Expected Outcome:** 메모리·실행시간을 모니터링하고 부분 데이터를 성공으로 처리하지 않는다.

### AIR-023 스키마 변경
**Dimension:** integration · **Severity:** High
**Actors:** Connector 업데이트
**Precondition:** 비파괴 필드가 추가되거나 stream 이름이 달라진다.
**Trigger:** 다음 sync가 실행된다.
**Expected Outcome:** columns는 전파하되 지원 stream을 찾지 못하면 변환 실패로 명시한다.

### AIR-024 결정적 PDF
**Dimension:** happy_path · **Severity:** Medium
**Actors:** 보고서 사용자, PDF renderer
**Precondition:** versioned snapshot이 저장됐다.
**Trigger:** 같은 snapshot으로 PDF를 두 번 만든다.
**Expected Outcome:** 외부 API 호출 없이 동일한 snapshot provenance만 사용한다.

### AIR-025 반응형·접근성 상태
**Dimension:** edge_case · **Severity:** Medium
**Actors:** 모바일·키보드·스크린리더 사용자
**Precondition:** 390px 또는 1904px 화면이며 데이터가 empty/stale/error다.
**Trigger:** Traffic·연결·광고 화면을 탐색한다.
**Expected Outcome:** 가로 페이지 overflow 없이 label·heading·status가 읽힌다.
