# 런타임별 환경 파일

<!-- @TASK P4-O1-T1 -->

`docker-compose.yml`은 저장소 밖의 secret manager에서 내려받은 역할별 파일을 사용한다. 실제 `*.env`는 Git에서 제외하며 권한을 `0600`으로 제한한다. 한 파일을 여러 프로세스가 공유하지 않는다.

| 파일 | 필수 PostgreSQL 역할 | 그 밖의 값 |
| --- | --- | --- |
| `migration.env` | `MIGRATION_DATABASE_URL` | `NODE_ENV=production`, `PGSSLMODE=verify-full` |
| `web.env` | `DATABASE_URL`, `AUTH_DATABASE_URL`, `BILLING_TENANT_DATABASE_URL`, `BILLING_DATABASE_URL` | `AUTH_TRUST_PROXY_HEADERS=true`, web 인증·tenant 결제·Toss webhook 대사 secret, S3 호환 저장소 5종 |
| `worker.env` | `AUTH_DATABASE_URL`, `DISPATCHER_DATABASE_URL`, `WORKER_DATABASE_URL` | collector secret, `APP_PUBLIC_URL`, Resend 2종, S3 호환 저장소 5종, `CHROMIUM_EXECUTABLE_PATH` |
| `relay.env` | `DISPATCHER_DATABASE_URL` | secret 없음 |
| `scheduler.env` | `SCHEDULER_DATABASE_URL` | secret 없음 |
| `operator.env` | `OPERATOR_DATABASE_URL` | 승인 함수 실행 전용. executor/retention/provider secret 주입 금지 |
| `privacy.env` | `PRIVACY_DATABASE_URL` | 수동 export/correct/delete용 `APP_SECRET`, `APP_SECRET_CURRENT_KEY_ID`, S3 호환 저장소 5종 |
| `retention.env` | `PRIVACY_RETENTION_DATABASE_URL` | `PRIVACY_RETENTION_POLICY`, S3 호환 저장소 5종. `APP_SECRET`와 Google client credential 주입 금지 |

`SEMFORGE_SERVICE`는 Compose가 이미지 역할에 맞게 덮어쓴다. dispatcher는 job claim/outbox 전용이며 worker는 tenant RLS transaction 전용이다. `BILLING_TENANT_DATABASE_URL`은 사용자 요청에서 `app.workspace_id`가 설정된 트랜잭션에만 사용하고, `BILLING_DATABASE_URL`은 Toss webhook·조회 대사에만 사용한다. `OPERATOR_DATABASE_URL`은 초대와 개인정보 요청 승인 CLI 실행 시 별도 secret으로 주입하며 web/privacy/retention 파일에 넣지 않는다. scheduler 역할은 활성 workspace를 순회하는 예약 작업만 수행한다.

운영자 초대는 저장소 체크아웃 또는 승인된 운영 job에서 `NODE_ENV=production PGSSLMODE=verify-full OPERATOR_DATABASE_URL=… npm run invite -- --email … --workspace-name …`으로 실행한다. 이 프로세스의 `SEMFORGE_SERVICE=operator`는 스크립트가 고정하며 다른 애플리케이션 DSN이나 provider secret을 요구하지 않는다.

개인정보 보존기간 정리는 매일 03:15 KST에 `privacy-retention` 명령으로 한 번 실행한다. Compose 운영 환경에서는 외부 scheduler가 `docker compose --profile scheduled run --rm privacy-retention`을 호출하고, Kubernetes에서는 `semforge-daily-privacy-retention` CronJob이 같은 명령을 호출한다. 두 실행 경로는 `SEMFORGE_RETENTION_ENV_FILE`로 주입한 `retention.env`와 별도 `semforge-retention` secret만 사용한다. retention runtime에는 `APP_SECRET`, `PRIVACY_DATABASE_URL`, Google client credential을 주입하지 않으며 preflight도 이를 거부한다.

개인 export/correct/delete와 workspace closure는 schedule에 포함하지 않고 승인과 실행을 두 역할로 나눈다. 개인 요청은 승인자가 `privacy-request --workspace <uuid> --request <id> --operator <id> --type export|correction|erasure --subject-user <uuid>`로 정보주체를 바인딩한 뒤 executor가 같은 identity와 `privacy-export`, `privacy-correct`, `privacy-delete`를 실행한다. 전체 workspace 폐쇄는 subject 없이 `--type workspace_deletion`으로 승인하고 `privacy-delete-workspace`로만 실행한다. 마지막 owner의 개인 삭제는 소유권 이전 없이는 DB가 거부한다. 삭제 runtime은 GSC refresh token 자체를 Google revoke endpoint로 보내므로 Google client credential을 요구하지 않는다. 암호화 토큰 복호화와 버전 관리 객체 삭제에 필요한 앱 키와 S3 자격증명은 `SEMFORGE_PRIVACY_ENV_FILE`의 `privacy.env`에만 두며, 시작 전 preflight가 검증하고 누락하면 exit 78로 종료한다.

`privacy.env`의 S3 자격증명은 대상 private bucket으로만 제한하고 최소 `s3:ListBucketVersions`(bucket resource)와 `s3:DeleteObjectVersion`(bucket object resource)을 허용해야 한다. 일반 `s3:DeleteObject`만으로는 versioned bucket의 과거 버전과 delete marker가 영구 삭제되지 않으므로 개인정보 삭제 권한으로 충분하지 않다. 보존기간 작업은 삭제 marker의 객체 key를 매 실행마다 다시 열거해 백업·복원으로 되살아난 version도 재삭제한다.

production web 컨테이너는 nginx backend network에서만 접근 가능해야 한다. nginx가 `X-Real-IP`를 `$remote_addr`로 덮어쓰고 XFF의 오른쪽 hop에 같은 주소를 남기는 현재 설정에서만 `AUTH_TRUST_PROXY_HEADERS=true`를 사용한다. 이 값이 없거나 false이면 production web은 IP 제한 없이 시작하지 않고 fail-closed 한다.
