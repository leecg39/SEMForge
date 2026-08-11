// @TASK P2-B1-T1 - Auth-injected billing route handler adapter
// @SPEC docs/planning/06-tasks.md#p2-b1-t1--toss-자동결제-상태-머신과-ledger
import { z } from "zod";

import { ApiError } from "@/lib/api-v1";
import { zodErrorFields } from "@/lib/api-v1/body";
import { resolveRequestId } from "@/lib/api-v1/request-id";
import { errorResponse, successResponse } from "@/lib/api-v1/response";
import type { SubscriptionStatus } from "@/server/billing/domain";
import type {
  BillingChargeResult,
  BillingService,
  TossBillingWebhook,
} from "@/server/billing/service";

export interface BillingPrincipal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: "owner" | "admin" | "member";
  readonly requestId: string;
}

export type RequireAuth = (
  request: Request,
  options: {
    readonly csrf: boolean;
    readonly roles: readonly BillingPrincipal["role"][];
  },
) => Promise<BillingPrincipal>;

export type BillingSummaryResponse = {
  readonly status: SubscriptionStatus;
  readonly amountKrw: number;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly graceEndsAt: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly nextRetryAt: string | null;
  readonly policy: {
    readonly timing: "period_end";
    readonly proratedRefund: false;
    readonly statutoryExceptionsApply: true;
    readonly notice: string;
  };
};

export interface BillingHttpService {
  getSummary(input: { readonly workspaceId: string }): Promise<{
    readonly status: SubscriptionStatus;
    readonly amountKrw: number;
    readonly currentPeriodStart?: Date | null;
    readonly currentPeriodEnd?: Date | null;
    readonly graceEndsAt?: Date | null;
    readonly cancelAtPeriodEnd?: boolean;
    readonly nextRetryAt?: Date | null;
    readonly policy?: Awaited<ReturnType<BillingService["getSummary"]>>["policy"];
  }>;
  completeAuthorization(input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly authKey: string;
    readonly customerKey: string;
    readonly requestId: string;
    readonly idempotencyKey: string;
  }): Promise<BillingChargeResult | { readonly outcome: string; readonly account: unknown }>;
  retryPastDue(input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly requestId: string;
    readonly force?: boolean;
  }): Promise<BillingChargeResult | { readonly outcome: string; readonly account: unknown }>;
  cancelAtPeriodEnd(input: {
    readonly workspaceId: string;
    readonly actorUserId: string;
    readonly requestId: string;
  }): Promise<{
    readonly account: unknown;
    readonly effectiveAt: Date;
    readonly policy: BillingSummaryResponse["policy"];
  }>;
  handleWebhook(input: {
    readonly transmissionId: string;
    readonly event: TossBillingWebhook;
    readonly receivedAt: Date;
  }): Promise<Awaited<ReturnType<BillingService["handleWebhook"]>>>;
}

export interface BillingHttpHandlerOptions {
  readonly requireAuth: RequireAuth;
  readonly getService: () => BillingHttpService;
  readonly now?: () => Date;
}

const rejectTenantOverride = z
  .object({ workspaceId: z.never().optional() })
  .passthrough();

const authorizeBodySchema = rejectTenantOverride.extend({
  authKey: z.string().trim().min(1).max(300),
  customerKey: z.string().trim().min(1).max(300),
});

const emptyBodySchema = rejectTenantOverride;

const webhookBodySchema = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal("PAYMENT_STATUS_CHANGED"),
    createdAt: z.string().trim().min(1),
    data: z.object({
      orderId: z.string().trim().min(1).max(64),
      paymentKey: z.string().trim().min(1).max(200),
      status: z.string().trim().min(1).max(64),
    }),
  }),
  z.object({
    eventType: z.literal("BILLING_DELETED"),
    createdAt: z.string().trim().min(1),
    billingKey: z.string().trim().min(1).max(200),
    reason: z.string().max(500).nullish(),
  }),
]);

function requiredIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value || value !== value.trim()) {
    throw new ApiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key 헤더가 필요합니다.",
    );
  }
  if (value.length > 300) {
    throw new ApiError("BAD_REQUEST", "Idempotency-Key는 300자 이하여야 합니다.");
  }
  return value;
}

function requestIdFor(principal: BillingPrincipal, apiRequestId: string): string {
  return principal.requestId || apiRequestId;
}

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function serializeSummary(
  summary: Awaited<ReturnType<BillingHttpService["getSummary"]>>,
): BillingSummaryResponse {
  return {
    status: summary.status,
    amountKrw: summary.amountKrw,
    currentPeriodStart: iso(summary.currentPeriodStart),
    currentPeriodEnd: iso(summary.currentPeriodEnd),
    graceEndsAt: iso(summary.graceEndsAt),
    cancelAtPeriodEnd: summary.cancelAtPeriodEnd ?? summary.status === "cancel_at_period_end",
    nextRetryAt: iso(summary.nextRetryAt),
    policy:
      summary.policy ??
      {
        timing: "period_end",
        proratedRefund: false,
        statutoryExceptionsApply: true,
        notice: "일할 환불은 제공하지 않으며, 관련 법령상 필수 환불·철회 예외는 적용됩니다.",
      },
  };
}

function serializeResult<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  return value.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

async function parseBillingBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
  }
  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("BAD_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.hasOwn(body, "workspaceId")
  ) {
    throw new ApiError("BAD_REQUEST", "workspaceId는 인증된 세션에서만 결정됩니다.");
  }
  const result = await schema.safeParseAsync(body);
  if (!result.success) {
    throw new ApiError("VALIDATION_ERROR", undefined, {
      fields: zodErrorFields(result.error),
    });
  }
  return result.data;
}

async function api<T>(
  request: Request,
  operation: (apiRequestId: string) => Promise<{ readonly data: T; readonly requestId?: string }>,
): Promise<Response> {
  const apiRequestId = resolveRequestId(request);
  try {
    const result = await operation(apiRequestId);
    return successResponse(
      { data: result.data, status: 200 },
      result.requestId ?? apiRequestId,
    );
  } catch (error) {
    return errorResponse(error instanceof ApiError ? error : new ApiError("INTERNAL"), apiRequestId);
  }
}

export function createBillingHttpHandlers(options: BillingHttpHandlerOptions) {
  return {
    summary: (request: Request) => api(request, async (apiContextRequestId) => {
      const principal = await options.requireAuth(request, {
        csrf: false,
        roles: ["owner", "admin", "member"],
      });
      const summary = await options.getService().getSummary({
        workspaceId: principal.workspaceId,
      });
      const requestId = requestIdFor(principal, apiContextRequestId);
      return { data: serializeSummary(summary), requestId };
    }),

    authorize: (request: Request) => api(request, async (apiContextRequestId) => {
      const idempotencyKey = requiredIdempotencyKey(request);
      const principal = await options.requireAuth(request, {
        csrf: true,
        roles: ["owner", "admin"],
      });
      const body = await parseBillingBody(request, authorizeBodySchema);
      const requestId = requestIdFor(principal, apiContextRequestId);
      const result = await options.getService().completeAuthorization({
        workspaceId: principal.workspaceId,
        actorUserId: principal.userId,
        authKey: body.authKey,
        customerKey: body.customerKey,
        requestId,
        idempotencyKey,
      });
      return { data: serializeResult(result), requestId };
    }),

    retry: (request: Request) => api(request, async (apiContextRequestId) => {
      requiredIdempotencyKey(request);
      const principal = await options.requireAuth(request, {
        csrf: true,
        roles: ["owner", "admin"],
      });
      await parseBillingBody(request, emptyBodySchema);
      const requestId = requestIdFor(principal, apiContextRequestId);
      const result = await options.getService().retryPastDue({
        workspaceId: principal.workspaceId,
        actorUserId: principal.userId,
        requestId,
        force: true,
      });
      return { data: serializeResult(result), requestId };
    }),

    cancel: (request: Request) => api(request, async (apiContextRequestId) => {
      requiredIdempotencyKey(request);
      const principal = await options.requireAuth(request, {
        csrf: true,
        roles: ["owner", "admin"],
      });
      await parseBillingBody(request, emptyBodySchema);
      const requestId = requestIdFor(principal, apiContextRequestId);
      const result = await options.getService().cancelAtPeriodEnd({
        workspaceId: principal.workspaceId,
        actorUserId: principal.userId,
        requestId,
      });
      return { data: serializeResult(result), requestId };
    }),

    webhook: (request: Request) =>
      api(request, async () => {
        const transmissionId = request.headers.get("tosspayments-webhook-transmission-id");
        if (!transmissionId || transmissionId !== transmissionId.trim()) {
          throw new ApiError("BAD_REQUEST", "Toss transmission id가 필요합니다.");
        }
        const event = await parseBillingBody(request, webhookBodySchema);
        const result = await options.getService().handleWebhook({
          transmissionId,
          event,
          receivedAt: options.now?.() ?? new Date(),
        });
        return { data: serializeResult(result) };
      }),
  };
}
