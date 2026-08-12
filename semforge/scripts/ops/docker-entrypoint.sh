#!/bin/sh
# @TASK P4-O1-T1 - Fail-fast container entrypoint with exec signal semantics
# @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
set -eu

profile="${1:-}"
preflight_profile="$profile"
case "$profile" in
  report-scheduler)
    preflight_profile="scheduler"
    ;;
  privacy-export|privacy-correct|privacy-delete|privacy-delete-workspace)
    preflight_profile="privacy"
    ;;
  privacy-retention)
    preflight_profile="retention"
    ;;
  privacy-request)
    preflight_profile="operator"
    ;;
esac
node scripts/ops/preflight.mjs "$preflight_profile"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$profile" in
  web)
    exec node server.js
    ;;
  worker)
    exec node --import tsx scripts/ops/worker.ts
    ;;
  relay)
    exec node --import tsx scripts/ops/relay.ts
    ;;
  scheduler)
    exec node --import tsx scripts/ops/scheduler.ts
    ;;
  report-scheduler)
    exec node --import tsx scripts/ops/report-scheduler.ts
    ;;
  privacy-retention)
    exec node --import tsx scripts/privacy/privacy.ts retention --dry-run false
    ;;
  privacy-export)
    exec node --import tsx scripts/privacy/privacy.ts export "$@"
    ;;
  privacy-correct)
    exec node --import tsx scripts/privacy/privacy.ts correct "$@"
    ;;
  privacy-delete)
    exec node --import tsx scripts/privacy/privacy.ts delete "$@"
    ;;
  privacy-delete-workspace)
    exec node --import tsx scripts/privacy/privacy.ts delete-workspace "$@"
    ;;
  privacy-request)
    exec node --import tsx scripts/ops/privacy-request.ts "$@"
    ;;
  migrate)
    exec node --import tsx src/db/migrate.ts
    ;;
  *)
    echo '{"level":"error","message":"invalid runtime profile"}' >&2
    exit 64
    ;;
esac
