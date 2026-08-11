// @TASK P2-B1-T1 - Toss Payments v2 HTTP adapter contract
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TossTransportError,
  createTossBillingClient,
} from "@/server/billing/toss-client";

const secretKey = "test_sk_semforge_secret";

function billingResponse() {
  return {
    mId: "semforge",
    customerKey: "customer_0198f06a",
    authenticatedAt: "2026-08-11T12:00:00+09:00",
    method: "카드",
    billingKey: "billing-key-secret",
    card: {
      issuerCode: "11",
      number: "12345678****1234",
      cardType: "신용",
      ownerType: "법인",
    },
  };
}

function paymentResponse(status = "DONE") {
  return {
    paymentKey: "payment-key-secret",
    orderId: "sf_order_0198f06a",
    orderName: "SEMForge 월간 구독",
    status,
    totalAmount: 49_000,
    method: "카드",
    requestedAt: "2026-08-11T12:00:00+09:00",
    approvedAt: status === "DONE" ? "2026-08-11T12:00:01+09:00" : null,
    card: { issuerCode: "11", number: "12345678****1234" },
  };
}

test("빌링키 발급에 공식 v1 서버 API, Basic auth, 필수 Idempotency-Key를 사용한다", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = createTossBillingClient({
    secretKey,
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json(billingResponse());
    },
  });

  const result = await client.issueBillingKey({
    authKey: "auth-key-secret",
    customerKey: "customer_0198f06a",
    idempotencyKey: "billing-issue-idempotency-1",
  });

  assert.equal(capturedUrl, "https://api.tosspayments.com/v1/billing/authorizations/issue");
  assert.equal(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authorization"), `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`);
  assert.equal(headers.get("idempotency-key"), "billing-issue-idempotency-1");
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    authKey: "auth-key-secret",
    customerKey: "customer_0198f06a",
  });
  assert.equal(result.billingKey, "billing-key-secret");
});

test("자동결제 승인은 49,000원·고정 주문번호·멱등키를 전달한다", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = createTossBillingClient({
    secretKey,
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json(paymentResponse());
    },
  });

  await client.chargeBillingKey({
    billingKey: "billing-key-secret",
    customerKey: "customer_0198f06a",
    amount: 49_000,
    orderId: "sf_order_0198f06a",
    orderName: "SEMForge 월간 구독",
    idempotencyKey: "billing-charge-idempotency-1",
  });

  assert.equal(capturedUrl, "https://api.tosspayments.com/v1/billing/billing-key-secret");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("idempotency-key"), "billing-charge-idempotency-1");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    amount: 49_000,
    customerKey: "customer_0198f06a",
    orderId: "sf_order_0198f06a",
    orderName: "SEMForge 월간 구독",
  });
});

test("빈 Idempotency-Key를 외부 호출 전에 거부한다", async () => {
  let calls = 0;
  const client = createTossBillingClient({
    secretKey,
    fetchImpl: async () => {
      calls += 1;
      return Response.json(paymentResponse());
    },
  });

  await assert.rejects(
    () =>
      client.chargeBillingKey({
        billingKey: "billing-key-secret",
        customerKey: "customer_0198f06a",
        amount: 49_000,
        orderId: "sf_order_0198f06a",
        orderName: "SEMForge 월간 구독",
        idempotencyKey: "",
      }),
    /Idempotency-Key/,
  );
  assert.equal(calls, 0);
});

test("타임아웃은 성공 여부가 모호한 재조회 대상 오류로 구분한다", async () => {
  const client = createTossBillingClient({
    secretKey,
    timeoutMs: 60_000,
    fetchImpl: async () => {
      throw new DOMException("timed out", "TimeoutError");
    },
  });

  await assert.rejects(
    () =>
      client.chargeBillingKey({
        billingKey: "billing-key-secret",
        customerKey: "customer_0198f06a",
        amount: 49_000,
        orderId: "sf_order_0198f06a",
        orderName: "SEMForge 월간 구독",
        idempotencyKey: "billing-charge-idempotency-1",
      }),
    (error: unknown) =>
      error instanceof TossTransportError && error.ambiguous && error.kind === "timeout",
  );
});

test("Query API로 orderId의 권위 있는 결제 상태를 읽는다", async () => {
  let capturedUrl = "";
  const client = createTossBillingClient({
    secretKey,
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return Response.json(paymentResponse());
    },
  });

  const payment = await client.queryPaymentByOrderId("sf_order_0198f06a");
  assert.equal(capturedUrl, "https://api.tosspayments.com/v1/payments/orders/sf_order_0198f06a");
  assert.equal(payment?.status, "DONE");
});

test("로그에 Basic auth·authKey·billingKey·customerKey·paymentKey를 노출하지 않는다", async () => {
  const logs: string[] = [];
  const client = createTossBillingClient({
    secretKey,
    logger: {
      info: (entry) => logs.push(JSON.stringify(entry)),
      error: (entry) => logs.push(JSON.stringify(entry)),
    },
    fetchImpl: async () =>
      Response.json(
        {
          code: "REJECT_CARD_COMPANY",
          message: "provider rejected",
          authKey: "auth-key-secret",
          billingKey: "billing-key-secret",
          customerKey: "customer_0198f06a",
          paymentKey: "payment-key-secret",
        },
        { status: 400 },
      ),
  });

  await assert.rejects(() =>
    client.issueBillingKey({
      authKey: "auth-key-secret",
      customerKey: "customer_0198f06a",
      idempotencyKey: "billing-issue-idempotency-1",
    }),
  );

  const combined = logs.join("\n");
  for (const secret of [
    secretKey,
    Buffer.from(`${secretKey}:`).toString("base64"),
    "auth-key-secret",
    "billing-key-secret",
    "customer_0198f06a",
    "payment-key-secret",
  ]) {
    assert.equal(combined.includes(secret), false, `로그가 ${secret}를 포함함`);
  }
  assert.match(combined, /REJECT_CARD_COMPANY/);
});
