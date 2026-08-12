# SEMForge 개인정보 침해·유출 대응 런북

> 기술 대응 절차이며 법률 자문이 아니다. GDPR, 개인정보 보호법(PIPA), 계약상 고객/처리자 통지의
> 적용 여부와 내용은 개인정보 보호책임자 및 자격 있는 법률 검토자가 사건별로 결정한다. 적용
> 범위를 알 수 없다는 이유로 조사·증거 보존·시간 기록을 늦추지 않는다.

## 1. 개시 조건과 역할

다음 중 하나면 즉시 사건을 개시한다: 무단 DB/object/log 접근, token·billing key 노출 가능성,
tenant 간 데이터 노출, 잘못된 이메일/PDF 전달, 공급자 침해 통지, 삭제 데이터 복원, 무결성 훼손,
개인정보를 포함할 수 있는 시스템의 분실·탈취.

실제 담당자는 승인된 `LEGAL_RELEASE_MANIFEST`와 운영 on-call 문서에서 채운다.

| 역할 | 책임 | 사건 기록 값 |
| --- | --- | --- |
| Incident Commander | 대응 우선순위·상태·복구 승인 | `<INCIDENT_COMMANDER>` |
| Security Lead | 격리, 포렌식, 공격 경로·재발 방지 | `<SECURITY_LEAD>` |
| Privacy Officer/DPO | 개인정보 범위·위험 평가·정보주체 권리 | manifest `privacy.officerName` / `<DPO_IF_APPLICABLE>` |
| Legal Decision Owner | 관할·통지 의무·법적 보존 판단 | `<QUALIFIED_LEGAL_REVIEWER>` |
| Communications/Support | 승인 문안으로 고객·정보주체 문의 대응 | `<COMMUNICATIONS_OWNER>` |
| Processor Liaison | Google/TalorData/NAVER/Toss/Resend/DB/S3 등 연락 | `<PROVIDER_LIAISON>` |

값이 미지정이면 유료 production 운영은 승인하지 않는다.

## 2. 발견 시각과 72시간 시계

1. 최초 알림을 받은 사람이 incident ID를 만들고 다음 시각을 변경 불가능한 기록에 UTC와 KST로
   남긴다.
   - `first_signal_at`: 최초 신호
   - `awareness_assessment_started_at`: 합리적인 침해 가능성을 조사하기 시작한 시각
   - `awareness_at`: 조직이 개인정보 침해 발생을 인지했다고 법무/DPO가 판단한 시각
   - `decision_at`, `notification_at`, `containment_at`
2. `awareness_at`은 사건 병합, 담당자 교대, 영향 범위 증가로 재설정하지 않는다. 미확정이면
   `LEGAL_DECISION_PENDING`으로 두되 `first_signal_at`부터 내부 72시간 countdown을 가시화한다.
3. GDPR이 적용되고 위험 예외가 성립하지 않는다고 결정되면 감독기관 통지는 인지 후 가능한 한
   72시간 이내라는 Article 33 기준을 사용한다. 72시간을 넘기면 지연 사유도 준비한다.
4. PIPA 신고 대상과 72시간 기준은 개인정보 보호법 제34조 및 시행령 제40조의 사건별 요건을
   법무가 판정한다. 정보주체 통지 범위·시점도 별도 판정한다.
5. 법적 의무가 불확실해도 24시간, 48시간, 60시간 내부 검토 checkpoint를 취소하지 않는다.

## 3. 첫 60분: 보존과 안전한 격리

- 침해 가능 시스템, workspace, 공급자, 데이터 class, 발견자를 기록한다.
- 관련 application/DB/object/storage/provider/audit 로그를 원본 보존하고 SHA-256, 수집자, 시각,
  원본 위치, 사본 위치를 chain-of-custody에 기록한다.
- VM/container snapshot, 배포 image digest, DB PITR 시각, object version ID, IAM 변경 이력을 보존한다.
- ticket/chat에 token, 이메일, PDF 본문, query 원문을 붙이지 않는다. 암호화된 restricted evidence
  vault를 사용하고 접근자를 기록한다.
- 공격자 session/token/key를 폐기하고 네트워크·role을 최소 범위로 격리한다. 증거를 확보하기 전에
  광범위 삭제·로그 rotate·DB 재작성은 하지 않는다.
- tenant 오염이면 affected workspace의 side effect를 차단하고 email/report/billing/provider job을
  중지한다. 결제 중지는 Incident Commander와 billing owner가 중복 청구 위험까지 함께 판단한다.
- 공급자 사고라면 계약상 긴급 연락 경로로 보존 요청과 사건 번호를 받는다.

## 4. 사실·범위·위험 평가

다음 표를 근거 링크와 함께 작성한다. 모르는 값은 `UNKNOWN`으로 남기고 추정치를 사실처럼 쓰지
않는다.

| 판단 항목 | 기록 내용 |
| --- | --- |
| 침해 성격 | 기밀성/무결성/가용성, 우발/악의, exfiltration 증거 |
| 데이터 | `docs/privacy/data-flow-inventory.md`의 class, 필드, 암호화/해시 상태, 복호화 key 노출 여부 |
| 규모 | 정보주체·workspace·record의 확인 수와 최대 가능 수 |
| 사람·지역 | 고객/멤버/수신자/기타 정보주체, 거주·관할은 확인된 사실만 |
| 재식별성 | UUID/hash/집계의 결합 가능성, 공격자가 가진 보조 정보 |
| 피해 가능성 | 사칭, 계정 탈취, 결제 사기, 기밀 유출, 평판·경제·권리 제한 |
| 완화 | token revoke, key rotation, 접근 차단, object 삭제, 잘못 전달된 수신자의 삭제 확인 |
| 지속 위험 | backup/cache/email inbox/provider copy, 공격자 지속 접근, 미확인 log gap |

위험 평가는 “암호화됨” 하나로 종료하지 않는다. key 또는 AAD context 노출, token 유효성, recipient의
실제 접근, 공개 검색 데이터와 고객 데이터 결합 가능성을 확인한다.

## 5. 법률·통지 결정 게이트

모든 결정은 `YES / NO / PENDING`, 결정자, 시각, 법적 근거, 증거를 기록한다.

### Gate A — 역할과 관할

- SEMForge가 해당 데이터 흐름에서 controller/개인정보처리자인지 processor/수탁자인지 계약별 판정
- 한국 PIPA 적용 여부, EU 정보주체·사업장/표적 제공 등 GDPR 적용 여부, 다른 관할 여부
- 공급자 또는 고객에게 “without undue delay” 등 계약상 선행 통지가 있는지 확인

### Gate B — GDPR (적용되는 경우만)

- 감독기관: 자연인의 권리·자유에 대한 risk가 unlikely인지 Article 33 기준으로 판단
- 정보주체: high risk인지 Article 34 기준으로 판단하고, 해당되면 불필요한 지체 없이 명확한 언어로
  통지
- processor 지위이면 controller 고객에게 지체 없이 통지할 계약/Article 33(2) 경로 확인
- 72시간 내 완전한 정보가 없으면 단계적 통지가 가능한지 법무가 판단하고 후속 제출 일정을 기록

### Gate C — PIPA/한국 (적용되는 경우만)

- 개인정보 보호법 제34조의 정보주체 통지 항목·시점·대체 공지 요건 판단
- 시행령 제40조의 신고 기준(규모, 민감/고유식별정보, 외부 불법 접근 등) 충족 여부와 72시간 신고
  필요성 판단
- 신고 기관·전문기관 및 방법은 사건 시점의 개인정보보호위원회/KISA 공식 안내에서 재확인
- 고객사가 개인정보처리자이고 SEMForge가 수탁자인 데이터는 계약·법령상 고객 통지 경로를 별도
  결정

### Gate D — 보존 충돌과 복구

- DSAR deletion, retention, legal hold, 수사/분쟁 보존이 충돌하면 Legal Decision Owner가 범위·기간·
  최소 보존 형태를 승인
- `privacy_billing_tombstones.legal_hold`는 사건 발생만으로 영구 연장하지 않는다. review date와 release
  owner를 기록

## 6. 통지 패킷

승인되지 않은 초안은 외부 발송하지 않는다. 관할별 필수 항목을 법무가 확정하되 최소한 다음 사실을
준비한다.

- 사건 성격, 발생/인지/격리 시각과 경위
- 영향받은 개인정보 category, 정보주체·record의 확인/추정 규모
- 개인정보 보호책임자 또는 연락 창구
- 예상 영향과 피해 완화 방법
- 이미 수행했거나 계획한 대응·재발 방지
- 정보주체가 취할 조치, 지원·문의·구제 경로
- 미확정 항목과 후속 통지 시각
- 72시간 후 제출이면 지연 사유

발송 전 recipient list를 별도 검토하고 테스트 주소로 렌더링을 검증한다. incident 통지 자체가 추가
개인정보 유출을 만들지 않도록 BCC/개별 발송, 서명 URL, 첨부파일 접근권한을 확인한다.

## 7. 복구와 종료

- 침해 원인을 제거한 새 image/key/role로 복구하고 이전 취약 image rollback을 금지한다.
- session/OAuth/billing/API key rotation 또는 revoke 결과를 공급자 조회로 확인한다.
- PITR/object restore를 했다면 `backup_deletion_markers`를 재적용하고 erased workspace·suppression이
  되살아나지 않았는지 검증한다.
- tenant 격리, 중복 청구, 이메일 오발송, signed URL, 감사 event를 production-like 시나리오로 재검증한다.
- DPO/법무가 통지·후속 통지·보존을 닫고 Incident Commander가 재개를 승인하기 전 side effect를
  재개하지 않는다.
- 종료 후 5영업일 내 원인, timeline, 영향, 결정 근거, 통지, corrective action owner/date를 남긴다.

## 8. 훈련 승인 기준

- [ ] `first_signal_at`부터 15분 이내 사건 개시·역할 호출
- [ ] 60분 이내 증거 보존·token/tenant side-effect 격리 결정
- [ ] 24/48/60/72시간 checkpoint와 법무 decision log 재현
- [ ] GDPR/PIPA/계약상 통지를 각각 별도 gate로 평가
- [ ] 가짜 고객에게 잘못 보내지 않는 notification dry-run
- [ ] backup restore 뒤 삭제 marker·suppression 재적용
- [ ] 실제 담당자와 공급자 연락처를 restricted 운영 문서에서 확인

## 공식 기준 출처

- GDPR Article 33은 적용되는 controller의 감독기관 통지, 72시간 기준, 단계적 제공과 사건 기록을;
  Article 34는 high risk 시 정보주체 통지를 다룬다:
  [Regulation (EU) 2016/679 공식 원문](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- 개인정보 유출 등의 정보주체 통지·신고 항목:
  [개인정보 보호법 제34조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398739)
- PIPA 신고 대상과 72시간, 우선 신고·추가 신고:
  [개인정보 보호법 시행령 제40조](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0040&lsiSeq=286175&urlMode=lsScJoRltInfoR)
- 신고 기준·기관에 대한 개인정보보호위원회 공식 안내:
  [개인정보 유출 신고 제도](https://www.pipc.go.kr/np/default/page.do?mCode=D030040000)

법령과 기관 안내는 변경될 수 있으므로 사건 발생 시점의 최신 공식 원문을 다시 확인한다.
