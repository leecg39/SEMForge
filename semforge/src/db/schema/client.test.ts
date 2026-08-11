// @TASK P1-D2 - Runtime database role connection boundary
// @SPEC docs/planning/06-tasks.md#phase-1--postgresql-기반과-물리적-축소
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDatabaseUrl } from "@/db/client";
import { parseServerEnv } from "@/lib/env";

test("auth runtime은 AUTH_DATABASE_URL만 사용하고 migration owner URL을 재사용하지 않는다", () => {
  const env = parseServerEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://web:secret@localhost/semforge",
    AUTH_DATABASE_URL: "postgresql://auth:secret@localhost/semforge",
    WORKER_DATABASE_URL: "postgresql://worker:secret@localhost/semforge",
    MIGRATION_DATABASE_URL: "postgresql://owner:secret@localhost/semforge",
  });

  assert.equal(resolveDatabaseUrl("web", env), env.DATABASE_URL);
  assert.equal(resolveDatabaseUrl("auth", env), env.AUTH_DATABASE_URL);
  assert.equal(resolveDatabaseUrl("worker", env), env.WORKER_DATABASE_URL);
  assert.notEqual(resolveDatabaseUrl("auth", env), env.MIGRATION_DATABASE_URL);
});
