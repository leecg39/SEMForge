# syntax=docker/dockerfile:1.7
# @TASK P4-O1-T1 - Node 24 standalone web, pipeline, privacy, and migration images
# @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구

ARG NODE_BASE_IMAGE=node:24-bookworm-slim
FROM ${NODE_BASE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV SEMFORGE_SERVICE=build \
    PGSSLMODE=verify-full
COPY . .
RUN npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM ${NODE_BASE_IMAGE} AS runtime-base
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PGSSLMODE=verify-full \
    CHROMIUM_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium \
    PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      fontconfig \
      fonts-noto-cjk \
      tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 semforge \
    && useradd --uid 10001 --gid semforge --create-home --shell /usr/sbin/nologin semforge
WORKDIR /app
COPY --chmod=0555 scripts/ops/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chown=semforge:semforge scripts/ops/preflight.mjs scripts/ops/runtime.mjs ./scripts/ops/
COPY --chown=semforge:semforge LICENSE NOTICE THIRD_PARTY_NOTICES.md ./legal/
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
STOPSIGNAL SIGTERM

FROM runtime-base AS web
ENV SEMFORGE_SERVICE=web \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=semforge:semforge /app/.next/standalone ./
COPY --from=builder --chown=semforge:semforge /app/.next/static ./.next/static
USER semforge
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["web"]

FROM runtime-base AS pipeline-runtime
COPY --from=production-dependencies --chown=semforge:semforge /app/node_modules ./node_modules
COPY --from=builder --chown=semforge:semforge /app/package.json /app/tsconfig.json ./
COPY --from=builder --chown=semforge:semforge /app/src ./src
COPY --from=builder --chown=semforge:semforge \
  /app/scripts/ops/worker.ts \
  /app/scripts/ops/relay.ts \
  /app/scripts/ops/scheduler.ts \
  /app/scripts/ops/report-scheduler.ts \
  ./scripts/ops/
USER semforge

FROM pipeline-runtime AS worker
ENV SEMFORGE_SERVICE=worker
CMD ["worker"]

FROM pipeline-runtime AS relay
ENV SEMFORGE_SERVICE=relay
CMD ["relay"]

FROM pipeline-runtime AS scheduler
ENV SEMFORGE_SERVICE=scheduler
CMD ["scheduler"]

FROM runtime-base AS privacy
ENV SEMFORGE_SERVICE=privacy
COPY --from=production-dependencies --chown=semforge:semforge /app/node_modules ./node_modules
COPY --from=builder --chown=semforge:semforge /app/package.json /app/tsconfig.json ./
COPY --from=builder --chown=semforge:semforge /app/src ./src
COPY --from=builder --chown=semforge:semforge /app/scripts/privacy/privacy.ts ./scripts/privacy/privacy.ts
USER semforge
CMD ["privacy-retention"]

FROM runtime-base AS migrator
ENV SEMFORGE_SERVICE=migrate
COPY --from=production-dependencies --chown=semforge:semforge /app/node_modules ./node_modules
COPY --from=builder --chown=semforge:semforge /app/package.json /app/tsconfig.json ./
COPY --from=builder --chown=semforge:semforge /app/src ./src
USER semforge
CMD ["migrate"]
