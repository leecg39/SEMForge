# 런타임별 환경 파일

<!-- @TASK P4-O1-T1 -->

`docker-compose.yml`은 저장소 밖의 secret manager에서 내려받은 역할별 파일을 사용한다. 실제 `*.env`는 Git에서 제외하며 권한을 `0600`으로 제한한다. 한 파일을 여러 프로세스가 공유하지 않는다.

| 파일 | 필수 PostgreSQL 역할 | 그 밖의 값 |
| --- | --- | --- |
| `migration.env` | `MIGRATION_DATABASE_URL` | `NODE_ENV=production`, `PGSSLMODE=verify-full` |
| `web.env` | `DATABASE_URL`, `AUTH_DATABASE_URL`, `OPERATOR_DATABASE_URL`, `BILLING_DATABASE_URL` | `AUTH_TRUST_PROXY_HEADERS=true`, web 인증·결제 secret, S3 호환 저장소 5종 |
| `worker.env` | `AUTH_DATABASE_URL`, `DISPATCHER_DATABASE_URL`, `WORKER_DATABASE_URL` | collector secret, `APP_PUBLIC_URL`, Resend 2종, S3 호환 저장소 5종, `CHROMIUM_EXECUTABLE_PATH` |
| `relay.env` | `DISPATCHER_DATABASE_URL` | secret 없음 |
| `scheduler.env` | `SCHEDULER_DATABASE_URL` | secret 없음 |

`SEMFORGE_SERVICE`는 Compose가 이미지 역할에 맞게 덮어쓴다. dispatcher는 job claim/outbox 전용이며 worker는 tenant RLS transaction 전용이다. scheduler 역할은 활성 workspace를 순회하는 예약 작업만 수행한다.

production web 컨테이너는 nginx backend network에서만 접근 가능해야 한다. nginx가 `X-Real-IP`를 `$remote_addr`로 덮어쓰고 XFF의 오른쪽 hop에 같은 주소를 남기는 현재 설정에서만 `AUTH_TRUST_PROXY_HEADERS=true`를 사용한다. 이 값이 없거나 false이면 production web은 IP 제한 없이 시작하지 않고 fail-closed 한다.
