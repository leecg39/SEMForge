"use client";

// @TASK P4-F1-T1 - Typed browser API v1 state and mutation boundary
// @SPEC docs/planning/06-tasks.md#p4-f1-t1--허용-페이지-전체-구현
// @TEST src/components/product/product-ui.test.tsx
import { useCallback, useEffect, useState } from "react";

import type { ApiEnvelope } from "./contracts";

export type ResourceState<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T; readonly requestId: string }
  | { readonly status: "unavailable"; readonly message: string; readonly requestId?: string }
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

export function useApiResource<T>(
  endpoint: `/api/v1/${string}`,
  parser: Parser<T>,
  options: {
    readonly unavailableStatuses?: readonly number[];
    readonly unavailableMessage?: string;
  } = {},
) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const unavailableKey = options.unavailableStatuses?.join(",") ?? "";
  const unavailableMessage = options.unavailableMessage;

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const envelope = await envelopeFrom(response);
        const requestId = envelope?.requestId ?? response.headers.get("x-request-id") ?? undefined;
        const unavailableStatuses = unavailableKey
          ? unavailableKey.split(",").map((value) => Number.parseInt(value, 10))
          : [];
        if (unavailableStatuses.includes(response.status)) {
          setState({
            status: "unavailable",
            message: unavailableMessage ?? "이 데이터의 읽기 API가 아직 제공되지 않습니다.",
            ...(requestId ? { requestId } : {}),
          });
          return;
        }
        if (!envelope) {
          setState({ status: "error", message: "API 응답 형식을 확인하지 못했습니다.", ...(requestId ? { requestId } : {}) });
          return;
        }
        if (!response.ok || envelope.error) {
          setState({
            status: "error",
            message: envelope.error?.message ?? "요청을 처리하지 못했습니다.",
            requestId: envelope.requestId,
          });
          return;
        }
        const parsed = parser(envelope.data);
        setState(parsed
          ? { status: "ready", data: parsed, requestId: envelope.requestId }
          : { status: "error", message: "API 응답 계약이 예상 형식과 다릅니다.", requestId: envelope.requestId });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "데이터를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [attempt, endpoint, parser, unavailableKey, unavailableMessage]);

  return { state, reload } as const;
}

export async function mutateApi<T>(
  endpoint: `/api/v1/${string}`,
  method: "POST" | "PATCH" | "DELETE",
  body: Readonly<Record<string, unknown>>,
  parser: Parser<T>,
): Promise<{ readonly data: T; readonly requestId: string }> {
  return requestApi(endpoint, parser, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": globalThis.crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}
