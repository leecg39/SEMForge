#!/usr/bin/env bash
# @TASK P3-W1-T1 - Mandatory PostgreSQL 16 multi-session CI harness
# @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${project_dir}/compose.pg16.yml"
pg_port="${SEMFORGE_PG16_PORT:-55432}"
database_url="postgresql://postgres:semforge_test@127.0.0.1:${pg_port}/semforge_test"
compose_env_file="${project_dir}/.omo/tmp/pg16-compose-$$.env"

cleanup() {
  docker compose -f "${compose_file}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "${compose_env_file}"
}
trap cleanup EXIT

cleanup
mkdir -p "$(dirname "${compose_env_file}")"
printf 'SEMFORGE_PG16_PORT=%s\n' "${pg_port}" > "${compose_env_file}"
docker compose --env-file "${compose_env_file}" -f "${compose_file}" up --detach --wait

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

npm run db:migrate
npm run db:migrate
npm run test:pg16
npm run test:pg16:privacy
