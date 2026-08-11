"use client";

// @TASK P1-F1-T1 - Real API loading/error/empty/partial boundary
// @SPEC SEMForge paid beta plan#api-envelope
// @TEST src/components/core-shell/core-shell.test.ts
import { useCallback, useEffect, useState } from "react";
import { StatusPanel, type DataStatus } from "./status-panel";

type ApiError = { code?: string; message?: string };
export type ApiEnvelope = {
  data?: unknown;
  error?: ApiError | null;
  requestId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function classifyApiEnvelope(envelope: ApiEnvelope): Exclude<DataStatus, "loading"> {
  if (envelope.error) return "error";
  if (envelope.data === null || envelope.data === undefined) return "empty";
  if (isRecord(envelope.data)) {
    if (envelope.data.partial === true) return "partial";
    if (Array.isArray(envelope.data.items) && envelope.data.items.length === 0) return "empty";
  }
  return "ready";
}

function malformedEnvelope(resourceLabel: string, requestId?: string): ApiEnvelope {
  return {
    data: null,
    error: {
      code: "MALFORMED_RESPONSE",
      message: `${resourceLabel} 응답 형식을 확인하지 못했습니다.`,
    },
    requestId,
  };
}

export async function readApiEnvelope(response: Response, resourceLabel: string): Promise<ApiEnvelope> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const headerRequestId = response.headers.get("x-request-id") ?? undefined;
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    return malformedEnvelope(resourceLabel, headerRequestId);
  }

  const payload = await response.json().catch(() => null);
  if (!isRecord(payload) || (!("data" in payload) && !("error" in payload))) {
    return malformedEnvelope(resourceLabel, headerRequestId);
  }

  const errorValue = payload.error;
  const error = isRecord(errorValue)
    ? {
        code: typeof errorValue.code === "string" ? errorValue.code : undefined,
        message: typeof errorValue.message === "string" ? errorValue.message : undefined,
      }
    : null;

  return {
    data: payload.data,
    error,
    requestId: typeof payload.requestId === "string" ? payload.requestId : headerRequestId,
  };
}

export function DataEndpointBoundary({
  endpoint,
  resourceLabel,
  emptyTitle,
  emptyDescription,
}: {
  endpoint: `/api/v1/${string}`;
  resourceLabel: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [requestId, setRequestId] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setStatus("loading");
    setErrorMessage(undefined);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const envelope = await readApiEnvelope(response, resourceLabel);
        setRequestId(envelope.requestId);
        if (!response.ok && !envelope.error) {
          envelope.error = { message: `${resourceLabel} 요청을 처리하지 못했습니다.` };
        }
        const nextStatus = classifyApiEnvelope(envelope);
        setStatus(nextStatus);
        setErrorMessage(envelope.error?.message);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
        setErrorMessage(`${resourceLabel} 데이터를 불러오지 못했습니다.`);
      });

    return () => controller.abort();
  }, [attempt, endpoint, resourceLabel]);

  return (
    <div data-endpoint={endpoint}>
      <StatusPanel
        status={status}
        title={status === "empty" ? emptyTitle : status === "error" ? errorMessage : undefined}
        description={status === "empty" ? emptyDescription : undefined}
        detail={requestId ? `요청 ID: ${requestId}` : undefined}
        action={status === "error" ? (
          <button className="sf-button sf-button--secondary" type="button" onClick={reload}>
            다시 시도
          </button>
        ) : undefined}
      />
    </div>
  );
}
