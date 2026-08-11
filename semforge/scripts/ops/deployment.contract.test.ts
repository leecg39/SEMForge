// @TASK P4-O1-T1 - Container and operations artifact contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST Dockerfile, docker-compose.yml, deploy/**, next.config.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("Next production build는 standalone output을 생성한다", async () => {
  assert.match(await source("next.config.ts"), /output:\s*["']standalone["']/u);
});

test("Dockerfile은 Node 24 web/worker/migrator target과 non-root Chromium/Noto runtime을 제공한다", async () => {
  const dockerfile = await source("Dockerfile");

  assert.match(dockerfile, /FROM node:24-bookworm-slim/u);
  for (const target of ["web", "worker", "migrator"]) {
    assert.match(dockerfile, new RegExp(`FROM \\S+ AS ${target}`));
  }
  assert.match(dockerfile, /chromium/u);
  assert.match(dockerfile, /fonts-noto-cjk/u);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/bin\/tini"/u);
  assert.match(dockerfile, /USER semforge/u);
  assert.match(dockerfile, /\.next\/standalone/u);
  const commonRuntime = dockerfile.split("FROM runtime-base AS web", 1)[0]!;
  assert.doesNotMatch(commonRuntime, /HOSTNAME=0\.0\.0\.0/u);
  assert.match(dockerfile, /FROM runtime-base AS web[\s\S]*HOSTNAME=0\.0\.0\.0/u);
});

test("production worker registry는 collectors와 immutable report snapshot을 모두 실행한다", async () => {
  const worker = await source("scripts/ops/worker.ts");

  assert.match(worker, /createRuntimeReportGenerationJobHandler/u);
  assert.match(worker, /"report\.snapshot"/u);
});

test("entrypoint와 compose는 migration 성공 뒤 web/worker를 exec하고 readiness로 승격한다", async () => {
  const [entrypoint, compose] = await Promise.all([
    source("scripts/ops/docker-entrypoint.sh"),
    source("docker-compose.yml"),
  ]);

  assert.match(entrypoint, /preflight\.mjs/u);
  assert.match(entrypoint, /exec node server\.js/u);
  assert.match(entrypoint, /exec node --import tsx scripts\/ops\/worker\.ts/u);
  assert.match(entrypoint, /exec node --import tsx src\/db\/migrate\.ts/u);
  assert.match(compose, /release:/u);
  assert.equal((compose.match(/condition: service_completed_successfully/gu) ?? []).length, 2);
  assert.match(compose, /\/health\/ready/u);
  assert.match(compose, /SEMFORGE_SERVICE:\s*web/u);
  assert.match(compose, /SEMFORGE_SERVICE:\s*worker/u);
  assert.match(compose, /SEMFORGE_SERVICE:\s*migrate/u);
});

test("nginx 예시는 TLS 1.2+, auth rate limit, streaming proxy 보안을 포함한다", async () => {
  const nginx = await source("deploy/nginx/nginx.conf");

  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3/u);
  assert.match(nginx, /limit_req_zone/u);
  assert.match(nginx, /limit_req zone=auth/u);
  assert.match(nginx, /proxy_buffering off/u);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$scheme/u);
});

test("운영 runbook은 TLS/PITR, object version restore, backup, previous-image rollback을 실행 순서로 고정한다", async () => {
  const runbook = await source("deploy/RUNBOOK.md");

  for (const required of [
    "PGSSLMODE=verify-full",
    "PITR",
    "object versioning",
    "pg_dump",
    "pg_restore",
    "previous image",
    "migration-first",
    "복구 증거",
  ]) {
    assert.match(runbook, new RegExp(required, "iu"));
  }
});
