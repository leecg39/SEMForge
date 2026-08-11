#!/bin/sh
# @TASK P4-O1-T1 - Fail-fast container entrypoint with exec signal semantics
# @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
set -eu

profile="${1:-}"
node scripts/ops/preflight.mjs "$profile"

case "$profile" in
  web)
    exec node server.js
    ;;
  worker)
    exec node --import tsx scripts/ops/worker.ts
    ;;
  migrate)
    exec node --import tsx src/db/migrate.ts
    ;;
  *)
    echo '{"level":"error","message":"invalid runtime profile"}' >&2
    exit 64
    ;;
esac
