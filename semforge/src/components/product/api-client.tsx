"use client";

// @TASK P4-F1-T1 - Typed browser API v1 state and mutation boundary
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { useCallback, useEffect, useState } from "react";

import type { ApiEnvelope } from "./contracts";

export type ResourceState<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T; readonly requestId: string }
  | { readonly status: "error"; readonly message: string; readonly requestId?: string };

type Parser<T> = (value: unknown) => T | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function envelopeFrom(response: Response): Promise<ApiEnvelope<unknown> | null> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.requestId !== "string") return null;
  if (payload.error === null && "data" in payload) {
    return { data: payload.data, error: null, requestId: payload.requestId };
  }
  if (payload.data === null && isRecord(payload.error)) {
    const fields = isRecord(payload.error.fields)
      ? Object.fromEntries(
          Object.entries(payload.error.fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : undefined;
    return {
      data: null,
      error: {
        code: typeof payload.error.code === "string" ? payload.error.code : undefined,
        message: typeof payload.error.message === "string" ? payload.error.message : undefined,
        ...(fields ? { fields } : {}),
      },
      requestId: payload.requestId,
    };
  }
  return null;
}

function requestError(message: string, requestId?: string) {
  return Object.assign(new Error(message), { requestId });
}

const TENANT_OVERRIDE_KEYS = new Set([
  "workspaceId",
  "workspace_id",
  "tenantId",
  "tenant_id",
  "userId",
  "user_id",
]);

function assertNoTenantOverride(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoTenantOverride(item, seen));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (TENANT_OVERRIDE_KEYS.has(key)) {
      throw new Error("인증으로 결정되는 tenant 식별자는 요청 본문에서 지정할 수 없습니다.");
    }
    assertNoTenantOverride(item, seen);
  }
}

export async function requestApi<T>(
  endpoint: `/api/v1/${string}`,
  parser: Parser<T>,
  init: RequestInit = {},
): Promise<{ readonly data: T; readonly requestId: string }> {
  const response = await fetch(endpoint, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...init.headers },
    cache: "no-store",
  });
  const envelope = await envelopeFrom(response);
  const headerRequestId = response.headers.get("x-request-id") ?? undefined;
  if (!envelope) throw requestError("API 응답 형식을 확인하지 못했습니다.", headerRequestId);
  if (!response.ok || envelope.error) {
    throw requestError(envelope.error?.message ?? "요청을 처리하지 못했습니다.", envelope.requestId);
  }
  const parsed = parser(envelope.data);
  if (!parsed) throw requestError("API 응답 계약이 예상 형식과 다릅니다.", envelope.requestId);
  return { data: parsed, requestId: envelope.requestId };
}

export async function loadApiResource<T>(
  endpoint: `/api/v1/${string}`,
  parser: Parser<T>,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ResourceState<T>> {
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const envelope = await envelopeFrom(response);
    const requestId = envelope?.requestId ?? response.headers.get("x-request-id") ?? undefined;
    if (!envelope) {
      return { status: "error", message: "API 응답 형식을 확인하지 못했습니다.", ...(requestId ? { requestId } : {}) };
    }
    if (!response.ok || envelope.error) {
      return {
        status: "error",
        message: envelope.error?.message ?? "요청을 처리하지 못했습니다.",
        requestId: envelope.requestId,
      };
    }
    const parsed = parser(envelope.data);
    return parsed
      ? { status: "ready", data: parsed, requestId: envelope.requestId }
      : { status: "error", message: "API 응답 계약이 예상 형식과 다릅니다.", requestId: envelope.requestId };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { status: "error", message: "데이터를 불러오지 못했습니다." };
  }
}

export function useApiResource<T>(
  endpoint: `/api/v1/${string}`,
  parser: Parser<T>,
) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadApiResource(endpoint, parser, controller.signal)
      .then(setState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "데이터를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [attempt, endpoint, parser]);

  return { state, reload } as const;
}

export async function mutateApi<T>(
  endpoint: `/api/v1/${string}`,
  method: "POST" | "PATCH" | "DELETE",
  body: Readonly<Record<string, unknown>>,
  parser: Parser<T>,
): Promise<{ readonly data: T; readonly requestId: string }> {
  assertNoTenantOverride(body);
  return requestApi(endpoint, parser, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": globalThis.crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}
