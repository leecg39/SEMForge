// @TASK P4-O1-T1 - Live and safe PostgreSQL readiness contract
// @SPEC docs/planning/06-tasks.md#p4-o1-t1--node-24-docker와-운영-도구
// @TEST src/server/health/health.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLivenessResponse,
  createReadinessResponse,
} from "@/server/health/health";

test("liveness는 외부 의존성 없이 no-store 200을 반환한다", async () => {
  const response = createLivenessResponse();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("readiness는 PostgreSQL SELECT 1 성공 뒤에만 ready 200을 반환한다", async () => {
  const statements: string[] = [];
  const response = await createReadinessResponse({
    query: async (statement) => {
      statements.push(statement);
      return { rows: [{ ready: 1 }] };
    },
  });

  assert.deepEqual(statements, ["select 1 as ready"]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ready" });
});

test("readiness 실패는 DB 오류와 DSN을 숨긴 동일한 503만 반환한다", async () => {
  const response = await createReadinessResponse({
    query: async () => {
      throw new Error(
        "connect ECONNREFUSED postgresql://runtime:secret@db.internal:5432/semforge",
      );
    },
  });

  assert.equal(response.status, 503);
  const body = JSON.stringify(await response.json());
  assert.equal(body, JSON.stringify({ status: "not_ready" }));
  assert.doesNotMatch(body, /ECONNREFUSED|postgresql|secret|db\.internal/u);
});

test("readiness는 제한 시간을 넘긴 DB 확인을 503으로 종료한다", async () => {
  const response = await createReadinessResponse(
    { query: () => new Promise(() => undefined) },
    { timeoutMs: 5 },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "not_ready" });
});
