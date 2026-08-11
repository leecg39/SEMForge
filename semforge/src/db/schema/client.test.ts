// @TASK P1-D3 - Runtime database role connection boundary
// @SPEC docs/planning/06-tasks.md#phase-1--postgresql-기반과-물리적-축소
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDatabaseUrl } from "@/db/client";
import { parseServerEnv } from "@/lib/env";

test("auth runtime은 AUTH_DATABASE_URL만 사용하고 migration owner URL을 재사용하지 않는다", () => {
  const env = parseServerEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://semforge_web_login:secret@localhost/semforge",
    AUTH_DATABASE_URL: "postgresql://semforge_auth_login:secret@localhost/semforge",
    OPERATOR_DATABASE_URL: "postgresql://semforge_operator_login:secret@localhost/semforge",
    WORKER_DATABASE_URL: "postgresql://semforge_worker_login:secret@localhost/semforge",
    BILLING_DATABASE_URL: "postgresql://semforge_billing_login:secret@localhost/semforge",
    MIGRATION_DATABASE_URL: "postgresql://semforge_owner_login:secret@localhost/semforge",
  });

  assert.equal(resolveDatabaseUrl("web", env), env.DATABASE_URL);
  assert.equal(resolveDatabaseUrl("auth", env), env.AUTH_DATABASE_URL);
  assert.equal(resolveDatabaseUrl("operator", env), env.OPERATOR_DATABASE_URL);
  assert.equal(resolveDatabaseUrl("worker", env), env.WORKER_DATABASE_URL);
  assert.equal(resolveDatabaseUrl("billing", env), env.BILLING_DATABASE_URL);
  assert.notEqual(resolveDatabaseUrl("auth", env), env.MIGRATION_DATABASE_URL);
  assert.notEqual(resolveDatabaseUrl("operator", env), env.MIGRATION_DATABASE_URL);
  assert.notEqual(resolveDatabaseUrl("billing", env), env.MIGRATION_DATABASE_URL);
});
