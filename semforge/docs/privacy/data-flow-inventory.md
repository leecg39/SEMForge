# SEMForge 개인정보·데이터 흐름 명세

> 상태: 코드 기준 기술 인벤토리. 법률 자문이나 적법성 판정이 아니다. 운영 수신자, 처리 근거,
> 보유기간, 국외 이전 및 법정 보존은 승인된 `LEGAL_RELEASE_MANIFEST`와 실제 공급자 계약으로만
> 확정한다.

## 판정 원칙과 fail-closed 경계

- 이 문서의 데이터 위치는 `src/db/schema/core.ts`, `src/db/migrations/0000_core.sql`, 외부 공급자
  어댑터, `src/server/observability/logger.ts`, DSAR 구현을 기준으로 한다.
- 저장소에는 승인된 실제 `LEGAL_RELEASE_MANIFEST`를 커밋하지 않는다. 따라서 이 문서 작성 시점에
  실제 보유기간, 처리자 법인명, 국가 및 법적 역할은 **미승인**이다.
- production web은 처리 활동과 보유 규칙을 포함한 승인 manifest가 없으면 시작하지 않는다.
  `processingActivities[].retentionCategory`는 정확히 하나의 `retentionRules[].category`를 참조해야
  하며, 일치하지 않으면 검증이 실패한다.
- `PRIVACY_RETENTION_POLICY`는 실제 삭제 작업의 일수 설정이고 `LEGAL_RELEASE_MANIFEST`는 공개할
  승인 문안이다. 운영자는 두 값을 항목별로 대조해야 한다. 어느 한쪽에도 기본값이나 추정값을
  넣지 않는다.
- 고객이 입력하는 자유 텍스트, 질의, URL, JSONB에는 예상하지 않은 개인정보가 포함될 수 있다.
  명시적 필드만 검사해서 “PII 없음”으로 판정하지 않는다.

분류는 다음 의미로 사용한다.

| 분류 | 의미 |
| --- | --- |
| 직접 식별자 | 이메일, 담당자 이름, 전달 수신자처럼 사람을 직접 식별할 수 있는 값 |
| 인증·비밀 | 비밀번호 해시, 세션·reset 해시, OAuth/billing key 등 계정 또는 공급자 권한을 부여하는 값 |
| 가명·간접 식별자 | UUID, 해시, IP 기반 throttle key, 결제 식별자처럼 다른 정보와 결합해 식별될 수 있는 값 |
| 고객 업무 데이터 | 사이트, 검색 질의, 리포트, 브랜딩 등 고객이 관리하는 업무 데이터. 자연인과 연결되면 개인정보가 될 수 있음 |
| 재무·거래 데이터 | 결제 상태, 주문·결제 키, 카드 브랜드·끝 4자리, ledger와 분쟁 자료 |
| 공개 검색 파생 데이터 | 공개 검색 결과 URL·제목·본문·인용 및 집계 데이터. 원문에 개인정보가 포함될 가능성이 있음 |

## 저장 데이터 인벤토리

| 영역·실제 위치 | 데이터와 분류 | 보호·접근 경계 | 삭제·보유 경계 |
| --- | --- | --- | --- |
| `users` | 이메일·담당자 이름(직접), 비밀번호 해시·검증 시각·disabled 상태(인증) | 이메일은 평문 DB 필드, 비밀번호는 일방향 해시. identity/auth 역할로 제한 | workspace 삭제 시 다른 workspace 멤버십이 없는 사용자는 비식별 이메일로 치환·비활성화. 실제 기간은 manifest `retentionRules` 승인값만 사용 |
| `workspaces`, `memberships` | 대행사 이름·slug·logo URL·강조색·사용자 UUID·역할(owner/admin/member) | tenant FK/RLS와 역할 분리. 이름·logo URL은 자연인/개인사업자와 연결될 수 있음 | 삭제 시 workspace 업무 데이터 제거·비식별화. 역할 및 계약 증거 보유기간은 manifest 필요 |
| `invites`, `legal_acceptances` | 초대 이메일, workspace 이름/slug, 문서 version/SHA, 제시·확인 시각 | 초대 token은 해시만 저장, 7일·1회용. 법률 문서 identity는 승인 manifest에서 생성 | 사용·만료 초대는 `PRIVACY_RETENTION_POLICY.consumedInvitesDays`; 공개 기간은 연결된 승인 retention category 필요 |
| `sessions`, `password_resets`, `auth_action_throttles` | 사용자/workspace UUID, token hash, expiry/revocation, IP·이메일 기반 throttle hash와 횟수 | 원문 token/IP/email을 저장하지 않고 해시. auth 역할과 RLS | 각각 `expiredSessionsDays`, `passwordResetsDays`; throttle 보유 규칙은 현재 자동 retention 대상이 아니므로 승인·운영 정책에서 별도 결정 전 출시 차단 |
| `oauth_states` | workspace/user UUID, state hash, GSC 연결 label, return path, 만료·소비 시각 | state 원문 미저장, 10분·1회용 검증 | `oauthStatesDays`; manifest 연결 필요 |
| `gsc_connections`, `gsc_property_bindings` | 연결 label, Google access/refresh token, property URI | token은 workspace·connection·token-type AAD에 묶인 versioned AES-256-GCM. readonly scope | 연결 해제·DSAR 때 Google revoke 후 로컬 삭제. 공급자 잔존 기간과 로컬 기간은 manifest에서 승인 |
| `sites`, `tracked_queries` | 사이트 이름·도메인·timezone, 검색 키워드/AIO 프롬프트 | tenant FK/RLS. 자유 텍스트·URL은 잠재 개인정보로 취급 | workspace erasure에서 삭제. 실제 기간은 승인 retention category 필요 |
| `provider_calls`, `usage_reservations` | 공급자/작업, request hash, 상태, 비용, response metadata(JSONB) | raw 응답 본문을 로그에 남기지 않는 어댑터 계약. JSONB에는 예기치 않은 식별자가 들어갈 수 있음 | `providerRawMetadataDays`가 만료된 `response_metadata.rawResponse`만 제거. 나머지 metadata와 행 자체의 기간은 manifest 필요 |
| `jobs`, `outbox` | 작업 type, JSONB payload, idempotency key, lease·오류 | tenant/worker 역할. password-reset 전달 정보는 AES-GCM envelope이며 terminal trigger가 제거 | `terminalJobsDays`, `publishedOutboxDays`; 비정상/비종료 queue와 오류 문자열의 별도 기간을 manifest/운영 정책에 명시 |
| `rank_observations`, `aio_observations`, `aio_citations` | 질의 연결, URL·제목·AI answer·인용(고객 업무/공개 검색 파생) | tenant FK/RLS, provenance/provider call 연결 | workspace erasure에서 삭제. 리포트 목적 기간은 manifest 필요 |
| `naver_observations`, `naver_observation_sources` | 검색량, 추이, 인구통계 집계, 블로그 결과 규모, 오류·JSONB metadata | 집계 데이터 중심이나 query와 provider metadata는 간접 식별 가능 | workspace erasure에서 삭제. 기간은 manifest 필요 |
| `gsc_observations` | query/page 등 dimensions JSONB, clicks/impressions/CTR/position | tenant FK/RLS. Search Console 집계라도 dimensions는 잠재 개인정보로 분류 | workspace erasure에서 삭제. Google 및 로컬 기간은 manifest 필요 |
| `weekly_reports`, `report_sections` | 기간, 불변 snapshot/section JSONB, brand name/logo/accent | snapshot 이후 DB trigger로 불변. tenant RLS | DSAR erasure 전용 절차에서만 삭제. 계약 종료·백업 기간은 manifest 필요 |
| `report_assets`, S3 `reports/{workspaceId}/` | PDF storage key, checksum/크기; PDF 본문과 logo | private S3-compatible storage, short-lived signed URL, 업로드 시 SSE `AES256` 요청. 실제 버킷 암호화·비공개·TLS는 운영 증거가 필요 | 모든 object version/delete marker purge 후 DB 삭제. lifecycle 기간은 승인 manifest와 실제 버킷 정책이 일치해야 함 |
| `deliveries` | 이메일 수신자(직접), 상태·오류·시각 | tenant/worker 경계, provider 직전 suppression 확인 | `deliveryRecipientDays` 후 수신자 해시 치환; DSAR 시 즉시 해시 치환. 행/오류 보유는 manifest 필요 |
| `billing_customers`, `payment_methods` | Toss customer key, AES-GCM billing key, fingerprint, card brand/last4 | billing 역할 분리. billing key는 workspace·payment-method AAD에 묶인 versioned AES-256-GCM | DSAR 시 key 폐기·식별자 해시·카드 표시정보 제거. 거래 보존의 실제 근거/기간은 법률 승인 필요 |
| `subscriptions`, `payments`, `provider_events`, `billing_ledger_events` | 구독, order/payment key, 실패정보, Toss webhook JSONB, 금액·상태·ledger metadata | idempotency/고유 제약, billing 역할. JSONB/error에 PII를 넣지 않는 운영 규칙 필요 | DSAR 시 provider event와 ledger metadata 비식별화, 결제 식별자 해시. 세금·환불·분쟁·차지백·법적 보존 기간은 manifest에 구체 승인 필요 |
| `audit_events` | actor UUID, action, entity/request 식별자, metadata(JSONB), 시각 | tenant insert 정책. DSAR export와 deletion-target read는 원문 없이 category/count만 기록 | DSAR 시 actor 제거·식별자 해시·metadata 교체. 보안 감사 보유기간은 manifest와 운영 log 정책에 필요 |
| `privacy_requests`, `privacy_request_steps` | 외부 request ID, operator ID, subject user UUID, 상태, 오류·metadata | operator 승인 역할과 privacy 실행 역할 분리, exact request binding | workspace erasure 증거로 남을 수 있음. operator/request ID에 PII 금지; 보유·법적 보존은 manifest 승인 필요 |
| `email_suppressions` | workspace별 SHA-256 수신자 hash | 삭제 후 재발송 방지를 위한 가명 식별자, privacy 역할 관리 | 삭제 방지 목적과 기간을 manifest에 승인. 원문 복원 불가라도 개인정보 가능성을 배제하지 않음 |
| `privacy_billing_tombstones` | Toss customer key 집계 hash, `legal_hold`, retained reason | 원 결제 key 대신 hash. 현재 생성 시 `legal_hold=true` | hold 해제 주체·검토 주기·삭제 기준이 코드로 자동화되지 않음. 승인 절차 없이는 유료 출시 P2 미해결로 취급 |
| `backup_deletion_markers` | request UUID, object key hashes, storage prefix, runbook ref | 원 object key 대신 SHA-256 목록. 복구 후 삭제 재적용 표식 | PITR/object lifecycle 만료와 복구 리허설에 따라 제거 여부 결정. 실제 기간은 manifest/backup 정책 필요 |

## 외부 데이터 흐름과 수신자 승인

아래 표는 코드가 만드는 **기술적 전송 후보**다. “처리위탁”, “제3자 제공”, “국외 이전” 여부와
수신자의 정확한 법인명·국가·보유기간을 이 문서가 결정하지 않는다. 운영자는 실제 계약과 리전을
조사해 승인 manifest의 `processors`, `thirdPartyDisclosures`, `overseasTransfers` 중 해당 배열에
기록해야 한다. 빈 배열도 법률 검토 결과일 때만 허용한다.

| 기술 공급자/목적 | 전송 가능 데이터 | 반환·저장 | 승인 전 검증 |
| --- | --- | --- | --- |
| Google Search Console OAuth/API | readonly OAuth token, property URI, 날짜·dimensions 조회 | token 암호문, GSC 집계 관측값 | Google 계약 주체·리전/국외 이전·token 취급·retention을 manifest와 대조 |
| TalorData Google SERP/AIO | 정규화 질의, 한국/한국어/desktop 조건, 등록 도메인 매칭 정보 | 순위, URL/제목, AIO answer/citation과 provenance | 실제 요청 payload와 공급자 보유기간·재사용 여부 승인 |
| NAVER Search Ads/DataLab/Search API | 키워드, 기간 및 집계 조건 | 검색량·추이·인구통계 집계·블로그 결과 규모 | 각 API 운영 주체, 로그/보유, 전달 목적을 승인 |
| Toss Payments | customer/order ID, billing authorization key, 금액·기간, 결제 상태 | 암호화 billing key, payment/webhook/ledger | 결제·법정 증빙의 처리 역할, 보유기간, 오류/차지백 절차 승인 |
| Resend | 수신 이메일, 제목/본문, 서명 URL | delivery 상태·provider 결과 | 발송 도메인, 처리자 법인, 국가, 로그·본문 retention 승인 |
| 관리형 PostgreSQL | 위 DB 인벤토리 전체 | DB/PITR backup | 운영사·리전·암호화·PITR 기간·지원자 접근 승인 |
| S3 호환 객체 저장소 | PDF와 logo, workspace prefix/metadata | versioned object | 운영사·리전·private ACL/policy·SSE·version lifecycle 승인 |

## 구조화 로그

`src/server/observability/logger.ts`는 `requestId`, `workspaceId`, `jobId`, `provider`를 상관관계
필드로 남기며 이메일, 전화번호, 주소, 이름, token, password, API/billing key, authorization,
DB 비밀번호를 key 및 문자열 패턴으로 마스킹한다. 다음 제한은 운영 승인 대상이다.

- `workspaceId`, `requestId`, `jobId` 자체는 가명·간접 식별자다. 로그 접근권한과 기간은
  `LEGAL_RELEASE_MANIFEST`의 대응 retention category 및 실제 log backend 정책으로 확정한다.
- 정규식 마스킹은 임의 JSONB/free text의 모든 개인정보를 보장하지 않는다. 공급자 원문, query,
  URL, response body, DSAR payload를 로그 context에 넣지 않는다.
- 이 저장소는 실제 log 수집업체·리전·retention을 증명하지 않는다. 외부 log backend를 추가하면
  데이터 흐름과 manifest를 다시 승인한다.

## 민감 열람 감사 범위와 알려진 공백

| 행위 | 현재 감사 증거 | 내용 제한 |
| --- | --- | --- |
| DSAR export payload 열람 | `audit_events.action = privacy.export.read` | request UUID/외부 request ID, 포함 category와 건수만 기록. 이메일·이름·token·리포트 본문 미기록 |
| 삭제 대상(GSC token 암호문, object key, 수신자) 열람 | `audit_events.action = privacy.deletion_targets.read` | category와 건수만 기록. token·key·recipient 원문 미기록 |
| DSAR 외부 처리 단계 | `privacy_request_steps` | step key, 성공/실패, 시도 횟수, 정제된 오류와 hash metadata |
| job/outbox/provider 실패 | `audit_events`와 provider/queue 상태 | dead/retry/provider 단계는 구현된 action별로 기록 |

알려진 공백은 다음과 같다.

- 일반 웹 UI의 모든 정상 조회를 행 단위 `audit_events`로 기록하지 않는다. RLS·세션 인증과 구조화
  request log가 경계이며, DB 감사 확장 또는 managed DB audit log는 배포 환경 증거가 없다.
- `audit_events.metadata`, `privacy_requests.metadata`, `privacy_request_steps.metadata`, provider/webhook
  JSONB는 쓰기 지점의 allowlist가 완전하지 않다. 운영자는 PII 원문 금지 규칙과 정기 표본 감사를
  적용해야 한다.
- `privacy_billing_tombstones.legal_hold`의 해제·승인 event는 자동 생성되지 않는다. 정기 법무 검토와
  이중 승인 절차를 확정하기 전에는 영구 보존으로 방치해서는 안 된다.
- 로그 backend 관리자 열람, 객체 저장소 관리자 다운로드, DB 운영자 조회는 앱 `audit_events`에
  기록되지 않는다. 공급자 audit log 활성화와 보유기간 증거가 별도 출시 게이트다.

## 서비스 필수 처리와 선택 처리

- 초대 화면의 단일 필수 checkbox는 **이용약관 동의와 개인정보 처리방침 확인**을 기록한다. 이를
  모든 개인정보 처리에 대한 포괄 동의로 해석하거나 표시하지 않는다.
- 승인 manifest의 각 `processingActivities`는 `requiredForService`, `noticeMode`, `basisType`, 세부
  처리 근거, 거부 영향 및 철회·이의·처리정지 방법을 별도로 가진다.
- 현재 제품에는 마케팅 등 선택 처리 흐름을 정의하지 않는다. 향후 동의 기반 선택 처리를 추가할
  때는 `requiredForService=false`, `noticeMode=separate_optional_consent`, `basisType=consent`를
  사용하고 기본 미선택·별도 기록·동등한 철회 경로를 구현한 뒤 출시한다.
- 동의 철회가 동의 전 처리의 적법성을 소급해 바꾸는 것으로 표현하지 않으며, 계약·법적 의무 등
  다른 승인 근거가 있는 처리를 자동 중단한다고 약속하지 않는다. 요청별 적용 범위와 거절 사유는
  개인정보 보호책임자/법무가 결정하고 이용자에게 안내한다.

## 운영 승인 체크

- [ ] 모든 실제 DB/JSONB/object/log 항목이 `processingActivities`와 retention category에 연결됨
- [ ] `PRIVACY_RETENTION_POLICY` 일수와 공개 retention 문안 및 공급자 lifecycle이 일치함
- [ ] Google, TalorData, NAVER, Toss, Resend, DB, object storage의 정확한 법인·국가·역할·기간 확정
- [ ] `privacy_billing_tombstones.legal_hold` 검토자, 근거, 만료·해제, 삭제와 감사 증거 확정
- [ ] managed DB/object/log의 관리자 접근 감사와 log retention 증거 첨부
- [ ] restored backup에서 `backup_deletion_markers` 재적용 및 suppression 유지 리허설 통과
- [ ] 자유 텍스트·JSONB에 원치 않는 PII가 없는지 production-like 표본 검사

## 공식 기준 출처

- GDPR 처리 원칙·처리 근거·동의 조건·정보주체 권리·침해 통지:
  [Regulation (EU) 2016/679 공식 원문](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- 개인정보 수집·이용 근거는 동의 하나로 한정되지 않으며 적용 근거를 구분해야 함:
  [개인정보 보호법 제15조](https://law.go.kr/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1029331575)
- 처리정지와 동의 철회 요구 및 예외 사유 통지:
  [개인정보 보호법 제37조](https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398509)
- 정정·삭제 및 복구·재생 방지:
  [개인정보 보호법 제36조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335317)

법령은 변경될 수 있으므로 실제 승인일에 최신 공식 원문과 사업 적용 범위를 다시 검토한다.
