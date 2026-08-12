#!/usr/bin/env bash
# @TASK P5-PRIVACY-BARRIER - Dedicated PostgreSQL 16 erasure concurrency harness
# @SPEC docs/ops/privacy-erasure-runbook.md
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${project_dir}/compose.pg16.yml"
compose_project="semforge-privacy-barrier-pg16"
pg_port="${SEMFORGE_PRIVACY_PG16_PORT:-55432}"
database_url="postgresql://postgres:semforge_test@127.0.0.1:${pg_port}/semforge_test"
compose_env_file="${project_dir}/.omo/tmp/privacy-pg16-compose-$$.env"

cleanup() {
  docker compose --project-name "${compose_project}" -f "${compose_file}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "${compose_env_file}"
}
trap cleanup EXIT

cleanup
mkdir -p "$(dirname "${compose_env_file}")"
printf 'SEMFORGE_PG16_PORT=%s\n' "${pg_port}" > "${compose_env_file}"
docker compose --env-file "${compose_env_file}" --project-name "${compose_project}" -f "${compose_file}" up --detach --wait

node -e "
const { Client } = require('pg');
const deadline = Date.now() + 30000;
(async function wait() {
  const client = new Client({ connectionString: process.argv[1], ssl: false });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
  } catch (error) {
    await client.end().catch(() => undefined);
    if (Date.now() >= deadline) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return wait();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
" "${database_url}"

export NODE_ENV=test
export PGSSLMODE=disable
export DATABASE_URL="${database_url}"
export MIGRATION_DATABASE_URL="${database_url}"
export PG16_TEST_DATABASE_URL="${database_url}"

cd "${project_dir}"
npm run db:migrate
npm run db:migrate
npm run test:pg16:privacy
