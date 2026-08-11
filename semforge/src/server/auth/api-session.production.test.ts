// @TASK P2-RUNTIME-FIX - Production API session composition regression
// @SPEC user-approved-plan#허용-api
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError } from "@/lib/api-v1";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { createApiSessionResolver } from "@/server/auth/api-session";
import type { AuthSessionPrincipal } from "@/server/auth/contracts";

const principal: AuthSessionPrincipal = {
  sessionId: "0198f06a-1b42-7000-8000-100000000001",
  userId: "0198f06a-1b42-7000-8000-100000000002",
  workspaceId: "0198f06a-1b42-7000-8000-100000000003",
  email: "owner@example.com",
  displayName: "Owner",
  role: "owner",
  expiresAt: new Date("2026-09-11T00:00:00.000Z"),
};

test("production API session resolver reads the real session cookie and never trusts header tenants", async () => {
  const calls: string[] = [];
  const resolver = createApiSessionResolver({
    production: true,
    getService: () => ({
      async getSession(sessionToken) {
        calls.push(sessionToken ?? "");
        return sessionToken === "real-session-token" ? principal : null;
      },
    }),
  });

  const session = await resolver(
    new Request("https://app.semforge.test/api/v1/sites", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=real-session-token`,
        "x-request-id": "req-prod-session",
        "x-semforge-workspace-id": "0198f06a-1b42-7000-8000-deadbeef0001",
        "x-semforge-user-id": "0198f06a-1b42-7000-8000-deadbeef0002",
      },
    }),
  );

  assert.deepEqual(calls, ["real-session-token"]);
  assert.deepEqual(session, {
    workspaceId: principal.workspaceId,
    userId: principal.userId,
    role: "owner",
    requestId: "req-prod-session",
  });
});

test("production resolver rejects header-only tenants instead of reviving fake auth", async () => {
  const resolver = createApiSessionResolver({
    production: true,
    getService: () => ({
      async getSession() {
        return null;
      },
    }),
  });

  await assert.rejects(
    resolver(
      new Request("https://app.semforge.test/api/v1/sites", {
        headers: {
          "x-semforge-workspace-id": principal.workspaceId,
          "x-semforge-user-id": principal.userId,
        },
      }),
    ),
    (error: unknown) => error instanceof ApiError && error.code === "UNAUTHENTICATED",
  );
});
