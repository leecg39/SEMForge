# Privacy versioned object-store acceptance evidence

- 기준 커밋: `e039d71321fb4af76b0f5edbf2140b2373f66ab3`
- 실행일: 2026-08-12 (Asia/Seoul)
- 런타임: Node.js 24.14.0, Colima Docker Engine 29.2.0
- 객체 저장소: `quay.io/minio/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e`
- 재현 명령: `./scripts/test-s3-versioning.sh`

## 결과

| 검증 항목 | 관측 결과 |
| --- | --- |
| 대상 workspace canonical prefix | `reports/51000000-0000-4000-8000-000000000001/` |
| DB-known 자산 | object version 2개 + delete marker 1개 |
| PUT 성공/DB 실패 orphan | object version 2개 + delete marker 1개 |
| 대상 전체 fixture | 1,007 version/delete-marker, 2 ListObjectVersions pages |
| 중단 주입 | 영구 삭제 36개 완료 후 37번째 요청 직전에 fetch 경계를 강제 중단 |
| 재시도 | 대상 prefix 0개, 이어지는 독립 목록 조회 2회 모두 0개 |
| 외부 workspace | version/delete-marker 3개가 ID까지 동일하게 보존됨 |
| backup restore 재현 | 대상 prefix에 version 1개 + delete marker 1개 복원 |
| restore 후/retention식 재실행 | 연속 `deleteWorkspaceObjects` 호출 후 독립 목록 조회 2회 모두 0개 |
| 악성 workspace ID | 공급자 요청 전에 `INVALID_OBJECT`로 거부 |
| 혼합 workspace key 응답 | 영구 삭제 요청 0개인 상태로 `PROVIDER_ERROR` fail-closed |
| 전체 테스트 | 17 passed, 0 failed, 0 skipped |

실제 MinIO 테스트는 `eraseWorkspaceReportVersions`와 이를 호출하는
`deleteWorkspaceObjects` 공개 seam을 사용한다. 삭제 중단은 프로세스가 보존할 수 있는
로컬 상태가 없는 S3 요청 경계에서 예외를 주입하고 새 호출로 재시도해, 프로세스 종료 후
재기동과 같은 원격 객체 상태를 검증한다.

## 범위와 제한

- 운영 객체 저장소나 운영 자격증명에는 접근하지 않았다.
- MinIO의 prefix 목록은 규격상 외부 prefix key를 반환하지 않으므로, 악의적/오작동 공급자가
  혼합 key를 반환하는 경우는 같은 하네스가 함께 실행하는 서명된 XML fixture 계약으로 검증했다.
- 이 증거는 S3 호환 버전 삭제 의미론과 재시도 안전성을 입증하며, 특정 관리형 공급자의
  네트워크·IAM·보존 잠금 설정에 대한 운영 승인을 대체하지 않는다.
