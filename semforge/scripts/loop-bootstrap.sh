#!/usr/bin/env bash

set -euo pipefail

readonly LOG_PREFIX="[loop-bootstrap]"
readonly WORKTREE_PARENT="/Users/user01/orca/workspaces/SEMForge"

RUN_ID=""
TASK_ID=""
BASE_BRANCH="main"
REQUESTED_PORT=""
NODE_BIN=""
WORKTREE_PATH=""
BRANCH_NAME=""

log() {
  printf '%s %s\n' "$LOG_PREFIX" "$*"
}

warn() {
  printf '%s 경고: %s\n' "$LOG_PREFIX" "$*" >&2
}

fail() {
  printf '%s 오류: %s\n' "$LOG_PREFIX" "$*" >&2
  exit 1
}

usage() {
  printf '%s 사용법: npm run loop:bootstrap -- --run <run-id> --task <task-id> [--base <branch>] [--port <n>]\n' "$LOG_PREFIX" >&2
}

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --run)
        (( $# >= 2 )) || { usage; fail "--run 값이 필요합니다."; }
        RUN_ID="$2"
        shift 2
        ;;
      --task)
        (( $# >= 2 )) || { usage; fail "--task 값이 필요합니다."; }
        TASK_ID="$2"
        shift 2
        ;;
      --base)
        (( $# >= 2 )) || { usage; fail "--base 값이 필요합니다."; }
        BASE_BRANCH="$2"
        shift 2
        ;;
      --port)
        (( $# >= 2 )) || { usage; fail "--port 값이 필요합니다."; }
        REQUESTED_PORT="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        usage
        fail "알 수 없는 인자입니다: $1"
        ;;
    esac
  done
}

validate_identifier() {
  local label="$1"
  local value="$2"

  [[ -n "$value" ]] || { usage; fail "$label 값은 필수입니다."; }
  [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || \
    fail "$label 값에는 영문자, 숫자, 점(.), 밑줄(_), 하이픈(-)만 사용할 수 있습니다: $value"
}

validate_port() {
  local raw_port="$1"
  local port_number

  [[ "$raw_port" =~ ^[0-9]+$ ]] || fail "포트는 숫자여야 합니다: $raw_port"
  port_number=$((10#$raw_port))
  (( port_number >= 1 && port_number <= 65535 )) || \
    fail "포트는 1부터 65535 사이여야 합니다: $raw_port"
  (( port_number != 3000 && port_number != 3010 )) || \
    fail "포트 $port_number 은(는) 예약되어 있습니다. 3000과 3010은 사용할 수 없습니다."
  REQUESTED_PORT="$port_number"
}

node_major_version() {
  local bin_dir="$1"
  local version

  version="$(PATH="$bin_dir:$PATH" node --version 2>/dev/null)" || return 1
  version="${version#v}"
  [[ "${version%%.*}" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "${version%%.*}"
}

resolve_node_bin() {
  local configured="${LOOP_NODE_BIN:-}"
  local homebrew_major=""
  local current_node=""
  local version=""

  if [[ -n "$configured" ]]; then
    if [[ -d "$configured" && -x "$configured/node" ]]; then
      NODE_BIN="${configured%/}"
    elif [[ -x "$configured" && "${configured##*/}" == "node" ]]; then
      NODE_BIN="$(dirname "$configured")"
    else
      fail "LOOP_NODE_BIN에서 실행 가능한 node를 찾을 수 없습니다: $configured"
    fi
  elif [[ -x /opt/homebrew/bin/node ]]; then
    homebrew_major="$(node_major_version /opt/homebrew/bin || true)"
    if [[ -n "$homebrew_major" ]] && (( homebrew_major >= 25 )); then
      NODE_BIN="/opt/homebrew/bin"
    fi
  fi

  if [[ -z "$NODE_BIN" ]]; then
    current_node="$(command -v node || true)"
    [[ -n "$current_node" ]] || fail "PATH에서 node를 찾지 못했습니다. Node v25 이상을 설치하세요."
    NODE_BIN="$(dirname "$current_node")"
    warn "Homebrew Node v25 이상을 찾지 못해 현재 PATH의 Node를 사용합니다. 네이티브 모듈 버전을 확인하세요."
  fi

  version="$(PATH="$NODE_BIN:$PATH" node --version 2>/dev/null)" || \
    fail "선택한 경로에서 Node 버전을 확인할 수 없습니다: $NODE_BIN"
  PATH="$NODE_BIN:$PATH" command -v npm >/dev/null 2>&1 || \
    fail "선택한 Node 경로에서 npm을 찾을 수 없습니다: $NODE_BIN"
  log "사용할 Node: $version ($NODE_BIN)"
}

preflight() {
  local env_source="$REPO_ROOT/semforge/.env.local"

  [[ "$BASE_BRANCH" != -* ]] || fail "--base 값은 하이픈(-)으로 시작할 수 없습니다: $BASE_BRANCH"
  git rev-parse --verify --quiet "${BASE_BRANCH}^{commit}" >/dev/null || \
    fail "기준 브랜치 또는 커밋을 찾을 수 없습니다: $BASE_BRANCH"
  [[ ! -e "$WORKTREE_PATH" && ! -L "$WORKTREE_PATH" ]] || \
    fail "워크트리 경로가 이미 존재합니다. 다른 run-id/task-id를 사용하세요: $WORKTREE_PATH"
  ! git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" || \
    fail "브랜치가 이미 존재합니다. 다른 run-id/task-id를 사용하세요: $BRANCH_NAME"
  [[ -f "$env_source" ]] || \
    fail "환경 파일이 없습니다: $env_source — 원본 체크아웃에 .env.local을 먼저 준비하세요."
  command -v lsof >/dev/null 2>&1 || \
    fail "포트 점유 확인에 필요한 lsof를 찾을 수 없습니다. lsof를 설치한 뒤 다시 실행하세요."
}

create_worktree() {
  log "워크트리를 생성합니다: $WORKTREE_PATH"
  if ! git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"; then
    fail "워크트리 생성에 실패했습니다. git 상태와 기준 브랜치 '$BASE_BRANCH'를 확인하세요."
  fi
}

copy_environment() {
  local source_file="$REPO_ROOT/semforge/.env.local"
  local target_file="$WORKTREE_PATH/semforge/.env.local"
  local variable_count

  if ! cp -p "$source_file" "$target_file"; then
    fail ".env.local 복사에 실패했습니다. 원본과 대상 경로의 권한을 확인하세요."
  fi
  variable_count="$(awk '
    /^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ { count++ }
    END { print count + 0 }
  ' "$target_file")"
  # bash 3.2 는 뒤에 붙는 한글을 변수명으로 삼으므로 중괄호로 경계를 명시한다.
  log ".env.local 복사 완료: 환경 변수 ${variable_count}개"
}

run_npm_setup() {
  local app_dir="$WORKTREE_PATH/semforge"

  log "의존성을 설치합니다."
  if ! (cd "$app_dir" && PATH="$NODE_BIN:$PATH" npm install); then
    fail "npm install에 실패했습니다. 네트워크와 Node 버전을 확인하세요. 생성된 워크트리는 자동 삭제하지 않았습니다."
  fi

  # ~/.npmrc 의 ignore-scripts=true 는 공급망 보호 설정이다. install 전체에서 끄면
  # 모든 의존성의 설치 스크립트가 실행되므로, AGENTS.md 지침대로 네이티브 모듈
  # 하나를 재빌드할 때만 범위를 좁혀 예외를 준다.
  log "better-sqlite3 네이티브 모듈을 재빌드합니다."
  if ! (cd "$app_dir" && PATH="$NODE_BIN:$PATH" npm rebuild better-sqlite3 --ignore-scripts=false); then
    fail "better-sqlite3 재빌드에 실패했습니다. Node 버전과 빌드 도구를 확인하세요."
  fi

  log "데이터베이스 마이그레이션을 실행합니다."
  if ! (cd "$app_dir" && PATH="$NODE_BIN:$PATH" npm run db:migrate); then
    fail "db:migrate에 실패했습니다. DATABASE_PATH와 Node 네이티브 모듈 상태를 확인하세요."
  fi

  log "초기 데이터를 생성합니다."
  if ! (cd "$app_dir" && PATH="$NODE_BIN:$PATH" npm run db:seed); then
    fail "db:seed에 실패했습니다. 마이그레이션 결과와 데이터베이스 권한을 확인하세요."
  fi
}

port_is_busy() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

assign_port() {
  local candidate

  if [[ -n "$REQUESTED_PORT" ]]; then
    port_is_busy "$REQUESTED_PORT" && \
      fail "요청한 포트가 이미 사용 중입니다: $REQUESTED_PORT"
    printf '%s\n' "$REQUESTED_PORT"
    return
  fi

  for (( candidate = 3020; candidate <= 65530; candidate += 10 )); do
    if ! port_is_busy "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  fail "3020부터 10 단위로 확인했지만 사용 가능한 포트를 찾지 못했습니다."
}

read_env_value() {
  local env_file="$1"
  local target_key="$2"

  awk -v target="$target_key" '
    {
      line = $0
      sub(/^[[:space:]]*/, "", line)
      sub(/^export[[:space:]]+/, "", line)
      prefix = target
      if (substr(line, 1, length(prefix)) == prefix) {
        rest = substr(line, length(prefix) + 1)
        if (rest ~ /^[[:space:]]*=/) {
          sub(/^[[:space:]]*=[[:space:]]*/, "", rest)
          value = rest
        }
      }
    }
    END { print value }
  ' "$env_file"
}

warn_oauth_port_mismatch() {
  local assigned_port="$1"
  local env_file="$WORKTREE_PATH/semforge/.env.local"
  local key label value embedded_port

  for key in GSC_REDIRECT_URI GBP_REDIRECT_URI; do
    label="${key%%_REDIRECT_URI}"
    value="$(read_env_value "$env_file" "$key")"
    value="${value%$'\r'}"
    if (( ${#value} >= 2 )) && \
      { [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || \
        [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; }; then
      value="${value:1:${#value}-2}"
    fi
    if [[ "$value" =~ :([0-9]{1,5})(/|$) ]]; then
      embedded_port="${BASH_REMATCH[1]}"
      if (( 10#$embedded_port != assigned_port )); then
        warn "$key 포트($embedded_port)가 배정 포트($assigned_port)와 다릅니다. 이 워크트리에서 $label OAuth 연결은 동작하지 않습니다."
      fi
    fi
  done
}

update_registry() {
  local port="$1"
  local registry="$REPO_ROOT/.loop/worktrees.json"

  mkdir -p "$REPO_ROOT/.loop"
  if ! PATH="$NODE_BIN:$PATH" node -e '
    const fs = require("node:fs");
    const [file, runId, taskId, branch, worktreePath, rawPort] = process.argv.slice(1);
    try {
      let entries = [];
      if (fs.existsSync(file)) {
        entries = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!Array.isArray(entries)) throw new Error("최상위 JSON 값이 배열이 아닙니다.");
      }
      entries.push({
        runId,
        taskId,
        branch,
        path: worktreePath,
        port: Number(rawPort),
        createdAt: new Date().toISOString(),
      });
      const tempFile = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(tempFile, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
      fs.renameSync(tempFile, file);
    } catch (error) {
      console.error(`[loop-bootstrap] 오류: 워크트리 레지스트리 갱신 실패: ${error.message}`);
      process.exit(1);
    }
  ' "$registry" "$RUN_ID" "$TASK_ID" "$BRANCH_NAME" "$WORKTREE_PATH" "$port"; then
    fail "레지스트리를 갱신하지 못했습니다. $registry 파일 형식과 권한을 확인하세요."
  fi
  log "워크트리 레지스트리를 갱신했습니다: $registry"
}

print_summary() {
  local port="$1"

  log "부트스트랩 완료"
  log "워크트리 경로: $WORKTREE_PATH"
  log "브랜치: $BRANCH_NAME"
  log "포트: $port"
  log "다음 실행 명령: cd '$WORKTREE_PATH/semforge' && PATH='$NODE_BIN':\"\$PATH\" npm run dev -- --port $port"
}

main() {
  local assigned_port

  parse_args "$@"
  validate_identifier "run-id" "$RUN_ID"
  validate_identifier "task-id" "$TASK_ID"
  [[ -z "$REQUESTED_PORT" ]] || validate_port "$REQUESTED_PORT"

  REPO_ROOT="$(git rev-parse --show-toplevel)" || \
    fail "Git 저장소 루트를 찾을 수 없습니다. 저장소 안에서 실행하세요."
  readonly REPO_ROOT
  WORKTREE_PATH="$WORKTREE_PARENT/loop-$RUN_ID-$TASK_ID"
  BRANCH_NAME="loop/$RUN_ID/$TASK_ID"

  resolve_node_bin
  preflight
  create_worktree
  copy_environment
  run_npm_setup
  assigned_port="$(assign_port)"
  log "개발 서버 포트를 배정했습니다: $assigned_port"
  warn_oauth_port_mismatch "$assigned_port"
  update_registry "$assigned_port"
  print_summary "$assigned_port"
}

main "$@"
