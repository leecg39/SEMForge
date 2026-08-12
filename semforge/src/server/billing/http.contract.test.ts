// @TASK P2-B1-T1 - Auth-injected billing route handler contract
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBillingHttpHandlers,
  type BillingHttpService,
  type RequireAuth,
} from "@/server/billing/http";
import type { WorkspaceSharedOperationPort } from "@/server/privacy/access";

const principal = {
  userId: "0198f06a-1b42-7000-8000-000000000001",
  workspaceId: "0198f06a-1b42-7000-8000-000000000002",
  role: "owner" as const,
  requestId: "request-billing-1",
};

const allowWorkspaceOperations: WorkspaceSharedOperationPort = {
  async withShared(_workspaceId, operation) {
    return { disposition: "executed", value: await operation() };
  },
};

function serviceStub(overrides: Partial<BillingHttpService> = {}): BillingHttpService {
  return {
    async resolveWebhookWorkspace() {
      return principal.workspaceId;
    },
    async getCheckoutIdentity() {
      return {
        customerKey: "semforge_0198f06a1b4270008000000000000002",
        subscriptionStatus: "account_created",
      };
    },
    async getSummary() {
      return { status: "active", amountKrw: 49_000 };
    },
    async completeAuthorization() {
      return { outcome: "paid", account: { subscription: { status: "active" } } };
    },
    async cancelAtPeriodEnd() {
      return {
        effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
        policy: {
          timing: "period_end" as const,
          proratedRefund: false,
          statutoryExceptionsApply: true,
          notice: "법정 예외 적용",
        },
        account: { subscription: { status: "cancel_at_period_end" } },
      };
    },
    async retryPastDue() {
      return { outcome: "paid", account: { subscription: { status: "active" } } };
    },
    async handleWebhook() {
      return { outcome: "processed" };
    },
    ...overrides,
  };
}

test("checkout GET은 owner/admin session tenant의 public clientKey·customerKey·고정 callback URL만 반환한다", async () => {
  let authOptions: Parameters<RequireAuth>[1] | undefined;
  let serviceInput: unknown;
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async (_request, options) => {
      authOptions = options;
      return principal;
    },
    getService: () =>
      serviceStub({
        async getCheckoutIdentity(input) {
          serviceInput = input;
          return {
            customerKey: "semforge_0198f06a1b4270008000000000000002",
            subscriptionStatus: "account_created",
          };
        },
      }),
    checkout: {
      clientKey: "test_ck_semforge_client",
      appPublicUrl: "https://app.semforge.example",
    },
  });

  const response = await handlers.checkout(
    new Request("https://app.semforge.example/api/v1/billing/checkout"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(authOptions, { csrf: false, roles: ["owner", "admin"] });
  assert.deepEqual(serviceInput, { workspaceId: principal.workspaceId });
  assert.deepEqual(body.data, {
    clientKey: "test_ck_semforge_client",
    customerKey: "semforge_0198f06a1b4270008000000000000002",
    method: "CARD",
    successUrl: "https://app.semforge.example/app/billing?billing=success",
    failUrl: "https://app.semforge.example/app/billing?billing=fail",
    subscriptionStatus: "account_created",
  });
});

test("checkout GET은 query/body workspace override를 받지 않는다", async () => {
  let authCalls = 0;
  let serviceCalls = 0;
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => {
      authCalls += 1;
      return principal;
    },
    getService: () =>
      serviceStub({
        async getCheckoutIdentity() {
          serviceCalls += 1;
          return {
            customerKey: "should-not-return",
            subscriptionStatus: "account_created",
          };
        },
      }),
    checkout: {
      clientKey: "test_ck_semforge_client",
      appPublicUrl: "https://app.semforge.example",
    },
  });

  const response = await handlers.checkout(
    new Request(
      `https://app.semforge.example/api/v1/billing/checkout?workspaceId=${principal.workspaceId}`,
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(authCalls, 0);
  assert.equal(serviceCalls, 0);
});

test("빌링 callback POST는 CSRF·owner/admin RequireAuth 경계와 필수 멱등키를 지난다", async () => {
  let authOptions: Parameters<RequireAuth>[1] | undefined;
  let serviceInput: unknown;
  const requireAuth: RequireAuth = async (_request, options) => {
    authOptions = options;
    return principal;
  };
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth,
    getService: () =>
      serviceStub({
        async completeAuthorization(input) {
          serviceInput = input;
          return {
            outcome: "paid",
            account: {
              customer: {
                id: "internal-customer-id",
                tossCustomerKey: "internal-toss-customer-key",
              },
              subscription: {
                id: "internal-subscription-id",
                status: "active",
              },
              paymentMethod: {
                id: "internal-payment-method-id",
                billingKeyEncrypted: "enc:v1:billing-key-secret",
                billingKeyFingerprint: "billing-key-fingerprint-secret",
              },
              latestPayment: {
                id: "internal-payment-id",
                orderId: "internal-order-id",
                idempotencyKey: "internal-idempotency-key",
                tossPaymentKey: "internal-payment-key",
              },
            },
          };
        },
        async getSummary() {
          return {
            status: "active",
            amountKrw: 49_000,
            currentPeriodStart: new Date("2026-08-12T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            nextRetryAt: null,
          };
        },
      }),
  });
  const request = new Request("https://semforge.example/api/v1/billing/authorize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "browser-idempotency-1",
    },
    body: JSON.stringify({ authKey: "auth-key-secret", customerKey: "customer_0198f06a" }),
  });

  const response = await handlers.authorize(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(authOptions, { csrf: true, roles: ["owner", "admin"] });
  assert.deepEqual(serviceInput, {
    workspaceId: principal.workspaceId,
    actorUserId: principal.userId,
    authKey: "auth-key-secret",
    customerKey: "customer_0198f06a",
    requestId: principal.requestId,
    idempotencyKey: "browser-idempotency-1",
  });
  assert.equal(body.requestId, principal.requestId);
  assert.deepEqual(body.data, {
    outcome: "paid",
    subscription: {
      status: "active",
      amountKrw: 49_000,
      currentPeriodStart: "2026-08-12T00:00:00.000Z",
      currentPeriodEnd: "2026-09-12T00:00:00.000Z",
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      nextRetryAt: null,
      policy: {
        timing: "period_end",
        proratedRefund: false,
        statutoryExceptionsApply: true,
        notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
      },
    },
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /billing-key|fingerprint|payment-key|order-id|idempotency-key|internal-(customer|subscription|payment)/i,
  );
  assert.equal(body.error, null);
});

test("멱등키가 없는 인증·재결제·취소 POST를 서비스 호출 전에 거부한다", async () => {
  let calls = 0;
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => principal,
    getService: () =>
      serviceStub({
        async completeAuthorization() {
          calls += 1;
          return { outcome: "paid", account: { subscription: { status: "active" } } };
        },
      }),
  });
  const response = await handlers.authorize(
    new Request("https://semforge.example/api/v1/billing/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authKey: "auth-key-secret", customerKey: "customer_0198f06a" }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  assert.equal(calls, 0);
});

test("본문 workspaceId를 받지 않아 auth principal의 tenant를 바꿀 수 없다", async () => {
  let calls = 0;
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => principal,
    getService: () =>
      serviceStub({
        async completeAuthorization() {
          calls += 1;
          return { outcome: "paid", account: { subscription: { status: "active" } } };
        },
      }),
  });
  const response = await handlers.authorize(
    new Request("https://semforge.example/api/v1/billing/authorize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "browser-idempotency-idor",
      },
      body: JSON.stringify({
        authKey: "auth-key-secret",
        customerKey: "customer_0198f06a",
        workspaceId: "0198f06a-1b42-7000-8000-000000000099",
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("재결제 API는 outcome과 public subscription 요약만 반환한다", async () => {
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => principal,
    getService: () =>
      serviceStub({
        async retryPastDue() {
          return {
            outcome: "pending",
            account: {
              customer: { id: "internal-customer-id" },
              subscription: { id: "internal-subscription-id", status: "charge_pending" },
              paymentMethod: {
                billingKeyEncrypted: "enc:v1:retry-secret",
                billingKeyFingerprint: "retry-fingerprint-secret",
              },
              latestPayment: {
                id: "internal-payment-id",
                orderId: "retry-order-id",
                idempotencyKey: "retry-idempotency-key",
                tossPaymentKey: "retry-payment-key",
              },
            },
          };
        },
        async getSummary() {
          return {
            status: "charge_pending",
            amountKrw: 49_000,
            currentPeriodStart: new Date("2026-08-12T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
            graceEndsAt: new Date("2026-08-19T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
            nextRetryAt: new Date("2026-08-13T00:00:00.000Z"),
          };
        },
      }),
  });
  const response = await handlers.retry(
    new Request("https://semforge.example/api/v1/billing/retry", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "retry-browser-key",
      },
      body: "{}",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, {
    outcome: "pending",
    subscription: {
      status: "charge_pending",
      amountKrw: 49_000,
      currentPeriodStart: "2026-08-12T00:00:00.000Z",
      currentPeriodEnd: "2026-09-12T00:00:00.000Z",
      graceEndsAt: "2026-08-19T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      nextRetryAt: "2026-08-13T00:00:00.000Z",
      policy: {
        timing: "period_end",
        proratedRefund: false,
        statutoryExceptionsApply: true,
        notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
      },
    },
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /billing-key|fingerprint|payment-key|order-id|idempotency-key|internal-(customer|subscription|payment)/i,
  );
});

test("웹훅은 세션 auth를 요구하지 않고 공식 transmission id로 dedupe한다", async () => {
  let authCalls = 0;
  let webhookInput: unknown;
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => {
      authCalls += 1;
      return principal;
    },
    getService: () =>
      serviceStub({
        async handleWebhook(input) {
          webhookInput = input;
          return { outcome: "processed" };
        },
      }),
    now: () => new Date("2026-08-11T03:01:00.000Z"),
  });
  const response = await handlers.webhook(
    new Request("https://semforge.example/api/v1/webhooks/toss", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tosspayments-webhook-transmission-id": "transmission-1",
      },
      body: JSON.stringify({
        eventType: "PAYMENT_STATUS_CHANGED",
        createdAt: "2026-08-11T12:00:00.000000+09:00",
        data: {
          orderId: "sf_order_0198f06a",
          paymentKey: "payment-key-secret",
          status: "DONE",
        },
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(authCalls, 0);
  assert.deepEqual(webhookInput, {
    transmissionId: "transmission-1",
    event: {
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-08-11T12:00:00.000000+09:00",
      data: {
        orderId: "sf_order_0198f06a",
        paymentKey: "payment-key-secret",
        status: "DONE",
      },
    },
    receivedAt: new Date("2026-08-11T03:01:00.000Z"),
  });
});

test("웹훅은 과대 본문과 초당 rate limit 초과를 서비스 호출 전에 거부한다", async () => {
  let calls = 0;
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => principal,
    getService: () =>
      serviceStub({
        async handleWebhook() {
          calls += 1;
          return { outcome: "processed" };
        },
      }),
    now: () => new Date("2026-08-11T03:02:00.000Z"),
  });
  const validBody = JSON.stringify({
    eventType: "PAYMENT_STATUS_CHANGED",
    createdAt: "2026-08-11T12:00:00.000000+09:00",
    data: {
      orderId: "sf_order_0198f06a",
      paymentKey: "payment-key-secret",
      status: "DONE",
    },
  });

  const oversized = await handlers.webhook(
    new Request("https://semforge.example/api/v1/webhooks/toss", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(65 * 1024),
        "tosspayments-webhook-transmission-id": "transmission-oversized",
        "x-forwarded-for": "203.0.113.77",
      },
      body: validBody,
    }),
  );
  assert.equal(oversized.status, 400);

  for (let index = 0; index < 60; index += 1) {
    const response = await handlers.webhook(
      new Request("https://semforge.example/api/v1/webhooks/toss", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tosspayments-webhook-transmission-id": `transmission-rate-${index}`,
          "x-forwarded-for": "203.0.113.78",
        },
        body: validBody,
      }),
    );
    assert.equal(response.status, 200);
  }
  const limited = await handlers.webhook(
    new Request("https://semforge.example/api/v1/webhooks/toss", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tosspayments-webhook-transmission-id": "transmission-rate-limited",
        "x-forwarded-for": "203.0.113.78",
      },
      body: validBody,
    }),
  );
  const limitedBody = await limited.json();

  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  assert.equal(limitedBody.error.code, "RATE_LIMITED");
  assert.equal(calls, 60);
});

test("취소 API는 예약 outcome과 public subscription 요약만 응답한다", async () => {
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => principal,
    getService: () =>
      serviceStub({
        async cancelAtPeriodEnd() {
          return {
            effectiveAt: new Date("2026-09-01T00:00:00.000Z"),
            policy: {
              timing: "period_end",
              proratedRefund: false,
              statutoryExceptionsApply: true,
              notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
            },
            account: {
              customer: {
                id: "internal-customer-id",
                tossCustomerKey: "cancel-toss-customer-key",
              },
              subscription: {
                id: "internal-subscription-id",
                status: "cancel_at_period_end",
              },
              paymentMethod: {
                billingKeyEncrypted: "enc:v1:cancel-secret",
                billingKeyFingerprint: "cancel-fingerprint-secret",
              },
              latestPayment: {
                id: "internal-payment-id",
                orderId: "cancel-order-id",
                idempotencyKey: "cancel-idempotency-internal",
                tossPaymentKey: "cancel-payment-key",
              },
            },
          };
        },
        async getSummary() {
          return {
            status: "cancel_at_period_end",
            amountKrw: 49_000,
            currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
            graceEndsAt: null,
            cancelAtPeriodEnd: true,
            nextRetryAt: null,
            policy: {
              timing: "period_end",
              proratedRefund: false,
              statutoryExceptionsApply: true,
              notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
            },
          };
        },
      }),
  });
  const response = await handlers.cancel(
    new Request("https://semforge.example/api/v1/billing/cancel", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "cancel-idempotency-1",
      },
      body: "{}",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, {
    outcome: "cancel_scheduled",
    subscription: {
      status: "cancel_at_period_end",
      amountKrw: 49_000,
      currentPeriodStart: "2026-08-01T00:00:00.000Z",
      currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      graceEndsAt: null,
      cancelAtPeriodEnd: true,
      nextRetryAt: null,
      policy: {
        timing: "period_end",
        proratedRefund: false,
        statutoryExceptionsApply: true,
        notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
      },
    },
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /billing-key|fingerprint|payment-key|order-id|idempotency-internal|internal-(customer|subscription|payment)/i,
  );
});

test("인증 사용자 요청은 tenant service, Toss webhook은 global service만 선택한다", async () => {
  const scopes: string[] = [];
  const handlers = createBillingHttpHandlers({
    workspaceOperations: allowWorkspaceOperations,
    requireAuth: async () => principal,
    getService(scope) {
      scopes.push(scope);
      return serviceStub();
    },
  });

  assert.equal((await handlers.summary(
    new Request("https://semforge.example/api/v1/billing"),
  )).status, 200);
  assert.equal((await handlers.webhook(
    new Request("https://semforge.example/api/v1/webhooks/toss", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tosspayments-webhook-transmission-id": "role-split-transmission",
        "x-forwarded-for": "203.0.113.79",
      },
      body: JSON.stringify({
        eventType: "PAYMENT_STATUS_CHANGED",
        createdAt: "2026-08-12T12:00:00+09:00",
        data: {
          orderId: "order-role-split",
          paymentKey: "payment-role-split",
          status: "DONE",
        },
      }),
    }),
  )).status, 200);

  assert.deepEqual(scopes, ["tenant", "global"]);
});

for (const state of ["blocking", "erased"] as const) {
  test(`${state} privacy fence는 checkout/summary/authorize/retry/cancel 전체를 409로 막고 tenant service를 호출하지 않는다`, async (t) => {
    let serviceCalls = 0;
    let fenceCalls = 0;
    const blockedService = serviceStub({
      async getCheckoutIdentity() {
        serviceCalls += 1;
        return { customerKey: "must-not-leak", subscriptionStatus: "account_created" };
      },
      async completeAuthorization() {
        serviceCalls += 1;
        return { outcome: "paid", account: {} };
      },
      async retryPastDue() {
        serviceCalls += 1;
        return { outcome: "paid", account: {} };
      },
      async cancelAtPeriodEnd() {
        serviceCalls += 1;
        return serviceStub().cancelAtPeriodEnd({
          workspaceId: principal.workspaceId,
          actorUserId: principal.userId,
          requestId: principal.requestId,
        });
      },
      async getSummary() {
        serviceCalls += 1;
        return { status: "active", amountKrw: 49_000 };
      },
    });
    const handlers = createBillingHttpHandlers({
      requireAuth: async () => principal,
      getService: () => blockedService,
      workspaceOperations: {
        async withShared() {
          fenceCalls += 1;
          return { disposition: "skipped", state };
        },
      },
      checkout: {
        clientKey: "test_ck_semforge_client",
        appPublicUrl: "https://app.semforge.example",
      },
    });
    const jsonHeaders = {
      "content-type": "application/json",
      "idempotency-key": "privacy-fence-idempotency",
    };
    const requests = [
      ["checkout", () => handlers.checkout(new Request("https://app.semforge.example/api/v1/billing/checkout"))],
      ["summary", () => handlers.summary(new Request("https://app.semforge.example/api/v1/billing/subscription"))],
      ["authorize", () => handlers.authorize(new Request("https://app.semforge.example/api/v1/billing/authorize", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ authKey: "auth-key", customerKey: "customer-key" }),
      }))],
      ["retry", () => handlers.retry(new Request("https://app.semforge.example/api/v1/billing/retry", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      }))],
      ["cancel", () => handlers.cancel(new Request("https://app.semforge.example/api/v1/billing/cancel", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      }))],
    ] as const;

    for (const [name, invoke] of requests) {
      await t.test(name, async () => {
        const response = await invoke();
        const body = await response.json();
        assert.equal(response.status, 409);
        assert.equal(body.error.code, "CONFLICT");
      });
    }
    assert.equal(fenceCalls, requests.length);
    assert.equal(serviceCalls, 0);
  });
}

test("canonical workspace를 찾지 못한 webhook은 lookup race를 재시도하지 않고 200 terminal ACK한다", async () => {
  let webhookCalls = 0;
  let fenceCalls = 0;
  const handlers = createBillingHttpHandlers({
    requireAuth: async () => principal,
    getService: () => serviceStub({
      async resolveWebhookWorkspace() {
        return null;
      },
      async handleWebhook() {
        webhookCalls += 1;
        return { outcome: "processed" };
      },
    }),
    workspaceOperations: {
      async withShared(_workspaceId, operation) {
        fenceCalls += 1;
        return { disposition: "executed", value: await operation() };
      },
    },
    now: () => new Date("2026-08-12T04:02:00.000Z"),
  });

  const response = await handlers.webhook(new Request("https://app.semforge.example/api/v1/webhooks/toss", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tosspayments-webhook-transmission-id": "canonical-workspace-missing",
      "x-forwarded-for": "203.0.113.94",
    },
    body: JSON.stringify({
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-08-12T13:02:00+09:00",
      data: { orderId: "unknown-order", paymentKey: "unknown-payment", status: "DONE" },
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, {
    outcome: "ignored",
    reason: "canonical_workspace_not_found",
  });
  assert.equal(fenceCalls, 0);
  assert.equal(webhookCalls, 0);
});

test("active billing summary는 fence 안에서 읽고 canonical webhook도 fence 안에서 법정 ledger 경로를 유지한다", async () => {
  let fenceCalls = 0;
  let summaryCalls = 0;
  let webhookCalls = 0;
  const handlers = createBillingHttpHandlers({
    requireAuth: async () => principal,
    getService: () => serviceStub({
      async getSummary() {
        summaryCalls += 1;
        return { status: "canceled", amountKrw: 49_000 };
      },
      async handleWebhook() {
        webhookCalls += 1;
        return { outcome: "processed" };
      },
    }),
    workspaceOperations: {
      async withShared(_workspaceId, operation) {
        fenceCalls += 1;
        return { disposition: "executed", value: await operation() };
      },
    },
    now: () => new Date("2026-08-12T04:00:00.000Z"),
  });

  const summary = await handlers.summary(
    new Request("https://app.semforge.example/api/v1/billing/subscription"),
  );
  const webhook = await handlers.webhook(new Request("https://app.semforge.example/api/v1/webhooks/toss", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "tosspayments-webhook-transmission-id": "privacy-ledger-transmission",
      "x-forwarded-for": "203.0.113.91",
    },
    body: JSON.stringify({
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-08-12T13:00:00+09:00",
      data: { orderId: "ledger-order", paymentKey: "ledger-payment", status: "DONE" },
    }),
  }));

  assert.equal(summary.status, 200);
  assert.equal(webhook.status, 200);
  assert.equal(summaryCalls, 1);
  assert.equal(webhookCalls, 1);
  assert.equal(fenceCalls, 2);
});

for (const state of ["blocking", "erased"] as const) {
  test(`${state} canonical billing workspace webhook은 forged body tenant와 무관하게 200 ACK하고 mutable 처리를 0회 유지한다`, async () => {
    let resolverCalls = 0;
    let webhookCalls = 0;
    const lockedWorkspaces: string[] = [];
    const canonicalWorkspaceId = "0198f06a-1b42-7000-8000-000000000088";
    const handlers = createBillingHttpHandlers({
      requireAuth: async () => principal,
      getService: () => serviceStub({
        async resolveWebhookWorkspace() {
          resolverCalls += 1;
          return canonicalWorkspaceId;
        },
        async handleWebhook() {
          webhookCalls += 1;
          return { outcome: "processed" };
        },
      }),
      workspaceOperations: {
        async withShared(workspaceId) {
          lockedWorkspaces.push(workspaceId);
          return { disposition: "skipped", state };
        },
      },
      now: () => new Date("2026-08-12T04:01:00.000Z"),
    });

    const response = await handlers.webhook(new Request("https://app.semforge.example/api/v1/webhooks/toss", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tosspayments-webhook-transmission-id": `privacy-${state}-transmission`,
        "x-forwarded-for": `203.0.113.${state === "blocking" ? "92" : "93"}`,
      },
      body: JSON.stringify({
        workspaceId: principal.workspaceId,
        eventType: "PAYMENT_STATUS_CHANGED",
        createdAt: "2026-08-12T13:01:00+09:00",
        data: { orderId: "canonical-erased-order", paymentKey: "forged-payment", status: "DONE" },
      }),
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, {
      outcome: "ignored",
      reason: "workspace_privacy_blocked",
    });
    assert.equal(resolverCalls, 1);
    assert.deepEqual(lockedWorkspaces, [canonicalWorkspaceId]);
    assert.equal(webhookCalls, 0);
  });
}
