#!/usr/bin/env bash
# @TASK P3-W1-T1 - Mandatory PostgreSQL 16 multi-session CI harness
# @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${project_dir}/compose.pg16.yml"
pg_port="${SEMFORGE_PG16_PORT:-55432}"
database_url="postgresql://postgres:semforge_test@127.0.0.1:${pg_port}/semforge_test"

cleanup() {
  docker compose -f "${compose_file}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker compose -f "${compose_file}" up --detach --wait

export NODE_ENV=test
export PGSSLMODE=disable
export DATABASE_URL="${database_url}"
export MIGRATION_DATABASE_URL="${database_url}"
export PG16_TEST_DATABASE_URL="${database_url}"

npm run db:migrate
npm run db:migrate
npm run test:pg16
