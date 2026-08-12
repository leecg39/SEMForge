# SEMForge 운영·복구 Runbook

<!-- @TASK P4-O1-T1 -->
<!-- @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구 -->

이 문서는 관리형 PostgreSQL·S3 호환 객체 저장소·컨테이너 플랫폼에 적용할 절차 예시다. 저장소의 명령은 외부 시스템을 생성하거나 변경하지 않는다. 운영자는 실제 공급자 문서와 변경 승인을 함께 사용해야 한다.

## 0. 이미지 계약

- `Dockerfile`은 Node 24의 `web`, `worker`, `relay`, `scheduler`, `migrator` target을 제공한다. 모든 target은 UID/GID 10001 `semforge`로 실행한다.
- web은 Next standalone 서버만 포함한다. pipeline/migrator 이미지는 production dependency만 설치하며 `SEMFORGE_SERVICE`가 image 역할과 일치하지 않으면 시작하지 않는다.
- web에는 일반 tenant DSN, auth DSN, tenant billing DSN, Toss webhook·대사용 global billing DSN만 주입하고 operator CLI DSN은 넣지 않는다. worker에는 dispatcher claim DSN과 tenant RLS DSN만, relay에는 dispatcher DSN만, scheduler에는 scheduler DSN만 주입한다. `deploy/env/README.md`의 파일을 분리하고 공유 secret bundle을 사용하지 않는다.
- runtime base의 `/usr/bin/chromium`과 Noto Sans CJK KR은 후속 PDF renderer가 동일한 실행 자산을 사용하도록 고정한다. Chromium sandbox 설정을 약화하는 플래그는 배포 설정에 하드코딩하지 않는다.
- staging에서는 `docker compose build web worker relay scheduler release`로 target을 만들고 `docker compose up`의 release 완료 조건을 확인한다. 운영에서는 각 image를 registry digest로 고정한다.

## 1. Release gate와 migration-first 순서

1. web/worker/relay/scheduler/migrator 이미지를 같은 커밋에서 만들고 immutable digest와 SBOM을 기록한다. 태그만으로 배포하지 않는다.
2. PostgreSQL 자동 백업 성공, 최신 복구 가능 시각, WAL 연속 보관, object versioning 상태를 확인한다.
3. 모든 PostgreSQL URL은 `PGSSLMODE=verify-full`로 연결하고 신뢰할 CA를 이미지 trust store에 설치한다. `sslmode=disable|prefer|require`로 우회하지 않는다.
4. 현재 스키마에서 아래 logical backup을 별도 암호화 저장소에 생성하고 checksum을 기록한다.

   ```bash
   pg_dump --format=custom --no-owner --no-privileges --file=semforge-pre-release.dump "$MIGRATION_DATABASE_URL"
   sha256sum semforge-pre-release.dump
   ```

5. 새 migrator digest로 `deploy/kubernetes/release-job.yaml`의 one-shot Job을 실행한다. exit 0과 migration 로그를 확인하기 전에는 web/worker/relay/scheduler를 변경하지 않는다.
6. scheduler CronJob을 suspend하고 relay와 worker를 drain한 뒤 web을 소수 인스턴스로 교체한다. `/health/live/` 200과 `/health/ready/` 200을 확인한 후 relay, worker 순으로 시작하고 scheduler를 재개해 전체 rollout을 완료한다.
7. 로그에서 `requestId`, `workspaceId`, `jobId`, `provider`로 오류를 추적하되 token, billing key, PII 원문을 저장하지 않는다.

## 2. PostgreSQL TLS, backup, PITR

- 관리형 PostgreSQL 16에서 TLS 인증서 검증, 저장 시 암호화, 자동 backup, WAL archive와 PITR 보존 기간을 활성화한다. 애플리케이션 런타임 역할과 migration owner 역할을 분리한다.
- 월 1회 격리 계정/프로젝트에 PITR 리허설을 수행한다. 원본 인스턴스에 덮어쓰지 말고 새 인스턴스를 목표 시각 직전으로 복구한다.
- 복구 후 schema migration journal, workspace/site 수, 최근 결제·job·outbox 경계를 읽기 전용 쿼리로 비교한다. 승인 후에만 DNS/secret을 새 인스턴스로 전환한다.
- logical restore 연습은 빈 PostgreSQL 16 데이터베이스에서 수행한다.

  ```bash
  pg_restore --exit-on-error --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" semforge-pre-release.dump
  ```

자격증명은 환경 변수나 secret manager로만 전달한다. 명령 출력, 셸 히스토리, 티켓에 DSN 값을 붙이지 않는다.

## 3. 객체 저장소 version restore

- private bucket의 object versioning, 기본 암호화, public access block, 최소 권한 서비스 계정, lifecycle 보존을 배포 전 확인한다.
- 삭제/덮어쓰기 사고 시 bucket 전체를 공개하거나 현재 version을 수정하지 않는다. 영향 object key와 version ID 목록을 만들고 이전 version을 새 복구 prefix에 복사한다.
- checksum, content type, workspace ownership, report snapshot ID를 비교한 뒤 원래 key의 새 version으로 승격한다. signed URL은 모두 만료시키고 재발급한다.
- version ID, checksum, 복구자, 승인자, 시작/종료 시각을 복구 증거에 남긴다. secret·고객 PII는 증거에 포함하지 않는다.

## 4. previous image rollback

1. 실패한 release digest와 마지막 정상 previous image digest를 고정한다. migration은 항상 이전 앱과 호환되는 forward-compatible 변경이어야 하며 자동 down migration을 실행하지 않는다.
2. scheduler를 suspend하고 relay와 worker를 0으로 줄여 신규 publish/claim을 막은 뒤 실행 중 작업의 45초 grace 종료를 기다린다.
3. web, relay, worker, scheduler를 previous image digest로 교체한다. liveness/readiness, 로그인, 읽기 전용 핵심 API, queue/outbox lag를 확인한다.
4. 코드 rollback만으로 해결되지 않는 데이터 손상일 때만 별도 PITR 인스턴스 또는 검증된 `pg_restore` 결과로 전환한다. 원본을 즉시 덮어쓰지 않는다.
5. 실패 원인, 영향 시간, digest, migration version, 검증 결과를 사고 기록에 남긴다.

## 5. 복구 증거 체크리스트

- 변경 승인/사고 번호와 운영자·검토자
- web/worker/relay/scheduler/migrator immutable digest, Git SHA, migration journal
- backup checksum, 관리형 PITR 목표/완료 시각, 복구 인스턴스 ID
- object versioning의 key/version/checksum 표본
- `/health/live/`, `/health/ready/`, worker drain·재시작 결과
- 민감정보가 제거된 JSON 로그와 최종 go/no-go 결정
