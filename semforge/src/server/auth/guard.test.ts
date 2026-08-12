// @TASK P2-A1-T1 - Reusable authenticated API guard
// @SPEC docs/planning/06-tasks.md#p2-a1-t1--초대-전용-인증과-세션
// @TEST src/server/auth/guard.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError } from "@/lib/api-v1";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import {
  isTenantWorkspaceManager,
  TENANT_WORKSPACE_MANAGER_ROLES,
} from "@/server/auth/contracts";
import {
  createRequireAuth,
  type AuthGuardService,
} from "@/server/auth/guard";

const RAW_SESSION_TOKEN = "s".repeat(43);
const PRINCIPAL = {
  sessionId: "20000000-0000-4000-8000-000000000001",
  userId: "20000000-0000-4000-8000-000000000002",
  workspaceId: "20000000-0000-4000-8000-000000000003",
  email: "member@example.com",
  displayName: "고객 담당자",
  role: "member" as const,
  expiresAt: new Date("2026-09-10T05:00:00.000Z"),
};

function request(
  method: "GET" | "POST" = "GET",
  headers: HeadersInit = {},
): Request {
  return new Request("https://app.semforge.test/api/v1/billing/subscription", {
    method,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${RAW_SESSION_TOKEN}`,
      ...(method === "POST" ? { origin: "https://app.semforge.test" } : {}),
      ...headers,
    },
  });
}

function service(
  getSession: AuthGuardService["getSession"] = async () => PRINCIPAL,
): AuthGuardService {
  return { getSession };
}

test("tenant 관리자 역할은 owner와 admin만 포함한다", () => {
  assert.deepEqual(TENANT_WORKSPACE_MANAGER_ROLES, ["owner", "admin"]);
  assert.equal(isTenantWorkspaceManager("owner"), true);
  assert.equal(isTenantWorkspaceManager("admin"), true);
  assert.equal(isTenantWorkspaceManager("member"), false);
});

test("owner와 admin은 허용된 역할 guard를 통과한다", async (t) => {
  for (const role of ["owner", "admin"] as const) {
    await t.test(role, async () => {
      const requireAuth = createRequireAuth({
        getService: () => service(async () => ({ ...PRINCIPAL, role })),
      });
      const result = await requireAuth(request(), {
        roles: ["owner", "admin"],
        requestId: "billing-request-1234",
      });

      assert.deepEqual(result, {
        userId: PRINCIPAL.userId,
        workspaceId: PRINCIPAL.workspaceId,
        role,
        requestId: "billing-request-1234",
      });
    });
  }
});

test("허용 역할에 없는 member는 FORBIDDEN이다", async () => {
  const requireAuth = createRequireAuth({ getService: () => service() });

  await assert.rejects(
    () => requireAuth(request(), { roles: ["owner", "admin"] }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "FORBIDDEN" &&
      error.status === 403,
  );
});

test("누락되거나 만료·폐기된 session은 UNAUTHENTICATED이다", async (t) => {
  await t.test("missing cookie", async () => {
    let called = false;
    const requireAuth = createRequireAuth({
      getService: () => service(async () => {
        called = true;
        return PRINCIPAL;
      }),
    });

    await assert.rejects(
      () => requireAuth(new Request("https://app.semforge.test/api/v1/billing")),
      (error: unknown) =>
        error instanceof ApiError && error.code === "UNAUTHENTICATED",
    );
    assert.equal(called, false);
  });

  await t.test("revoked session", async () => {
    const requireAuth = createRequireAuth({
      getService: () => service(async () => null),
    });

    await assert.rejects(
      () => requireAuth(request()),
      (error: unknown) =>
        error instanceof ApiError && error.code === "UNAUTHENTICATED",
    );
  });
});

test("CSRF 검증은 cross-origin과 Host mismatch를 service 실행 전에 거부한다", async (t) => {
  for (const [name, authRequest] of [
    [
      "cross-origin",
      request("POST", { origin: "https://attacker.test" }),
    ],
    [
      "host mismatch",
      request("POST", { host: "attacker.test" }),
    ],
  ] as const) {
    await t.test(name, async () => {
      let called = false;
      const requireAuth = createRequireAuth({
        getService: () => service(async () => {
          called = true;
          return PRINCIPAL;
        }),
      });

      await assert.rejects(
        () => requireAuth(authRequest, { csrf: true }),
        (error: unknown) =>
          error instanceof ApiError && error.code === "FORBIDDEN",
      );
      assert.equal(called, false);
    });
  }
});

test("guard 결과는 raw token과 session/PII를 제거하고 안전한 requestId를 만든다", async () => {
  let receivedToken: string | undefined;
  const requireAuth = createRequireAuth({
    getService: () => service(async (token) => {
      receivedToken = token;
      return PRINCIPAL;
    }),
  });
  const result = await requireAuth(
    request("GET", { "x-request-id": "unsafe request id" }),
  );
  const serialized = JSON.stringify(result);

  assert.equal(receivedToken, RAW_SESSION_TOKEN);
  assert.match(result.requestId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  assert.deepEqual(Object.keys(result).sort(), [
    "requestId",
    "role",
    "userId",
    "workspaceId",
  ]);
  assert.doesNotMatch(
    serialized,
    new RegExp(`${RAW_SESSION_TOKEN}|member@example.com|고객 담당자`),
  );
});
