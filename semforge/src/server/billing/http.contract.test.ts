// @TASK P2-B1-T1 - Auth-injected billing route handler contract
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBillingHttpHandlers,
  type BillingHttpService,
  type RequireAuth,
} from "@/server/billing/http";

const principal = {
  userId: "0198f06a-1b42-7000-8000-000000000001",
  workspaceId: "0198f06a-1b42-7000-8000-000000000002",
  role: "owner" as const,
  requestId: "request-billing-1",
};

function serviceStub(overrides: Partial<BillingHttpService> = {}): BillingHttpService {
  return {
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
    requireAuth,
    getService: () =>
      serviceStub({
        async completeAuthorization(input) {
          serviceInput = input;
          return { outcome: "paid", account: { subscription: { status: "active" } } };
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
  assert.equal(body.data.account.subscription.status, "active");
  assert.equal(body.error, null);
});

test("멱등키가 없는 인증·재결제·취소 POST를 서비스 호출 전에 거부한다", async () => {
  let calls = 0;
  const handlers = createBillingHttpHandlers({
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

test("웹훅은 세션 auth를 요구하지 않고 공식 transmission id로 dedupe한다", async () => {
  let authCalls = 0;
  let webhookInput: unknown;
  const handlers = createBillingHttpHandlers({
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

test("취소 API는 효력 발생일과 무일할환불·법정예외 정책을 응답한다", async () => {
  const handlers = createBillingHttpHandlers({
    requireAuth: async () => principal,
    getService: () => serviceStub(),
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
  assert.equal(body.data.effectiveAt, "2026-09-01T00:00:00.000Z");
  assert.equal(body.data.policy.proratedRefund, false);
  assert.equal(body.data.policy.statutoryExceptionsApply, true);
});
