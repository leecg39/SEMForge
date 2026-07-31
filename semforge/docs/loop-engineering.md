# Loop Engineering 자동통합 루프 (SEMForge 적용판)

여러 에이전트가 작업을 나눠 수행하고, 오케스트레이터가 결과를 **직접 검증한 뒤에만** 통합하는 실행 규약이다.
원본 일반 문서를 이 저장소의 실측 환경에 맞춰 다시 쓴 것으로, 여기 적힌 명령과 수치는 모두 실제로 실행해 확인한 값이다.

핵심 한 줄: **자동화의 어려운 부분은 자동 병합이 아니라, 작업자의 "완료했습니다"를 믿지 않는 것이다.**

---

## 1. 실행 입력값

| 키 | 값 | 근거 |
|---|---|---|
| REPOSITORY_PATH | `~/orca/workspaces/SEMForge/copepod` | 오케스트레이터 체크아웃 |
| BASE_BRANCH | `main` | `main == origin/main`, 미통합 커밋 0건 |
| INTEGRATION_BRANCH | `loop/<run-id>/integration` | 실행마다 새로 만든다 |
| MAX_PARALLEL_TASKS | **2** | 워크트리당 `node_modules` 비용 + 포트 3개 한계 + 아래 SERP 캐시 문제 |
| MAX_RETRIES_PER_TASK | 3 | |
| MAX_LOOP_CYCLES | 10 | |
| FINAL_MERGE_POLICY | `integration_only` | `main` 병합은 사람 승인 |
| EXTERNAL_CALL_BUDGET | 실행 시작 시 지정 (기본 0 = 실과금 작업 금지) | |

병렬을 2로 낮춘 결정적 이유는 비용이다. SERP 24시간 스냅샷 캐시가 워크트리별 `data/app.db` 에 저장되므로,
워크트리 N개가 같은 키워드를 수집하면 **캐시가 공유되지 않아 N번 결제된다.** 일반 문서의 "병렬 3개" 권장값을 그대로 쓰면 안 된다.

---

## 2. 착수 전 기준선 (BASELINE)

새 변경이 만든 실패와 원래 있던 실패를 구분하려면 착수 시점 값을 먼저 기록한다.
최근 측정값은 다음과 같다. 재측정 없이 이 값을 인용하지 말 것.

| 게이트 | 명령 | 기준선 |
|---|---|---|
| lint | `npm run lint` | exit 0 (0 errors / 15 warnings, 전부 `no-img-element`) |
| typecheck | `npm run typecheck` | exit 0 |
| test | `npm run test` | 53/53 pass, exit 0 |
| build | `npm run build` | **NOT_RUN** — dev 서버와 `.next/` 를 공유해 실행 중 서버를 깨뜨린다 |
| E2E | — | 프레임워크 없음. `npm run loop:smoke` 로 대체 |
| CI | — | 워크플로 없음. 모든 게이트는 로컬 실행 |

warnings 는 기준선에 포함되므로 실패로 보지 않는다. `--max-warnings 0` 을 임의로 켜서 기준을 바꾸지 않는다.

### Node 버전이 먼저다

`better-sqlite3` 가 네이티브 모듈이고 `~/.npmrc` 에 `ignore-scripts=true` 가 걸려 있다.
Node v22 로 돌리면 `NODE_MODULE_VERSION 141` vs `127` 불일치로 전 게이트가 무의미하게 실패한다.
반드시 Homebrew Node v25(`/opt/homebrew/bin`)로 실행한다. `npm run loop:verify` 는 게이트 실행 전에 이 조건을 스스로 확인하고,
어긋나면 모든 게이트를 `ENVIRONMENT_ERROR` + `NOT_RUN` 으로 기록한다.

---

## 3. 검증 게이트

```bash
npm run verify                      # lint → typecheck → test (사람이 쓰는 기본 게이트)
npm run loop:verify -- --task T1    # 오케스트레이터용. 결과를 .loop/validation/T1.json 에 기록
npm run loop:smoke -- --base http://localhost:3020
```

`loop:verify` 종료 코드: `0` 전부 통과, `1` 실패 있음, `2` 실행된 게이트 없음.

**실행하지 못한 검사는 `PASS` 가 아니라 `NOT_RUN` 이고, 반드시 사유를 남긴다.** 이건 타협 대상이 아니다.
`build` 와 `smoke` 는 기본적으로 `NOT_RUN` 이며 `--with-build`, `--with-smoke` 로 명시적으로 켠다.
`build` 는 dev 서버가 없는 워크트리에서만 켤 수 있다.

`loop:smoke` 는 GET 만 보내고 다음을 자동 제외한다.

- 실과금·외부 API 클라이언트를 import 하는 라우트 (`--include-external` 로 포함 가능)
- 파괴적 라우트 하드 제외: `/api/cron/run-due/`, `/api/auth/logout/`, `/api/gsc|gbp/disconnect/`, OAuth 콜백 2종

판정은 "핸들러가 살아 있는가"이다. 2xx=OK, 3xx=OK_REDIRECT, 4xx=OK_CLIENT, **404·5xx·네트워크 실패만 FAIL.**
307 로그인 리다이렉트를 실패로 세지 않기 위해 `redirect: "manual"` 로 요청한다.

---

## 4. 워크트리·브랜치·포트

```bash
npm run loop:bootstrap -- --run <run-id> --task <task-id>
```

워크트리는 저장소 **밖**에 만든다: `~/orca/workspaces/SEMForge/loop-<run-id>-<task-id>`.
브랜치는 `loop/<run-id>/<task-id>`.

워크트리를 만드는 것만으로는 아무것도 실행되지 않는다. `.env*` 와 `/data/` 가 gitignore 라서
새 워크트리에는 API 키도 DB도 없다. 새 지점을 열면서 간판만 걸고 전기·수도·재고를 넣지 않은 상태와 같다.
부트스트랩이 `.env.local` 복사 → Node v25 로 `npm install` → `db:migrate` → `db:seed` → 포트 배정까지 처리한다.

포트: `3000` 원본 체크아웃, `3010` 오케스트레이터, `3020`·`3030` 루프 작업자.

**GSC·GBP OAuth 작업은 병렬 대상이 아니다.** `GSC_REDIRECT_URI` 와 `GBP_REDIRECT_URI` 에 포트가 박혀 있고
그 URI 는 Google Cloud OAuth 클라이언트에 등록된 값이어야 한다. 다른 포트의 워크트리에서 인증을 완료하면
콜백이 엉뚱한 서버로 가서 토큰이 그쪽 DB에 저장된다. 이 계열 작업은 고정 포트에서 직렬로 처리한다.

---

## 5. 작업 분해 계약

각 작업은 다음을 모두 갖춰야 한다. 하나라도 비면 분해가 덜 된 것이다.

`id` / `goal` / `allowedPaths` / `forbiddenPaths` / `dependsOn` / `requiresApproval` / `usesPaidApi` / 완료 조건 / 검증 명령

`allowedPaths` 는 파일 소유권이다. 두 작업의 경로가 겹치면 동시에 실행하지 않는다.
판정은 사람의 눈이 아니라 `src/server/loop/state.ts` 의 `pathsOverlap()` 이 한다.

### 직렬 전용 경로

아래를 건드리는 작업은 **다른 작업이 하나도 없을 때 단독 실행**한다. 최근 커밋 이력에서 변경이 겹치던 파일과 전역 설정이다.

```
src/db/schema/          src/db/migrations/       src/types/crud.ts
src/server/resources.ts src/server/providers/types.ts  src/lib/api.ts
package.json  package-lock.json  tsconfig.json  next.config.ts  drizzle.config.ts  eslint.config.mjs
```

drizzle 마이그레이션은 매번 `migrations/meta/_journal.json` 을 갱신한다. DB 스키마 작업의 병렬화는 구조적으로 불가능하다.

---

## 6. 상태 관리

기계 상태는 `<repo>/.loop/state.json` (gitignore 됨), 거시 목표·진행·블로커는 기존 `.claude/goals/` 를 그대로 쓴다.

상태 스키마와 전이 규칙은 `src/server/loop/state.ts` 에 zod 로 강제돼 있고 `state.test.ts` 25건이 이를 검증한다.
원본 문서와 다른 점 하나: 원본은 `task_queue`, `active_tasks`, `completed_tasks` 를 각각 배열로 두지만,
여기서는 `tasks` 레코드 하나만 두고 나머지는 파생 조회로 얻는다. 같은 사실을 여러 배열에 중복 저장하면 반드시 어긋나기 때문이다.

### 상태 전이

```
QUEUED → READY → RUNNING → WORKER_DONE → VERIFYING → INTEGRATING → INTEGRATED
실패: RETRYING / CONFLICT / BLOCKED / REJECTED
```

`WORKER_DONE` 에서 갈 수 있는 곳은 `VERIFYING` 하나뿐이다. 작업자 보고로 통합에 직행하는 경로는 코드 레벨에서 막혀 있다.

배정은 `selectDispatchableTasks()` 가 결정하며 다음을 모두 만족해야 한다.
슬롯 여유, 선행 작업 `INTEGRATED`, 소유권 미충돌, 직렬 경로면 단독, 승인 완료, 실과금 예산 잔여 + 실과금 작업 동시 1개.

---

## 7. 작업자 지시서

- 당신은 `[TASK_ID]` 만 담당한다. 지정된 워크트리 밖의 파일을 수정하지 않는다.
- `allowedPaths` 를 벗어나지 않는다. 관련 없는 리팩터링·포맷 변경을 하지 않는다.
- 커밋되지 않은 사용자 변경을 덮어쓰지 않는다.
- 구현 후 `npm run verify` 를 직접 실행한다. 실패를 숨기거나 테스트를 지우지 않는다.
- `main` 이나 통합 브랜치에 직접 병합하지 않는다.
- 시크릿을 코드·로그·커밋에 남기지 않는다.

완료 보고 형식:

```text
WORKER_DONE
task_id / status(success|failed|blocked) / branch / commit_sha
changed_files / validation_commands / validation_results
remaining_risks / assumptions
```

커밋하지 못했거나 검증하지 못했다면 `success` 로 보고할 수 없다.

---

## 8. 감독과 검증

작업자가 실행 중인 동안 오케스트레이터는 감독 루프를 유지한다. "루프를 재개하겠다"고 기록하는 것은 재개가 아니다.
활성 작업자가 있는 상태로 턴을 끝내지 않고, 백그라운드 작업 알림과 상태 파일로 실제 진행을 확인한다.

`WORKER_DONE` 을 받으면 보고를 믿지 않고 다음을 직접 확인한다.

1. 커밋과 브랜치가 실제로 존재하는가 (`git log`, `git rev-parse`)
2. `allowedPaths` 밖 변경이 있는가 (`git diff --name-only main...<branch>`) → 있으면 `REJECTED`
3. 임시 코드·디버그 출력·시크릿이 남았는가
4. `npm run loop:verify -- --task <id>` 결과

결과 매핑: 전부 통과 → `INTEGRATING`, 구현 오류 → `RETRYING`, 충돌 → `CONFLICT`,
요구사항 불명확 → `BLOCKED`, 범위 위반·위험한 구현 → `REJECTED`.

실패는 먼저 원인을 분류한다: `IMPLEMENTATION_ERROR` `TEST_ERROR` `ENVIRONMENT_ERROR` `DEPENDENCY_ERROR`
`SPEC_AMBIGUITY` `FLAKY_FAILURE` `BASELINE_FAILURE` `TIMEOUT` `SCOPE_VIOLATION`.
Node 버전 불일치는 거의 항상 `ENVIRONMENT_ERROR` 다. 재시도해도 낫지 않는다.

충돌은 기능 구현과 분리해 전담 처리한다. `ours`/`theirs` 를 기계적으로 고르지 않고 두 작업의 완료 조건을 모두 만족시킨다.
같은 공유 파일에서 반복 충돌하면 그 파일 담당 통합 작업을 새로 만든다.

통합은 한 번에 하나씩. 여러 작업을 몰아서 병합한 뒤 검사하면 어느 병합이 깨뜨렸는지 찾을 수 없다.

---

## 9. 사람 승인 게이트

자동 진행하지 않는다.

- `main` 병합, 운영 배포
- DB 마이그레이션 적용, `npm run db:reset`, `npm run db:cleanup:demo` (데이터 삭제)
- `.env.local` 편집, `APP_SECRET`·`CRON_SECRET` 변경
- OAuth 리다이렉트 URI 변경, GSC·GBP 연결 해제
- 대량 실과금 수집 (TalorData·Firecrawl 배치)
- GBP 리뷰 답글 등록 — 이 저장소에서 유일한 외부 쓰기 경로다

승인을 요청할 때는 막연히 묻지 않는다. 실행할 정확한 명령, 영향받는 데이터, 위험, 롤백 방법, 지금까지의 검증 결과를 함께 제시한다.

---

## 10. 종료 조건

`evaluateExitConditions()` 가 반환하는 `unmet` 이 빈 배열일 때만 종료한다.
대기·실행·검증 미완료·재시도·충돌·차단·거부·승인 대기가 각각 0이어야 하고, 상태 불일치가 없어야 한다.
`loopCycle` 이 `maxLoopCycles` 를 넘으면 무한루프로 판단해 안전하게 멈추고 원인을 보고한다.

하나라도 남아 있으면 "완료"라고 말하지 않는다. 보고서보다 저장소의 실제 상태와 검증 결과가 우선한다.

---

## 11. 원본 문서에서 뺀 항목

정직하게 남긴다. 도구가 없는데 게이트가 있는 척하는 것이 가장 나쁘다.

| 항목 | 이유 |
|---|---|
| E2E 게이트 | Playwright 미설치. `loop:smoke` 로 대체 |
| 보안·성능·접근성 회귀 검사 | 도구 없음. PSI 는 공개 URL 이 필요해 localhost 회귀 측정에 못 쓴다 |
| CI 기반 검증 | `.github/workflows` 없음 |
| 저장소 내부 `.worktrees/` | 이 저장소는 워크트리를 밖에 둔다 |
