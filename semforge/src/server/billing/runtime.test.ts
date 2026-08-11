// @TASK P2-B1-T1 - Billing runtime same-origin CSRF enforcement
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
// @TEST src/server/billing/runtime.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";

import { ApiError } from "@/lib/api-v1";
import { createSessionRequireAuth } from "@/server/billing/runtime";

const APP_ORIGIN = "https://app.semforge.test";
const SESSION_TOKEN = "s".repeat(43);
const PRINCIPAL = {
  user_id: "20000000-0000-4000-8000-000000000002",
  workspace_id: "20000000-0000-4000-8000-000000000003",
  role: "owner" as const,
};

function request(headers: HeadersInit = {}): Request {
  return new Request(`${APP_ORIGIN}/api/v1/billing/authorize`, {
    method: "POST",
    headers: {
      cookie: `semforge_session=${SESSION_TOKEN}`,
      origin: APP_ORIGIN,
      host: "app.semforge.test",
      ...headers,
    },
  });
}

function poolBoundary() {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const pool = {
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      return { rows: [PRINCIPAL] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

test("production origin에서 유효한 session을 보내면 별도의 CSRF cookie 없이 billing 인증을 통과한다", async () => {
  const { pool, queries } = poolBoundary();
  const requireAuth = createSessionRequireAuth(pool, APP_ORIGIN);

  const principal = await requireAuth(request(), {
    csrf: true,
    roles: ["owner", "admin"],
  });

  assert.deepEqual(principal, {
    userId: PRINCIPAL.user_id,
    workspaceId: PRINCIPAL.workspace_id,
    role: PRINCIPAL.role,
    requestId: "",
  });
  assert.equal(queries.length, 1);
  assert.match(String(queries[0]?.values[0]), /^[0-9a-f]{64}$/);
  assert.notEqual(queries[0]?.values[0], SESSION_TOKEN);
});

test("billing 상태 변경은 신뢰할 수 없는 Origin과 Host를 DB 조회 전에 거부한다", async (t) => {
  for (const [name, authRequest] of [
    ["cross-origin", request({ origin: "https://attacker.test" })],
    ["missing origin", request({ origin: "" })],
    ["host mismatch", request({ host: "attacker.test" })],
  ] as const) {
    await t.test(name, async () => {
      const { pool, queries } = poolBoundary();
      const requireAuth = createSessionRequireAuth(pool, APP_ORIGIN);

      await assert.rejects(
        () =>
          requireAuth(authRequest, {
            csrf: true,
            roles: ["owner", "admin"],
          }),
        (error: unknown) =>
          error instanceof ApiError &&
          error.code === "FORBIDDEN" &&
          error.status === 403,
      );
      assert.equal(queries.length, 0);
    });
  }
});
