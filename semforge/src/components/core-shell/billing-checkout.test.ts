// @TASK P4-B1 - Toss billing launch and callback client contract
// @SPEC https://docs.tosspayments.com/guides/v2/billing/integration
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  billingAuthorizationIdempotencyKey,
  completeBillingAuthorization,
  launchBillingAuthorization,
  parseBillingCallback,
  parseBillingCheckoutEnvelope,
} from "@/components/core-shell/billing-checkout";

const checkout = {
  clientKey: "test_ck_semforge_client",
  customerKey: "semforge_0198f06a1b4270008000000000000002",
  method: "CARD" as const,
  successUrl: "https://app.semforge.example/app/billing?billing=success",
  failUrl: "https://app.semforge.example/app/billing?billing=fail",
  subscriptionStatus: "account_created",
};

test("checkout envelope는 같은 origin의 고정 billing callback 계약만 허용한다", () => {
  assert.deepEqual(
    parseBillingCheckoutEnvelope({ data: checkout }, "https://app.semforge.example"),
    checkout,
  );
  assert.throws(
    () =>
      parseBillingCheckoutEnvelope(
        { data: { ...checkout, successUrl: "https://evil.example/steal" } },
        "https://app.semforge.example",
      ),
    /올바르지 않습니다/,
  );
  assert.throws(
    () =>
      parseBillingCheckoutEnvelope(
        { data: { ...checkout, customerKey: "" } },
        "https://app.semforge.example",
      ),
    /올바르지 않습니다/,
  );
});

test("launch는 서버 customerKey로 Toss payment를 만들고 CARD 자동결제 인증을 요청한다", async () => {
  const calls: unknown[] = [];
  await launchBillingAuthorization(checkout, async (clientKey) => {
    calls.push(["load", clientKey]);
    return {
      payment({ customerKey }) {
        calls.push(["payment", customerKey]);
        return {
          async requestBillingAuth(input) {
            calls.push(["requestBillingAuth", input]);
          },
        };
      },
    };
  });

  assert.deepEqual(calls, [
    ["load", checkout.clientKey],
    ["payment", checkout.customerKey],
    [
      "requestBillingAuth",
      {
        method: "CARD",
        successUrl: checkout.successUrl,
        failUrl: checkout.failUrl,
      },
    ],
  ]);
});

test("success callback은 authKey/customerKey를 한 번만 파싱하고 provider message는 무시한다", () => {
  assert.deepEqual(
    parseBillingCallback(
      new URLSearchParams(
        "billing=success&authKey=one-time-auth&customerKey=semforge_0198f06a1b4270008000000000000002",
      ),
    ),
    {
      kind: "success",
      authKey: "one-time-auth",
      customerKey: checkout.customerKey,
    },
  );
  assert.deepEqual(
    parseBillingCallback(
      new URLSearchParams("billing=fail&code=USER_CANCEL&message=%3Cscript%3E"),
    ),
    { kind: "fail", code: "USER_CANCEL" },
  );
  assert.throws(
    () =>
      parseBillingCallback(
        new URLSearchParams(
          `billing=success&authKey=one&authKey=two&customerKey=${checkout.customerKey}`,
        ),
      ),
    /올바르지 않습니다/,
  );
});

test("callback POST는 customerKey를 서버 설정과 대조하고 안정적인 멱등키를 보낸다", async () => {
  const callback = {
    kind: "success" as const,
    authKey: "one-time-auth-key",
    customerKey: checkout.customerKey,
  };
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return Response.json({ data: { outcome: "paid" }, error: null });
  };

  await completeBillingAuthorization(callback, checkout, fetcher);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.input, "/api/v1/billing/authorize");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.credentials, "same-origin");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    authKey: callback.authKey,
    customerKey: callback.customerKey,
  });
  const headers = new Headers(requests[0]?.init?.headers);
  const idempotencyKey = headers.get("Idempotency-Key");
  assert.equal(
    idempotencyKey,
    await billingAuthorizationIdempotencyKey(callback.authKey, callback.customerKey),
  );
  assert.equal(idempotencyKey?.includes(callback.authKey), false);

  await assert.rejects(
    completeBillingAuthorization(
      { ...callback, customerKey: "semforge_other_workspace" },
      checkout,
      fetcher,
    ),
    /일치하지 않습니다/,
  );
  assert.equal(requests.length, 1);
});
