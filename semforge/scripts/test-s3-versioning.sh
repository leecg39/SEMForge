#!/bin/sh
# @TASK P5-PRIVACY-S3 - Local versioned MinIO erasure acceptance harness
# @SPEC docs/ops/privacy-erasure-runbook.md
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPOSITORY_ROOT"

NODE_BIN=${SEMFORGE_NODE_BIN:-/Users/user01/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node || true)
fi
if [ -z "$NODE_BIN" ] || [ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" != "24" ]; then
  echo "Node 24 is required for the S3 versioning acceptance harness." >&2
  exit 1
fi

DOCKER_MODE=host
if command -v colima >/dev/null 2>&1 && colima status >/dev/null 2>&1; then
  DOCKER_MODE=colima
elif ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "A running Docker engine is required (Docker Desktop or Colima)." >&2
  exit 1
fi

run_docker() {
  if [ "$DOCKER_MODE" = colima ]; then
    colima ssh -- docker -H unix:///var/run/docker.sock "$@"
  else
    docker "$@"
  fi
}

MINIO_IMAGE=${SEMFORGE_MINIO_IMAGE:-quay.io/minio/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e}
MINIO_CONTAINER="semforge-privacy-s3-acceptance-$$"
MINIO_ACCESS_KEY=semforge-minio-root
MINIO_SECRET_KEY=semforge-minio-secret-acceptance
MINIO_BUCKET=semforge-privacy-acceptance
MINIO_PORT=$("$NODE_BIN" -e 'const n=require("node:net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')

cleanup() {
  run_docker rm -f "$MINIO_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

run_docker run -d --rm \
  --name "$MINIO_CONTAINER" \
  -p "127.0.0.1:${MINIO_PORT}:9000" \
  -e "MINIO_ROOT_USER=${MINIO_ACCESS_KEY}" \
  -e "MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}" \
  "$MINIO_IMAGE" server /data --address :9000 >/dev/null

attempt=0
until curl -fsS "http://127.0.0.1:${MINIO_PORT}/minio/health/ready" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Local MinIO did not become ready within 30 seconds." >&2
    run_docker logs --tail 40 "$MINIO_CONTAINER" >&2 || true
    exit 1
  fi
  sleep 1
done

SEMFORGE_MINIO_ENDPOINT="http://127.0.0.1:${MINIO_PORT}" \
SEMFORGE_MINIO_BUCKET="$MINIO_BUCKET" \
SEMFORGE_MINIO_ACCESS_KEY="$MINIO_ACCESS_KEY" \
SEMFORGE_MINIO_SECRET_KEY="$MINIO_SECRET_KEY" \
"$NODE_BIN" --import tsx --test \
  src/server/storage/s3.test.ts \
  src/server/storage/s3.minio.acceptance.test.ts
