"use client";

// @TASK P4-B1 - Toss billing authorization launch and callback completion
// @SPEC https://docs.tosspayments.com/guides/v2/billing/integration
// @TEST src/components/core-shell/billing-checkout.test.ts
import { useEffect, useRef, useState } from "react";

import { ContentCard } from "@/components/core-shell/page-structure";

const SUBSCRIPTION_STATUSES = new Set([
  "invited",
  "account_created",
  "billing_authorized",
  "charge_pending",
  "active",
  "past_due",
  "cancel_at_period_end",
  "canceled",
]);

export interface BillingCheckoutConfig {
  readonly clientKey: string;
  readonly customerKey: string;
  readonly method: "CARD";
  readonly successUrl: string;
  readonly failUrl: string;
  readonly subscriptionStatus: string;
}

export type BillingCallback =
  | {
      readonly kind: "success";
      readonly authKey: string;
      readonly customerKey: string;
    }
  | { readonly kind: "fail"; readonly code?: string };

interface TossPaymentLoaderResult {
  payment(input: { readonly customerKey: string }): {
    requestBillingAuth(input: {
      readonly method: "CARD";
      readonly successUrl: string;
      readonly failUrl: string;
    }): Promise<void>;
  };
}

type TossPaymentLoader = (clientKey: string) => Promise<TossPaymentLoaderResult>;
type BillingUiState = "idle" | "launching" | "completing" | "error" | "failed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim();
}

function expectedCallback(origin: string, billing: "success" | "fail"): string {
  return new URL(`/app/billing?billing=${billing}`, new URL(origin).origin).toString();
}

export function parseBillingCheckoutEnvelope(
  envelope: unknown,
  browserOrigin: string,
): BillingCheckoutConfig {
  if (!isRecord(envelope) || !isRecord(envelope.data)) {
    throw new Error("결제 설정 응답이 올바르지 않습니다.");
  }
  const value = envelope.data;
  if (
    !validBoundedString(value.clientKey, 300) ||
    !validBoundedString(value.customerKey, 50) ||
    !/^[A-Za-z0-9_\-=.@]+$/.test(value.customerKey) ||
    value.method !== "CARD" ||
    value.successUrl !== expectedCallback(browserOrigin, "success") ||
    value.failUrl !== expectedCallback(browserOrigin, "fail") ||
    typeof value.subscriptionStatus !== "string" ||
    !SUBSCRIPTION_STATUSES.has(value.subscriptionStatus)
  ) {
    throw new Error("결제 설정 응답이 올바르지 않습니다.");
  }
  return {
    clientKey: value.clientKey,
    customerKey: value.customerKey,
    method: value.method,
    successUrl: value.successUrl,
    failUrl: value.failUrl,
    subscriptionStatus: value.subscriptionStatus,
  };
}

function exactlyOne(params: URLSearchParams, key: string, max: number): string | undefined {
  const values = params.getAll(key);
  if (values.length === 0) return undefined;
  const value = values[0];
  if (values.length !== 1 || !validBoundedString(value, max)) {
    throw new Error("결제 인증 callback이 올바르지 않습니다.");
  }
  return value;
}

export function parseBillingCallback(params: URLSearchParams): BillingCallback | null {
  const billing = exactlyOne(params, "billing", 20);
  if (billing === undefined) return null;
  if (billing === "fail") {
    const rawCode = exactlyOne(params, "code", 100);
    const code = rawCode?.match(/^[A-Z0-9_]+$/) ? rawCode : undefined;
    return { kind: "fail", ...(code ? { code } : {}) };
  }
  if (billing !== "success") return null;
  const authKey = exactlyOne(params, "authKey", 300);
  const customerKey = exactlyOne(params, "customerKey", 50);
  if (!authKey || !customerKey) {
    throw new Error("결제 인증 callback이 올바르지 않습니다.");
  }
  return { kind: "success", authKey, customerKey };
}

export async function requestBillingCheckoutConfig(
  fetcher: typeof fetch = fetch,
  browserOrigin: string = window.location.origin,
): Promise<BillingCheckoutConfig> {
  const response = await fetcher("/api/v1/billing/checkout", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("결제 설정을 불러오지 못했습니다.");
  return parseBillingCheckoutEnvelope(payload, browserOrigin);
}

export async function launchBillingAuthorization(
  config: BillingCheckoutConfig,
  loader?: TossPaymentLoader,
): Promise<void> {
  const load =
    loader ??
    (async (clientKey: string) => {
      const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
      return loadTossPayments(clientKey);
    });
  const tossPayments = await load(config.clientKey);
  const payment = tossPayments.payment({ customerKey: config.customerKey });
  await payment.requestBillingAuth({
    method: config.method,
    successUrl: config.successUrl,
    failUrl: config.failUrl,
  });
}

export async function billingAuthorizationIdempotencyKey(
  authKey: string,
  customerKey: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `semforge-billing-browser-v1\u0000${authKey}\u0000${customerKey}`,
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `semforge-billing-auth-v1_${hex}`;
}

export async function completeBillingAuthorization(
  callback: Extract<BillingCallback, { readonly kind: "success" }>,
  config: BillingCheckoutConfig,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (callback.customerKey !== config.customerKey) {
    throw new Error("결제 인증 고객 정보가 현재 workspace와 일치하지 않습니다.");
  }
  const response = await fetcher("/api/v1/billing/authorize", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": await billingAuthorizationIdempotencyKey(
        callback.authKey,
        callback.customerKey,
      ),
    },
    body: JSON.stringify({
      authKey: callback.authKey,
      customerKey: callback.customerKey,
    }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("결제 인증을 완료하지 못했습니다.");
  }
}

export function BillingCheckout() {
  const [state, setState] = useState<BillingUiState>("idle");
  const processedCallback = useRef(false);

  useEffect(() => {
    if (processedCallback.current) return;
    let callback: BillingCallback | null;
    try {
      callback = parseBillingCallback(new URLSearchParams(window.location.search));
    } catch {
      processedCallback.current = true;
      window.history.replaceState(window.history.state, "", "/app/billing");
      queueMicrotask(() => setState("error"));
      return;
    }
    if (!callback) return;
    processedCallback.current = true;
    window.history.replaceState(window.history.state, "", "/app/billing");
    if (callback.kind === "fail") {
      queueMicrotask(() => setState("failed"));
      return;
    }
    queueMicrotask(() => setState("completing"));
    void requestBillingCheckoutConfig()
      .then((config) => completeBillingAuthorization(callback, config))
      .then(() => window.location.replace("/app/billing"))
      .catch(() => setState("error"));
  }, []);

  async function launch() {
    setState("launching");
    try {
      const config = await requestBillingCheckoutConfig();
      await launchBillingAuthorization(config);
    } catch {
      setState("error");
    }
  }

  const pending = state === "launching" || state === "completing";
  return (
    <ContentCard eyebrow="Toss 자동결제" title="결제 수단 연결">
      <p className="sf-body-copy">
        카드 인증이 끝나면 월 49,000원(VAT 포함)의 첫 결제가 진행됩니다. 이후 매월 같은
        결제 수단으로 자동 청구됩니다.
      </p>
      <div className="sf-form-actions">
        <button
          className="sf-button sf-button--primary"
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void launch()}
        >
          {state === "launching"
            ? "Toss 결제창 여는 중…"
            : state === "completing"
              ? "첫 결제 확인 중…"
              : "카드 연결 또는 변경"}
        </button>
        {state === "failed" && (
          <p role="alert">카드 인증이 완료되지 않았습니다. 준비되면 다시 시도해 주세요.</p>
        )}
        {state === "error" && (
          <p role="alert">결제 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        )}
      </div>
    </ContentCard>
  );
}
