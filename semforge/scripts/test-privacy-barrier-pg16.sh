#!/usr/bin/env bash
# @TASK P5-PRIVACY-BARRIER - Dedicated PostgreSQL 16 erasure concurrency harness
# @SPEC docs/ops/privacy-erasure-runbook.md
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${project_dir}/compose.pg16.yml"
compose_project="semforge-privacy-barrier-pg16"
pg_port="${SEMFORGE_PRIVACY_PG16_PORT:-55432}"
database_url="postgresql://postgres:semforge_test@127.0.0.1:${pg_port}/semforge_test"

cleanup() {
  docker compose --project-name "${compose_project}" -f "${compose_file}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
SEMFORGE_PG16_PORT="${pg_port}" docker compose --project-name "${compose_project}" -f "${compose_file}" up --detach --wait

export NODE_ENV=test
export PGSSLMODE=disable
export DATABASE_URL="${database_url}"
export MIGRATION_DATABASE_URL="${database_url}"
export PG16_TEST_DATABASE_URL="${database_url}"

cd "${project_dir}"
npm run db:migrate
npm run db:migrate
./node_modules/.bin/tsx --test src/db/privacy-barrier.pg16.ts
