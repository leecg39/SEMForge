// @TASK P4-O1-T1 - Container and operations artifact contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST Dockerfile, docker-compose.yml, deploy/**, next.config.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

function runDeploymentPreflight(
  manifestPaths: readonly string[],
  environment: Readonly<Record<string, string>>,
) {
  return spawnSync(
    process.execPath,
    ["scripts/ops/deployment-preflight.mjs", ...manifestPaths],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...environment },
    },
  );
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

  assert.match(dockerfile, /^ARG NODE_BASE_IMAGE=node:24-bookworm-slim$/mu);
  assert.equal((dockerfile.match(/^FROM \$\{NODE_BASE_IMAGE\}/gmu) ?? []).length, 2);
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

test("배포 산출물은 proprietary 제품 고지와 production dependency 라이선스 고지를 포함한다", async () => {
  const [dockerfile, license, notice, thirdParty, packageJson] = await Promise.all([
    source("Dockerfile"),
    source("LICENSE"),
    source("NOTICE"),
    source("THIRD_PARTY_NOTICES.md"),
    source("package.json"),
  ]);
  const manifest = JSON.parse(packageJson) as {
    license?: string;
    scripts?: Record<string, string>;
  };

  assert.equal(manifest.license, "UNLICENSED");
  assert.equal(manifest.scripts?.["license:check"], "node scripts/license/generate-third-party-notices.mjs --check");
  assert.match(license, /Proprietary and confidential/u);
  assert.match(notice, /SEMForge/u);
  assert.match(thirdParty, /@fontsource\/noto-sans-kr/u);
  assert.match(thirdParty, /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.match(thirdParty, /This product includes third-party production dependencies/u);
  assert.match(dockerfile, /COPY --chown=semforge:semforge LICENSE NOTICE THIRD_PARTY_NOTICES\.md \.\/legal\//u);
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

test("nginx 예시는 TLS, browser 격리 header, spoof 불가능한 client IP 전달을 포함한다", async () => {
  const [nginx, proxyHeaders] = await Promise.all([
    source("deploy/nginx/nginx.conf"),
    source("deploy/nginx/semforge-proxy-headers.conf"),
  ]);

  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3/u);
  assert.match(nginx, /limit_req_zone/u);
  assert.match(nginx, /limit_req zone=auth/u);
  assert.match(proxyHeaders, /proxy_buffering off/u);
  assert.match(nginx, /Content-Security-Policy[^\n]*frame-ancestors 'none'/u);
  assert.match(nginx, /Referrer-Policy "strict-origin-when-cross-origin"/u);
  assert.match(nginx, /Permissions-Policy/u);
  assert.match(proxyHeaders, /proxy_set_header X-Forwarded-Proto \$scheme/u);
  assert.match(proxyHeaders, /proxy_set_header X-Forwarded-For \$remote_addr/u);
  assert.doesNotMatch(`${nginx}\n${proxyHeaders}`, /\$proxy_add_x_forwarded_for/u);
});

test("PostgreSQL 16 test compose는 host loopback에만 포트를 공개한다", async () => {
  const compose = await source("compose.pg16.yml");

  assert.match(compose, /image: "\$\{SEMFORGE_POSTGRES_IMAGE:-postgres:16-alpine\}"/u);
  assert.match(compose, /127\.0\.0\.1:\$\{SEMFORGE_PG16_PORT:-55432\}:5432/u);
});

test("production deployment preflight는 digest placeholder와 mutable base image를 fail-closed한다", () => {
  const placeholder = runDeploymentPreflight(
    ["deploy/kubernetes/pipeline-runtime.yaml", "deploy/kubernetes/release-job.yaml"],
    {
      SEMFORGE_NODE_BASE_IMAGE: "node:24-bookworm-slim",
      SEMFORGE_POSTGRES_IMAGE: "postgres:16-alpine",
    },
  );

  assert.equal(placeholder.status, 78);
  assert.match(placeholder.stderr, /NODE_BASE_IMAGE.*sha256/u);
  assert.match(placeholder.stderr, /POSTGRES_IMAGE.*sha256/u);
  assert.match(placeholder.stderr, /REPLACE_WITH_DIGEST/u);
});

test("production deployment preflight는 실제 sha256 digest로 렌더링된 manifest만 허용한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "semforge-deployment-preflight-"));
  try {
    const pipelinePath = path.join(directory, "pipeline-runtime.yaml");
    const releasePath = path.join(directory, "release-job.yaml");
    const digest = "a".repeat(64);
    const [pipeline, release] = await Promise.all([
      source("deploy/kubernetes/pipeline-runtime.yaml"),
      source("deploy/kubernetes/release-job.yaml"),
    ]);
    await Promise.all([
      writeFile(pipelinePath, pipeline.replaceAll("REPLACE_WITH_DIGEST", digest), "utf8"),
      writeFile(releasePath, release.replaceAll("REPLACE_WITH_DIGEST", digest), "utf8"),
    ]);

    const result = runDeploymentPreflight([pipelinePath, releasePath], {
      SEMFORGE_NODE_BASE_IMAGE: `node:24-bookworm-slim@sha256:${"b".repeat(64)}`,
      SEMFORGE_POSTGRES_IMAGE: `postgres:16-alpine@sha256:${"c".repeat(64)}`,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /deployment preflight passed/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
