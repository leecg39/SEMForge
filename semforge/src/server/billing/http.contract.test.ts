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
