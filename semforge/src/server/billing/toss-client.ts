// @TASK P2-B1-T1 - Toss Payments automatic billing HTTP adapter
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
// @TEST src/server/billing/toss-client.contract.test.ts
// Official contract: https://docs.tosspayments.com/reference
// Authentication/idempotency: https://docs.tosspayments.com/reference/using-api/authorization

const TOSS_API_ORIGIN = "https://api.tosspayments.com";
export const DEFAULT_TOSS_TIMEOUT_MS = 65_000;

type JsonRecord = Record<string, unknown>;

export interface TossLogger {
  info(entry: Readonly<Record<string, unknown>>): void;
  error(entry: Readonly<Record<string, unknown>>): void;
}

export interface TossCardSummary {
  readonly issuerCode: string | null;
  readonly number: string | null;
}

export interface TossBillingAuthorization {
  readonly customerKey: string;
  readonly authenticatedAt: string;
  readonly method: string;
  readonly billingKey: string;
  readonly card: TossCardSummary | null;
}

export interface TossPayment {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly status: string;
  readonly totalAmount: number;
  readonly requestedAt: string;
  readonly approvedAt: string | null;
  readonly method: string;
  readonly card: TossCardSummary | null;
}

export type TossTransportFailureKind = "timeout" | "network" | "invalid_response";

export class TossTransportError extends Error {
  constructor(
    message: string,
    readonly kind: TossTransportFailureKind,
    readonly ambiguous: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TossTransportError";
  }
}

export class TossApiError extends Error {
  readonly ambiguous: boolean;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    ambiguous = status >= 500 || code === "IDEMPOTENT_REQUEST_PROCESSING",
  ) {
    super(message);
    this.name = "TossApiError";
    this.ambiguous = ambiguous;
  }
}

export interface TossBillingClient {
  issueBillingKey(input: {
    readonly authKey: string;
    readonly customerKey: string;
    readonly idempotencyKey: string;
  }): Promise<TossBillingAuthorization>;
  chargeBillingKey(input: {
    readonly billingKey: string;
    readonly customerKey: string;
    readonly amount: number;
    readonly orderId: string;
    readonly orderName: string;
    readonly idempotencyKey: string;
    readonly customerEmail?: string;
    readonly customerName?: string;
    readonly customerIp?: string;
  }): Promise<TossPayment>;
  queryPaymentByOrderId(orderId: string): Promise<TossPayment | null>;
  queryPaymentByPaymentKey(paymentKey: string): Promise<TossPayment | null>;
  deleteBillingKey(billingKey: string): Promise<void>;
}

export interface TossBillingClientOptions {
  readonly secretKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly logger?: TossLogger;
}

const sensitiveKeyPattern =
  /^(authorization|authkey|billingkey|customerkey|paymentkey|cardnumber|number|accountnumber|secret)$/i;

/** Defense-in-depth helper for structured provider logs. */
export function redactTossLogValue(value: unknown, key = ""): unknown {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redactTossLogValue(entry));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactTossLogValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new TossTransportError(`Toss 응답에 ${key}가 없습니다.`, "invalid_response", false);
  }
  return value;
}

function nullableString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new TossTransportError(`Toss 응답의 ${key} 형식이 올바르지 않습니다.`, "invalid_response", false);
  }
  return value;
}

function cardSummary(value: unknown): TossCardSummary | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new TossTransportError("Toss 카드 응답 형식이 올바르지 않습니다.", "invalid_response", false);
  }
  return {
    issuerCode: nullableString(value, "issuerCode"),
    number: nullableString(value, "number"),
  };
}

function parseBilling(value: unknown): TossBillingAuthorization {
  if (!isRecord(value)) {
    throw new TossTransportError("Toss Billing 응답 형식이 올바르지 않습니다.", "invalid_response", false);
  }
  return {
    customerKey: requiredString(value, "customerKey"),
    authenticatedAt: requiredString(value, "authenticatedAt"),
    method: requiredString(value, "method"),
    billingKey: requiredString(value, "billingKey"),
    card: cardSummary(value.card),
  };
}

function parsePayment(value: unknown): TossPayment {
  if (!isRecord(value)) {
    throw new TossTransportError("Toss Payment 응답 형식이 올바르지 않습니다.", "invalid_response", false);
  }
  const totalAmount = value.totalAmount;
  if (!Number.isSafeInteger(totalAmount) || (totalAmount as number) < 0) {
    throw new TossTransportError("Toss Payment 금액 형식이 올바르지 않습니다.", "invalid_response", false);
  }
  return {
    paymentKey: requiredString(value, "paymentKey"),
    orderId: requiredString(value, "orderId"),
    status: requiredString(value, "status"),
    totalAmount: totalAmount as number,
    requestedAt: requiredString(value, "requestedAt"),
    approvedAt: nullableString(value, "approvedAt"),
    method: requiredString(value, "method"),
    card: cardSummary(value.card),
  };
}

function assertIdempotencyKey(value: string): void {
  if (!value || value !== value.trim()) throw new Error("Idempotency-Key가 필요합니다.");
  if (value.length > 300) throw new Error("Idempotency-Key는 300자 이하여야 합니다.");
}

function assertProviderIdentifier(name: string, value: string, maximum: number): void {
  if (!value || value !== value.trim() || value.length > maximum) {
    throw new Error(`${name} 형식이 올바르지 않습니다.`);
  }
}

function safeApiError(status: number, value: unknown): TossApiError {
  const body = isRecord(value) ? value : {};
  const code = typeof body.code === "string" && body.code ? body.code : "TOSS_HTTP_ERROR";
  const providerMessage =
    typeof body.message === "string" && body.message
      ? body.message
      : `Toss API HTTP ${status}`;
  const retryable = status === 408 || status === 429 || status >= 500;
  return new TossApiError(status, code, providerMessage, retryable);
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export function createTossBillingClient(options: TossBillingClientOptions): TossBillingClient {
  if (!options.secretKey || options.secretKey !== options.secretKey.trim()) {
    throw new Error("Toss secret key가 필요합니다.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TOSS_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000) {
    throw new Error("Toss 자동결제 timeout은 60초 이상이어야 합니다.");
  }
  const authorization = `Basic ${Buffer.from(`${options.secretKey}:`, "utf8").toString("base64")}`;

  async function request(
    operation: string,
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: JsonRecord,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: unknown }> {
    if (method === "POST") assertIdempotencyKey(idempotencyKey ?? "");
    const headers = new Headers({
      Accept: "application/json",
      "Accept-Language": "en-US",
      Authorization: authorization,
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (idempotencyKey !== undefined) headers.set("Idempotency-Key", idempotencyKey);

    options.logger?.info({ provider: "toss", operation, phase: "request" });
    let response: Response;
    try {
      response = await fetchImpl(`${TOSS_API_ORIGIN}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timeout = isTimeoutError(error);
      options.logger?.error({
        provider: "toss",
        operation,
        phase: "transport_error",
        kind: timeout ? "timeout" : "network",
      });
      throw new TossTransportError(
        timeout ? "Toss API 요청 시간이 초과됐습니다." : "Toss API 네트워크 요청이 실패했습니다.",
        timeout ? "timeout" : "network",
        true,
        { cause: error },
      );
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        options.logger?.error({
          provider: "toss",
          operation,
          phase: "invalid_response",
          status: response.status,
        });
        throw new TossTransportError(
          "Toss API가 읽을 수 없는 응답을 반환했습니다.",
          "invalid_response",
          response.status >= 500,
          { cause: error },
        );
      }
    }
    if (!response.ok) {
      const apiError = safeApiError(response.status, parsed);
      options.logger?.error({
        provider: "toss",
        operation,
        phase: "api_error",
        status: apiError.status,
        code: apiError.code,
      });
      throw apiError;
    }
    options.logger?.info({
      provider: "toss",
      operation,
      phase: "response",
      status: response.status,
    });
    return { status: response.status, body: parsed };
  }

  async function query(path: string, operation: string): Promise<TossPayment | null> {
    try {
      const result = await request(operation, path, "GET");
      return parsePayment(result.body);
    } catch (error) {
      if (error instanceof TossApiError && error.status === 404) return null;
      throw error;
    }
  }

  return {
    async issueBillingKey(input) {
      assertProviderIdentifier("authKey", input.authKey, 300);
      assertProviderIdentifier("customerKey", input.customerKey, 300);
      assertIdempotencyKey(input.idempotencyKey);
      const result = await request(
        "billing_key.issue",
        "/v1/billing/authorizations/issue",
        "POST",
        { authKey: input.authKey, customerKey: input.customerKey },
        input.idempotencyKey,
      );
      return parseBilling(result.body);
    },

    async chargeBillingKey(input) {
      assertProviderIdentifier("billingKey", input.billingKey, 200);
      assertProviderIdentifier("customerKey", input.customerKey, 300);
      assertProviderIdentifier("orderId", input.orderId, 64);
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(input.orderId)) {
        throw new Error("orderId 형식이 Toss 계약과 다릅니다.");
      }
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
        throw new Error("결제 금액은 양의 정수여야 합니다.");
      }
      assertIdempotencyKey(input.idempotencyKey);
      const body: JsonRecord = {
        amount: input.amount,
        customerKey: input.customerKey,
        orderId: input.orderId,
        orderName: input.orderName,
        ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
        ...(input.customerName ? { customerName: input.customerName } : {}),
        ...(input.customerIp ? { customerIp: input.customerIp } : {}),
      };
      const result = await request(
        "billing.charge",
        `/v1/billing/${encodeURIComponent(input.billingKey)}`,
        "POST",
        body,
        input.idempotencyKey,
      );
      return parsePayment(result.body);
    },

    async queryPaymentByOrderId(orderId) {
      assertProviderIdentifier("orderId", orderId, 64);
      return query(
        `/v1/payments/orders/${encodeURIComponent(orderId)}`,
        "payment.query_by_order",
      );
    },

    async queryPaymentByPaymentKey(paymentKey) {
      assertProviderIdentifier("paymentKey", paymentKey, 200);
      return query(
        `/v1/payments/${encodeURIComponent(paymentKey)}`,
        "payment.query_by_key",
      );
    },

    async deleteBillingKey(billingKey) {
      assertProviderIdentifier("billingKey", billingKey, 200);
      await request(
        "billing_key.delete",
        `/v1/billing/${encodeURIComponent(billingKey)}`,
        "DELETE",
      );
    },
  };
}
