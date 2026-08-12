# SEMForge 유료 베타 법률·운영 출시 게이트

> 이 문서는 운영자가 법률 검토 결과를 제품에 반영하고 유료 출시 여부를 확인하기 위한 기술
> 체크리스트다. 법률 자문이나 준법 판정이 아니며, 실제 사업 형태·처리 흐름·계약 상대방을 기준으로
> 한국 자격을 갖춘 전문가의 검토를 받아야 한다.

## 현재 상태 감사

기존 `/legal/privacy`와 `/legal/terms`는 스스로 “최종 문서가 아님”이라고 표시하면서도 production
웹을 시작하고 Toss 자동결제 API를 호출할 수 있었다. 다음 운영 사실도 코드에서 확정되지 않았다.

- 사업자 상호·대표자·등록번호·주소·전화·이메일
- 개인정보 보호책임자와 권리행사 접수 절차
- 개인정보 항목별 보유기간, 파기 절차와 실제 안전조치
- 처리 활동별 서비스 필수 여부, 처리 근거 유형, 거부 영향과 철회·이의·처리정지 방법
- 실제 처리위탁사와 위탁 목적·보유기간, 제3자 제공 내역
- 실제 국외 이전 수신자·국가·항목·목적·방법·시기·보유기간
- 통신판매업 신고 정보의 적용 여부와 실제 번호
- 청약철회·환불·분쟁 처리 문안과 시행일
- 최종 검토자, 승인 시각, 문서 버전

미확정 상태에서 유료 초대가 나가지 않도록 이제 production `web` 및 `all` 프로필은 승인된
`LEGAL_RELEASE_MANIFEST`가 없으면 실패한다. Docker web entrypoint도 동일하게 exit code 78로
종료하고, billing checkout/authorize는 공통 환경 검증을 통과하지 못하므로 동작하지 않는다.
`build`, `worker`, `relay`, `scheduler`, `migrate`, 개발·테스트 프로필은 공개 문서 값을 요구하지
않아 이미지 빌드와 비결제 파이프라인에 비밀값을 주입하지 않는다.

## 운영자가 확정할 manifest

1. [`legal-release-manifest.template.json`](legal-release-manifest.template.json)을 복사한다.
   처리 활동별 근거·필수성 계약을 추가한 schema version 2만 현재 runtime이 허용한다.
2. 현재 실제 사업자 정보와 실제 공급자 계약·데이터 흐름을 조사한다.
3. `processors`, `thirdPartyDisclosures`, `overseasTransfers`는 각각 별도의 법적 판단 대상이다.
   배열을 비우는 결정도 법률 검토 기록에 근거해야 하며, 단순히 공급자 이름을 모른다는 의미로
   `[]`를 쓰면 안 된다.
4. `processingActivities`는 [`../privacy/data-flow-inventory.md`](../privacy/data-flow-inventory.md)의
   모든 실제 데이터 흐름을 빠짐없이 연결한다. 각 `retentionCategory`는 동일 manifest의
   `retentionRules.category`와 정확히 일치해야 한다. 서비스 필수 처리는
   `required_notice_acknowledgement`로 고지 확인을 기록하고, 선택 동의가 실제로 추가된 경우에만
   `separate_optional_consent`를 사용한다.
5. 통신판매업 신고번호가 실제로 있고 공개 대상이면 입력한다. `null`은 전문가가 적용 여부를
   검토해 공개 번호가 없다고 판단한 경우에만 사용한다.
6. 개인정보 처리방침과 약관의 모든 문안을 실제 운영과 대조한다.
7. 승인 전에는 `release.status`를 `draft`로 유지한다.
8. 승인자가 최종본을 확인한 뒤에만 `status`를 `approved`, `attestation`을
   `paid-beta-legal-review-approved`로 바꾸고 승인자·시각·문서 버전을 기록한다.
9. JSON을 한 줄로 직렬화해 배포 환경의 `LEGAL_RELEASE_MANIFEST`에 넣는다.

```bash
jq -c . docs/release/legal-release-manifest.approved.json
```

승인된 실제 파일에는 공개 개인정보와 운영 정보가 포함될 수 있으므로 저장 위치와 접근 권한을
정한다. 이 저장소에는 실제 값을 커밋하지 않는다. `LEGAL_RELEASE_MANIFEST` 자체는 페이지에 공개될
정보지만, 배포 변경 권한은 secret manager 수준으로 통제한다.

## fail-closed 계약

다음 조건 중 하나라도 발생하면 production web 시작이 거부된다.

- manifest 누락, 64 KiB 초과, JSON 손상 또는 알 수 없는 필드
- 승인 상태·고정 attestation·승인자·승인시각·문서 버전 누락
- `TODO`, `TBD`, `미정`, `추후 확정`, `example.com` 등 placeholder
- 사업자등록번호 형식, 이메일, 시행일 또는 필수 운영 문안 오류
- 개인정보 보유 규칙 0건
- 처리 활동 0건, 승인 보유 category와 연결되지 않은 처리 활동, 서비스 필수 처리를 선택 동의로
  위장한 경우
- 처리위탁·제3자 제공·국외 이전을 조사하지 않아 배열 자체가 누락된 경우
- 월 49,000원(VAT 포함), 월 자동결제, 기간 말 취소라는 제품 계약과 manifest 불일치

검증 명령:

```bash
npm test -- src/app/legal/release.test.ts src/lib/env.test.ts scripts/ops/runtime.test.mjs
npm run typecheck
npm run build
```

## 유료 초대 전 사람 확인 체크리스트

- [ ] 사업자·통신판매 관련 공개 정보의 적용 여부와 값 확인
- [ ] 수집 항목·목적·보유기간이 DB 스키마, 로그, 백업, 이메일, 객체 저장소와 일치
- [ ] membership 역할, 결제/order/card last4, audit/DSAR JSONB, suppression/backup hash,
      billing tombstone과 `legal_hold` 해제 절차까지 데이터 맵에 포함
- [ ] 초대의 단일 필수 checkbox는 이용약관 동의와 처리방침 확인만 기록하며 개인정보 처리의
      포괄 동의라고 표시하지 않음
- [ ] 서비스 필수 처리의 근거와 선택 처리(있는 경우)의 별도 미선택 동의·철회 경로를 각각 검토
- [ ] Google, TalorData, NAVER, Toss, Resend, PostgreSQL 호스팅, S3 호환 저장소를 계약과
      실제 리전 기준으로 처리위탁·제3자 제공·국외 이전 중 올바르게 분류
- [ ] 계정 삭제, 백업 만료, 로그 보존, 결제 증빙 보존을 실제로 실행할 수 있음
- [ ] 개인정보 권리행사와 고객지원 이메일·전화의 수신·담당·응답 절차 확인
- [ ] 청약철회, 구독 취소, 법정 환불, 중복·오류 결제, 차지백 절차 확인
- [ ] 약관·처리방침 시행일과 기존 이용자 고지 절차 확인
- [ ] 승인 manifest를 staging에 넣고 두 법률 페이지의 한글·모바일 렌더링 확인
- [ ] production web preflight 통과 로그와 승인본의 `documentVersion` 일치 확인
- [ ] 위 항목의 증거와 최종 승인자를 변경관리 티켓에 보존
- [ ] [`../ops/privacy-incident-response-runbook.md`](../ops/privacy-incident-response-runbook.md)으로
      발견 시각·증거 보존·72시간 decision gate·고객/정보주체 통지 dry-run 완료
- [ ] DSAR export와 deletion-target 열람의 `privacy.export.read`,
      `privacy.deletion_targets.read` 감사 event가 원문 PII 없이 생성됨

## 공식 확인 출처

아래 링크는 체크리스트의 범위를 정하는 출발점일 뿐, 사업별 적용 여부를 대신 판단하지 않는다.

- 개인정보 처리 목적·보유기간·제3자 제공·파기 등을 포함한 처리방침 수립·공개:
  [개인정보 보호법 제30조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398435)
- 계약 이행을 위한 처리위탁·보관 방식의 국외 이전 시 공개·통지 검토:
  [개인정보 보호법 제28조의8](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029331979)
- 홈페이지에 처리방침을 지속 게재하는 공개 방식:
  [개인정보 보호법 시행령 제31조](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079801)
- 통신판매 청약 단계의 사업자 신원·거래조건·청약철회 정보:
  [전자상거래법 제13조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1027062829)
- 처리 근거를 구분하고 동의 하나를 모든 처리의 보편 근거로 단정하지 않기 위한 출발점:
  [개인정보 보호법 제15조](https://law.go.kr/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1029331575),
  [GDPR Articles 6·7](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- 처리정지·동의 철회 및 적용 가능한 거절 사유 통지:
  [개인정보 보호법 제37조](https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398509)

법령과 지침은 변경될 수 있으므로 실제 승인일에 최신 원문을 다시 확인한다.
