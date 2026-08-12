// @TASK P4-O1-T1 - Container and operations artifact contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST Dockerfile, docker-compose.yml, deploy/**, next.config.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

type TextSpawnResult = ReturnType<typeof spawnSync> & {
  stdout: string;
  stderr: string;
};

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

async function runComposeConfig(): Promise<TextSpawnResult> {
  const directory = await mkdtemp(path.join(process.cwd(), ".semforge-compose-config-"));
  const envFile = path.join(directory, "runtime.env");
  const composeEnvPath = path.join(directory, "compose.env");
  await Promise.all([
    writeFile(envFile, "APP_SECRET=compose-contract-placeholder\n", "utf8"),
    writeFile(
      composeEnvPath,
      [
        `SEMFORGE_MIGRATION_ENV_FILE=${envFile}`,
        `SEMFORGE_WEB_ENV_FILE=${envFile}`,
        `SEMFORGE_WORKER_ENV_FILE=${envFile}`,
        `SEMFORGE_RELAY_ENV_FILE=${envFile}`,
        `SEMFORGE_SCHEDULER_ENV_FILE=${envFile}`,
        `SEMFORGE_PRIVACY_ENV_FILE=${envFile}`,
        `SEMFORGE_OPERATOR_ENV_FILE=${envFile}`,
        `SEMFORGE_RETENTION_ENV_FILE=${envFile}`,
        "",
      ].join("\n"),
      "utf8",
    ),
  ]);

  try {
    return spawnSync(
      "docker",
      [
        "compose",
        "--env-file",
        composeEnvPath,
        "--profile",
        "scheduled",
        "--profile",
        "manual",
        "-f",
        "docker-compose.yml",
        "config",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    ) as TextSpawnResult;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function serviceBlock(composeConfig: string, serviceName: string): string {
  const match = composeConfig.match(
    new RegExp(`^  ${serviceName}:\\n[\\s\\S]*?(?=^  [a-z0-9-]+:|^networks:)`, "mu"),
  );
  assert.ok(match, `compose config service missing: ${serviceName}`);
  return match[0]!;
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

test("Dockerfile은 Node 24 web/pipeline/privacy/retention/migrator target과 non-root Chromium/Noto runtime을 제공한다", async () => {
  const dockerfile = await source("Dockerfile");

  assert.match(dockerfile, /^ARG NODE_BASE_IMAGE=node:24-bookworm-slim$/mu);
  assert.equal((dockerfile.match(/^FROM \$\{NODE_BASE_IMAGE\}/gmu) ?? []).length, 2);
  for (const target of ["web", "worker", "relay", "scheduler", "privacy", "retention", "operator", "migrator"]) {
    assert.match(dockerfile, new RegExp(`FROM \\S+ AS ${target}`));
  }
  assert.match(dockerfile, /chromium/u);
  assert.match(dockerfile, /fonts-noto-cjk/u);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/bin\/tini"/u);
  assert.match(dockerfile, /USER semforge/u);
  assert.match(dockerfile, /\.next\/standalone/u);
  assert.match(dockerfile, /\/app\/scripts\/privacy\/privacy\.ts/u);
  assert.match(
    dockerfile,
    /FROM privacy-runtime AS privacy[\s\S]*SEMFORGE_SERVICE=privacy[\s\S]*CMD \["privacy-export"\]/u,
  );
  assert.match(
    dockerfile,
    /FROM privacy-runtime AS retention[\s\S]*SEMFORGE_SERVICE=retention[\s\S]*CMD \["privacy-retention"\]/u,
  );
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
  assert.match(
    dockerfile,
    /npm run license:generate -- --include-installed-optional --distribution-notices/u,
  );
  assert.match(dockerfile, /COPY --chown=semforge:semforge LICENSE NOTICE \.\/legal\//u);
  assert.match(
    dockerfile,
    /COPY --from=production-dependencies --chown=semforge:semforge \/app\/THIRD_PARTY_NOTICES\.md \.\/legal\/THIRD_PARTY_NOTICES\.md/u,
  );
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
  assert.match(entrypoint, /privacy-request[\s\S]*scripts\/ops\/privacy-request\.ts "\$@"/u);
  assert.match(
    entrypoint,
    /privacy-retention[\s\S]*scripts\/privacy\/privacy\.ts retention --dry-run false/u,
  );
  assert.match(entrypoint, /privacy-export[\s\S]*scripts\/privacy\/privacy\.ts export "\$@"/u);
  assert.match(entrypoint, /privacy-correct[\s\S]*scripts\/privacy\/privacy\.ts correct "\$@"/u);
  assert.match(
    entrypoint,
    /privacy-delete[\s\S]*scripts\/privacy\/privacy\.ts delete "\$@"/u,
  );
  assert.match(entrypoint, /exec node --import tsx src\/db\/migrate\.ts/u);
  assert.match(compose, /release:/u);
  assert.equal((compose.match(/condition: service_completed_successfully/gu) ?? []).length, 8);
  assert.match(compose, /report-scheduler:/u);
  assert.match(compose, /command:\s*\["report-scheduler"\]/u);
  assert.match(compose, /privacy:[\s\S]*profiles: \[manual\][\s\S]*target: privacy/u);
  assert.match(compose, /privacy:[\s\S]*SEMFORGE_PRIVACY_ENV_FILE/u);
  assert.match(compose, /privacy-retention:[\s\S]*profiles: \[scheduled\][\s\S]*target: retention/u);
  assert.match(compose, /privacy-retention:[\s\S]*SEMFORGE_RETENTION_ENV_FILE/u);
  assert.match(compose, /privacy-retention:[\s\S]*SEMFORGE_SERVICE:\s*retention/u);
  assert.match(compose, /privacy-retention:[\s\S]*command:\s*\["privacy-retention"\]/u);
  const retentionCompose = compose.slice(
    compose.indexOf("  privacy-retention:"),
    compose.indexOf("\nnetworks:"),
  );
  assert.doesNotMatch(
    retentionCompose,
    /SEMFORGE_PRIVACY_ENV_FILE|PRIVACY_DATABASE_URL|APP_SECRET|GOOGLE_CLIENT|OPERATOR_DATABASE_URL|MIGRATION_DATABASE_URL/u,
  );
  assert.match(compose, /\/health\/ready/u);
  for (const profile of ["web", "worker", "relay", "scheduler", "privacy", "retention", "operator", "migrate"]) {
    assert.match(compose, new RegExp(`SEMFORGE_SERVICE:\\s*${profile}`));
  }
  for (const envFile of ["WEB", "WORKER", "RELAY", "SCHEDULER", "OPERATOR", "PRIVACY", "RETENTION", "MIGRATION"]) {
    assert.match(compose, new RegExp(`SEMFORGE_${envFile}_ENV_FILE`));
  }
});

test("privacy lifecycle은 일일 retention과 별도 수동 delete invocation으로 분리된다", async () => {
  const [entrypoint, deployment, compose, packageJson] = await Promise.all([
    source("scripts/ops/docker-entrypoint.sh"),
    source("deploy/kubernetes/pipeline-runtime.yaml"),
    source("docker-compose.yml"),
    source("package.json"),
  ]);
  const manifest = JSON.parse(packageJson) as { scripts?: Record<string, string> };
  const privacyCron = deployment
    .split(/^---$/mu)
    .find((document) => /name:\s*semforge-daily-privacy-retention/u.test(document)) ?? "";

  assert.match(privacyCron, /kind:\s*CronJob/u);
  assert.match(privacyCron, /schedule:\s*"15 3 \* \* \*"/u);
  assert.match(privacyCron, /timeZone:\s*Asia\/Seoul/u);
  assert.match(privacyCron, /concurrencyPolicy:\s*Forbid/u);
  assert.match(privacyCron, /args:\s*\["privacy-retention"\]/u);
  assert.match(privacyCron, /SEMFORGE_SERVICE[\s\S]*value:\s*retention/u);
  for (const required of [
    "PRIVACY_RETENTION_DATABASE_URL",
    "PRIVACY_RETENTION_POLICY",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ]) {
    assert.match(privacyCron, new RegExp(`name:\\s*${required}`));
  }
  assert.match(privacyCron, /secretKeyRef:\s*\{ name:\s*semforge-retention,/u);
  assert.doesNotMatch(
    privacyCron,
    /PRIVACY_DATABASE_URL|APP_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/u,
  );
  assert.match(privacyCron, /automountServiceAccountToken:\s*false/u);
  assert.match(privacyCron, /runAsNonRoot:\s*true/u);
  assert.match(privacyCron, /readOnlyRootFilesystem:\s*true/u);
  assert.match(privacyCron, /allowPrivilegeEscalation:\s*false/u);
  assert.match(privacyCron, /drop:\s*\["ALL"\]/u);
  assert.match(entrypoint, /privacy-delete/u);
  assert.doesNotMatch(compose, /command:\s*\["privacy-delete"\]/u);
  assert.equal(
    manifest.scripts?.["privacy:retention"],
    "SEMFORGE_SERVICE=retention sh scripts/ops/docker-entrypoint.sh privacy-retention",
  );
  assert.equal(
    manifest.scripts?.["privacy:export"],
    "SEMFORGE_SERVICE=privacy sh scripts/ops/docker-entrypoint.sh privacy-export",
  );
  assert.equal(
    manifest.scripts?.["privacy:correct"],
    "SEMFORGE_SERVICE=privacy sh scripts/ops/docker-entrypoint.sh privacy-correct",
  );
  assert.equal(
    manifest.scripts?.["privacy:delete"],
    "SEMFORGE_SERVICE=privacy sh scripts/ops/docker-entrypoint.sh privacy-delete",
  );
  assert.equal(
    manifest.scripts?.["privacy:request"],
    "SEMFORGE_SERVICE=operator sh scripts/ops/docker-entrypoint.sh privacy-request",
  );
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
  assert.match(compose, /SEMFORGE_PRIVACY_ENV_FILE/u);
  assert.match(compose, /SEMFORGE_RETENTION_ENV_FILE/u);
  assert.doesNotMatch(compose, /(?:RESEND_API_KEY|S3_SECRET_ACCESS_KEY):\s*[^$\n]/u);
});

test("privacy env 문서는 retention schedule과 수동 삭제 절차를 분리하고 필수 secret을 열거한다", async () => {
  const [example, documentation] = await Promise.all([
    source(".env.example"),
    source("deploy/env/README.md"),
  ]);

  assert.match(example, /production runtime에서는[^\n]*privacy\|retention\|migrate\|operator/u);
  assert.match(documentation, /`privacy\.env`/u);
  assert.match(documentation, /`retention\.env`/u);
  assert.match(documentation, /SEMFORGE_PRIVACY_ENV_FILE/u);
  assert.match(documentation, /SEMFORGE_RETENTION_ENV_FILE/u);
  assert.match(documentation, /s3:ListBucketVersions/u);
  assert.match(documentation, /s3:DeleteObjectVersion/u);
  assert.match(documentation, /privacy-retention/u);
  assert.match(documentation, /privacy-delete/u);
  assert.match(documentation, /privacy-request[^\n]*privacy-delete/u);
  assert.match(documentation, /매일 03:15 KST/u);
  assert.match(documentation, /Google client credential[^\n]*요구하지/u);
  assert.match(documentation, /retention\.env[^\n]*APP_SECRET[^\n]*금지/u);
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

test("nginx CSP는 Next, Toss 결제, Google OAuth, 공급자 API에 필요한 명시 directive만 허용한다", async () => {
  const nginx = await source("deploy/nginx/nginx.conf");

  const csp = nginx.match(/add_header Content-Security-Policy "([^"]+)"/u)?.[1] ?? "";
  assert.match(csp, /default-src 'self'/u);
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/js\.tosspayments\.com/u);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/u);
  assert.match(csp, /img-src 'self' data: blob: https:/u);
  assert.match(csp, /font-src 'self' data:/u);
  assert.match(csp, /connect-src 'self'/u);
  assert.match(csp, /form-action 'self'/u);
  assert.match(csp, /frame-src 'self' https:\/\/.*\.tosspayments\.com/u);
  assert.match(csp, /navigate-to 'self' https:\/\/accounts\.google\.com https:\/\/.*\.tosspayments\.com/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.match(csp, /base-uri 'self'/u);
  assert.match(csp, /object-src 'none'/u);
  assert.match(csp, /upgrade-insecure-requests/u);
  assert.doesNotMatch(csp, /unsafe-eval/u);
  assert.doesNotMatch(csp, /searchconsole\.googleapis|www\.googleapis|openapi\.naver|searchad\.naver/u);
  assert.match(nginx, /Low accepted:[\s\S]*'unsafe-inline'/u);
});

test("production docker compose config는 모든 앱 서비스를 read-only와 no-new-privileges로 실행한다", async () => {
  const result = await runComposeConfig();
  assert.equal(result.status, 0, result.stderr);

  const services = [
    "release",
    "web",
    "worker",
    "relay",
    "scheduler",
    "report-scheduler",
    "privacy",
    "privacy-request",
    "privacy-retention",
  ];
  for (const service of services) {
    const block = serviceBlock(result.stdout, service);
    assert.match(block, /read_only:\s*true/u, service);
    assert.match(block, /security_opt:\n\s+- no-new-privileges:true/u, service);
    assert.match(block, /cap_drop:\n\s+- ALL/u, service);
    assert.match(block, /tmpfs:\n\s+- \/tmp:rw,noexec,nosuid,nodev,size=64m/u, service);
    assert.match(block, /- \/home\/semforge\/\.cache:rw,noexec,nosuid,nodev,size=64m/u, service);
    assert.match(block, /- \/home\/semforge\/\.config:rw,noexec,nosuid,nodev,size=16m/u, service);
    assert.doesNotMatch(block, /cap_add:/u, service);
    assert.doesNotMatch(block, /privileged:\s*true/u, service);
  }
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
