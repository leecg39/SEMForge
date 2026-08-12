// @TASK P2-G1-T1 - GSC API route contract
// @SPEC user-approved-plan#허용-API
// @TEST src/server/gsc/routes.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createGscRouteHandlers,
  type GscRouteService,
  type RequireGscAuth,
} from "@/server/gsc/routes";
import type { BillingAccessAuthorizer } from "@/server/billing/access";

const principal = {
  userId: "32000000-0000-4000-8000-000000000101",
  workspaceId: "32000000-0000-4000-8000-000000000001",
  role: "owner" as const,
  requestId: "gsc-request-1",
};

const allowBillingAccess: BillingAccessAuthorizer = async () => ({
  allowed: true,
  mode: "full",
  reason: "active",
  reportPeriodEndBefore: null,
});

function service(overrides: Partial<GscRouteService> = {}): GscRouteService {
  return {
    async startConnection() {
      return {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=raw-state",
        state: "raw-state",
        expiresAt: "2026-08-11T00:10:00.000Z",
      };
    },
    async completeCallback() {
      return {
        returnPath: "/app/settings",
        connection: {
          id: "32000000-0000-4000-8000-000000000301",
          workspaceId: principal.workspaceId,
          label: "운영 GSC",
          accessTokenEncrypted: "enc:v1:hidden",
          refreshTokenEncrypted: "enc:v1:hidden",
          tokenExpiresAt: "2026-08-11T01:00:00.000Z",
          scope: "https://www.googleapis.com/auth/webmasters.readonly",
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z",
        },
      };
    },
    async listConnections() {
      return [];
    },
    async listProperties() {
      return [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }];
    },
    async bindProperty() {
      return {
        id: "32000000-0000-4000-8000-000000000401",
        workspaceId: principal.workspaceId,
        siteId: "32000000-0000-4000-8000-000000000201",
        connectionId: "32000000-0000-4000-8000-000000000301",
        propertyUri: "sc-domain:example.com",
        createdAt: "2026-08-11T00:00:00.000Z",
      };
    },
    async disconnect() {},
    ...overrides,
  };
}

async function envelope(response: Response): Promise<{
  data: unknown;
  error: null | { code: string; message: string };
  requestId: string;
}> {
  return response.json() as Promise<{
    data: unknown;
    error: null | { code: string; message: string };
    requestId: string;
  }>;
}

test("connect POST는 실제 auth guard에 CSRF와 owner/admin role을 요구하고 workspaceId body override를 거부한다", async () => {
  let authOptions: Parameters<RequireGscAuth>[1] | undefined;
  let serviceInput: unknown;
  const handlers = createGscRouteHandlers({
    authorizeBilling: allowBillingAccess,
    requireAuth: async (_request, options) => {
      authOptions = options;
      return principal;
    },
    getService: () =>
      service({
        async startConnection(input) {
          serviceInput = input;
          return {
            authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=raw-state",
            state: "raw-state",
            expiresAt: "2026-08-11T00:10:00.000Z",
          };
        },
      }),
  });

  const rejected = await handlers.connect.POST(
    new Request("https://semforge.example/api/v1/integrations/gsc/connect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://semforge.example" },
      body: JSON.stringify({ workspaceId: "32000000-0000-4000-8000-000000000099", label: "GSC" }),
    }),
    undefined,
  );
  assert.equal(rejected.status, 422);

  const response = await handlers.connect.POST(
    new Request("https://semforge.example/api/v1/integrations/gsc/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://semforge.example",
        "x-request-id": "route-gsc-connect",
      },
      body: JSON.stringify({ label: "GSC", returnPath: "/app/settings" }),
    }),
    undefined,
  );
  const body = await envelope(response);

  assert.equal(response.status, 201);
  assert.deepEqual(authOptions, {
    csrf: true,
    roles: ["owner", "admin"],
    requestId: "route-gsc-connect",
  });
  assert.deepEqual(serviceInput, {
    workspaceId: principal.workspaceId,
    userId: principal.userId,
    label: "GSC",
    returnPath: "/app/settings",
  });
  assert.equal((body.data as { state: string }).state, "raw-state");
  assert.equal(body.requestId, "route-gsc-connect");
});

test("callback GET은 code/state와 현재 session principal을 service에 전달하고 raw token을 응답하지 않는다", async () => {
  let serviceInput: unknown;
  const handlers = createGscRouteHandlers({
    authorizeBilling: allowBillingAccess,
    requireAuth: async () => principal,
    getService: () =>
      service({
        async completeCallback(input) {
          serviceInput = input;
          return service().completeCallback(input);
        },
      }),
  });
  const response = await handlers.callback.GET(
    new Request("https://semforge.example/api/v1/integrations/gsc/callback?code=auth-code&state=raw-state"),
    undefined,
  );
  const body = await envelope(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.deepEqual(serviceInput, {
    workspaceId: principal.workspaceId,
    userId: principal.userId,
    code: "auth-code",
    state: "raw-state",
  });
  assert.equal((body.data as { returnPath: string }).returnPath, "/app/settings");
  assert.doesNotMatch(serialized, /accessToken|refreshToken|auth-code/);
});

test("properties, bindings, disconnect는 인증된 workspace만 사용하고 connection/site ID를 body/header tenant로 덮어쓰지 않는다", async () => {
  const calls: unknown[] = [];
  const handlers = createGscRouteHandlers({
    authorizeBilling: allowBillingAccess,
    requireAuth: async () => principal,
    getService: () =>
      service({
        async listProperties(input) {
          calls.push(["properties", input]);
          return [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }];
        },
        async bindProperty(input) {
          calls.push(["bind", input]);
          return service().bindProperty(input);
        },
        async disconnect(input) {
          calls.push(["disconnect", input]);
        },
      }),
  });

  const properties = await handlers.properties.GET(
    new Request("https://semforge.example/api/v1/integrations/gsc/connections/32000000-0000-4000-8000-000000000301/properties"),
    { params: Promise.resolve({ connectionId: "32000000-0000-4000-8000-000000000301" }) },
  );
  assert.equal(properties.status, 200);

  const binding = await handlers.bindings.POST(
    new Request("https://semforge.example/api/v1/integrations/gsc/bindings", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://semforge.example" },
      body: JSON.stringify({
        siteId: "32000000-0000-4000-8000-000000000201",
        connectionId: "32000000-0000-4000-8000-000000000301",
        propertyUri: "sc-domain:example.com",
      }),
    }),
    undefined,
  );
  assert.equal(binding.status, 201);

  const disconnected = await handlers.connection.DELETE(
    new Request("https://semforge.example/api/v1/integrations/gsc/connections/32000000-0000-4000-8000-000000000301", {
      method: "DELETE",
      headers: { origin: "https://semforge.example" },
    }),
    { params: Promise.resolve({ connectionId: "32000000-0000-4000-8000-000000000301" }) },
  );
  assert.equal(disconnected.status, 200);

  assert.deepEqual(calls, [
    ["properties", {
      workspaceId: principal.workspaceId,
      connectionId: "32000000-0000-4000-8000-000000000301",
    }],
    ["bind", {
      workspaceId: principal.workspaceId,
      siteId: "32000000-0000-4000-8000-000000000201",
      connectionId: "32000000-0000-4000-8000-000000000301",
      propertyUri: "sc-domain:example.com",
    }],
    ["disconnect", {
      workspaceId: principal.workspaceId,
      connectionId: "32000000-0000-4000-8000-000000000301",
    }],
  ]);
});

test("account_created는 GSC read/write 직접 API 우회를 차단하고 service를 호출하지 않는다", async () => {
  const capabilities: string[] = [];
  let serviceCalled = false;
  const handlers = createGscRouteHandlers({
    requireAuth: async () => principal,
    authorizeBilling: async ({ capability }) => {
      capabilities.push(capability);
      return {
        allowed: false,
        mode: "billing_only",
        reason: "payment_required",
        reportPeriodEndBefore: null,
      };
    },
    getService: () => service({
      async startConnection() {
        serviceCalled = true;
        return service().startConnection({
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          label: "blocked",
        });
      },
      async listConnections() {
        serviceCalled = true;
        return [];
      },
    }),
  });
  const write = await handlers.connect.POST(
    new Request("https://semforge.example/api/v1/integrations/gsc/connect", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://semforge.example" },
      body: JSON.stringify({ label: "Blocked GSC" }),
    }),
    undefined,
  );
  const read = await handlers.connections.GET(
    new Request("https://semforge.example/api/v1/integrations/gsc/connections"),
    undefined,
  );

  assert.equal(write.status, 403);
  assert.equal((await envelope(write)).error?.code, "FORBIDDEN");
  assert.equal(read.status, 403);
  assert.equal((await envelope(read)).error?.code, "FORBIDDEN");
  assert.deepEqual(capabilities, ["workspace:write", "workspace:read"]);
  assert.equal(serviceCalled, false);
});
