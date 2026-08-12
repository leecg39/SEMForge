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

test("package build script는 secret 없는 build service profile을 강제한다", async () => {
  const packageJson = JSON.parse(await source("package.json")) as {
    scripts?: Record<string, string>;
  };
  const build = packageJson.scripts?.build ?? "";

  assert.match(build, /SEMFORGE_SERVICE=build/u);
  assert.doesNotMatch(build, /DATABASE_URL|SECRET|TOKEN/u);
});

test("Dockerfile은 Node 24 web/pipeline/migrator target과 non-root Chromium/Noto runtime을 제공한다", async () => {
  const dockerfile = await source("Dockerfile");

  assert.match(dockerfile, /FROM node:24-bookworm-slim/u);
  for (const target of ["web", "worker", "relay", "scheduler", "migrator"]) {
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

  const builder = dockerfile.slice(
    dockerfile.indexOf("FROM dependencies AS builder"),
    dockerfile.indexOf("FROM base AS production-dependencies"),
  );
  assert.match(builder, /SEMFORGE_SERVICE=build/u);
  assert.doesNotMatch(builder, /(?:ARG|ENV)\s+\w*(?:SECRET|TOKEN|DATABASE_URL)/u);
});

test("Docker worker는 dispatcher claim과 tenant DB가 분리된 production composition을 사용한다", async () => {
  const [worker, production] = await Promise.all([
    source("scripts/ops/worker.ts"),
    source("src/worker/production.ts"),
  ]);

  assert.match(worker, /createProductionWorkerComposition/u);
  assert.doesNotMatch(worker, /getPool\(|new WorkerRuntime|createTalordataGoogleProvider/u);
  assert.match(production, /database:\s*dispatcherPool/u);
  assert.match(production, /tenantDatabase:\s*workerPool/u);
  assert.match(production, /token:\s*requireEnv\(env,\s*"TALORDATA_API_TOKEN"\)/u);
  assert.match(production, /createRuntimeReportJobHandlers\(\{/u);
  assert.match(production, /workerDatabase:\s*workerPool/u);
  assert.match(production, /authDatabase:\s*authPool/u);
  assert.match(production, /createBillingAccessGuardedJobHandler\(\{ database: workerPool, delegate \}\)/u);
  assert.match(production, /google:\s*billingGuard\(google\)/u);
  assert.match(production, /naver:\s*billingGuard\(naver\)/u);
  assert.match(production, /gsc:\s*billingGuard\(gsc\)/u);
  assert.match(production, /"report\.snapshot":\s*billingGuard\(reports\["report\.snapshot"\]\)/u);
});

test("entrypoint와 compose는 migration 성공 뒤 web/worker/relay와 collection/report scheduler를 분리 실행한다", async () => {
  const [entrypoint, compose] = await Promise.all([
    source("scripts/ops/docker-entrypoint.sh"),
    source("docker-compose.yml"),
  ]);

  assert.match(entrypoint, /preflight\.mjs/u);
  assert.match(entrypoint, /exec node server\.js/u);
  assert.match(entrypoint, /exec node --import tsx scripts\/ops\/worker\.ts/u);
  assert.match(entrypoint, /exec node --import tsx scripts\/ops\/relay\.ts/u);
  assert.match(entrypoint, /exec node --import tsx scripts\/ops\/scheduler\.ts/u);
  assert.match(entrypoint, /exec node --import tsx scripts\/ops\/report-scheduler\.ts/u);
  assert.match(entrypoint, /exec node --import tsx src\/db\/migrate\.ts/u);
  assert.match(compose, /release:/u);
  assert.equal((compose.match(/condition: service_completed_successfully/gu) ?? []).length, 5);
  assert.match(compose, /report-scheduler:/u);
  assert.match(compose, /command:\s*\["report-scheduler"\]/u);
  assert.match(compose, /\/health\/ready/u);
  for (const profile of ["web", "worker", "relay", "scheduler", "migrate"]) {
    assert.match(compose, new RegExp(`SEMFORGE_SERVICE:\\s*${profile}`));
  }
  for (const envFile of ["WEB", "WORKER", "RELAY", "SCHEDULER", "MIGRATION"]) {
    assert.match(compose, new RegExp(`SEMFORGE_${envFile}_ENV_FILE`));
  }
});

test("Kubernetes 예시는 worker/relay와 일요일 collection·월요일 report scheduler를 분리한다", async () => {
  const deployment = await source("deploy/kubernetes/pipeline-runtime.yaml");
  const worker = deployment.match(/name:\s*semforge-worker[\s\S]*?(?=---)/u)?.[0] ?? "";
  const relay = deployment.match(/name:\s*semforge-relay[\s\S]*?(?=---)/u)?.[0] ?? "";
  const collectionScheduler = deployment.match(
    /name:\s*semforge-weekly-collection-scheduler[\s\S]*?(?=---)/u,
  )?.[0] ?? "";
  const reportScheduler = deployment.match(
    /name:\s*semforge-weekly-report-scheduler[\s\S]*/u,
  )?.[0] ?? "";
  const reportRuntimeVariables = [
    "APP_PUBLIC_URL",
    "AUTH_DATABASE_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHROMIUM_EXECUTABLE_PATH",
  ];

  assert.match(deployment, /kind:\s*Deployment[\s\S]*name:\s*semforge-worker/u);
  for (const required of [
    "AUTH_DATABASE_URL",
    "DISPATCHER_DATABASE_URL",
    "WORKER_DATABASE_URL",
    "APP_PUBLIC_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHROMIUM_EXECUTABLE_PATH",
  ]) {
    assert.match(worker, new RegExp(`name:\\s*${required}`));
  }
  assert.match(deployment, /name:\s*semforge-relay/u);
  assert.match(deployment, /SEMFORGE_SERVICE[\s\S]*value:\s*relay/u);
  assert.match(collectionScheduler, /schedule:\s*"0 9 \* \* 0"/u);
  assert.match(reportScheduler, /schedule:\s*"0 23 \* \* 0"/u);
  assert.match(reportScheduler, /args:\s*\["report-scheduler"\]/u);
  assert.match(collectionScheduler, /name:\s*SCHEDULER_DATABASE_URL/u);
  assert.match(reportScheduler, /name:\s*SCHEDULER_DATABASE_URL/u);
  assert.doesNotMatch(relay, /WORKER_DATABASE_URL|SCHEDULER_DATABASE_URL/u);
  for (const reportVariable of reportRuntimeVariables) {
    assert.doesNotMatch(relay, new RegExp(`name:\\s*${reportVariable}`));
    assert.doesNotMatch(collectionScheduler, new RegExp(`name:\\s*${reportVariable}`));
    assert.doesNotMatch(reportScheduler, new RegExp(`name:\\s*${reportVariable}`));
  }
});

test("환경 예시는 report delivery 변수 이름만 제공하고 역할별 env_file secret 주입을 유지한다", async () => {
  const [example, compose] = await Promise.all([
    source(".env.example"),
    source("docker-compose.yml"),
  ]);
  for (const required of [
    "APP_PUBLIC_URL",
    "AUTH_DATABASE_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "CHROMIUM_EXECUTABLE_PATH",
  ]) {
    assert.match(example, new RegExp(`^${required}=`, "mu"));
  }
  assert.match(compose, /SEMFORGE_WEB_ENV_FILE/u);
  assert.match(compose, /SEMFORGE_WORKER_ENV_FILE/u);
  assert.doesNotMatch(compose, /(?:RESEND_API_KEY|S3_SECRET_ACCESS_KEY):\s*[^$\n]/u);
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
