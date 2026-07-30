import type { ApiErrorCode } from "@/lib/api";

/**
 * 클라이언트 fetch 래퍼.
 * next.config.ts 의 trailingSlash: true 때문에 모든 API 경로는 후행 슬래시로 호출해야 308 리다이렉트를 피할 수 있다.
 */

export class ClientApiError extends Error {
  code: ApiErrorCode;
  fields?: Record<string, string>;
  details?: unknown;
  status: number;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>,
    details?: unknown
  ) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

export interface ListMetaShape {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  q: string | null;
  sort: string;
  scope: "active" | "trashed" | "all";
  filters: Record<string, string[]>;
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; meta?: unknown }> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return { data: undefined as T };

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!response.ok) {
      throw new ClientApiError(
        response.status,
        "INTERNAL",
        "서버 응답을 처리할 수 없습니다."
      );
    }
    return { data: undefined as T };
  }

  const body = await response.json();
  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ClientApiError(
      response.status,
      error.code ?? "INTERNAL",
      error.message ?? "요청을 처리하지 못했습니다.",
      error.fields,
      error.details
    );
  }
  return body;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** 목록 화면의 상태를 그대로 쿼리스트링으로 직렬화한다. */
export function buildListQuery(params: {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  scope?: string;
  filters?: Record<string, string | undefined>;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.sort) search.set("sort", params.sort);
  if (params.scope && params.scope !== "active") search.set("scope", params.scope);
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
