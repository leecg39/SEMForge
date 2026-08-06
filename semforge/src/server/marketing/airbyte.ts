import type { AirbytePort } from "./ports";

const DEFAULT_BASE_URL = "https://api.airbyte.com";

export function sanitizeProviderError(message: string): string {
  void message;
  return "외부 데이터 공급자 요청이 실패했습니다.";
}

export class AirbyteAdapterError extends Error {
  constructor(public readonly status: number, public readonly operation: string) {
    super(`Airbyte 요청을 처리하지 못했습니다. (${operation})`);
    this.name = "AirbyteAdapterError";
  }
}

export class AirbyteHttpAdapter implements AirbytePort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { token: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      throw new AirbyteAdapterError(response.status, `${init?.method ?? "GET"} ${path.split("?")[0]}`);
    }
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }

  createWorkspace(input: { name: string; organizationId: string }): Promise<{ workspaceId: string }> {
    return this.request("/v1/workspaces", { method: "POST", body: JSON.stringify(input) });
  }

  createSource(input: { workspaceId: string; name: string; configuration: Record<string, unknown>; secretId?: string }): Promise<{ sourceId: string }> {
    return this.request("/v1/sources", { method: "POST", body: JSON.stringify(input) });
  }

  setWorkspaceOAuthCredentials(input: {
    workspaceId: string;
    sourceType: string;
    configuration: Record<string, unknown>;
  }): Promise<void> {
    return this.request(`/v1/workspaces/${encodeURIComponent(input.workspaceId)}/oauthCredentials`, {
      method: "PUT",
      body: JSON.stringify({ actorType: "source", name: input.sourceType, configuration: input.configuration }),
    });
  }

  async initiateSourceOAuth(input: {
    workspaceId: string;
    sourceType: string;
    redirectUrl: string;
  }): Promise<{ redirectUrl: string }> {
    const result = await this.request<{ redirectUrl?: string; redirect_url?: string }>("/v1/sources/initiateOAuth", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const redirectUrl = result.redirectUrl ?? result.redirect_url;
    if (!redirectUrl) throw new AirbyteAdapterError(502, "POST /v1/sources/initiateOAuth");
    return { redirectUrl };
  }

  createDestination(input: { workspaceId: string; name: string; configuration: Record<string, unknown> }): Promise<{ destinationId: string }> {
    return this.request("/v1/destinations", { method: "POST", body: JSON.stringify(input) });
  }

  async createConnection(input: { sourceId: string; destinationId: string; name: string; namespace: string; streamNames: string[] }): Promise<{ connectionId: string }> {
    const params = new URLSearchParams({ sourceId: input.sourceId, destinationId: input.destinationId });
    const discovered = await this.request<Array<{
      streamName?: string;
      syncModes?: string[];
      defaultCursorField?: string[];
      sourceDefinedPrimaryKey?: string[][];
    }> | { data?: Array<{
      streamName?: string;
      syncModes?: string[];
      defaultCursorField?: string[];
      sourceDefinedPrimaryKey?: string[][];
    }> }>(`/v1/streams?${params}`);
    const streamProperties = Array.isArray(discovered) ? discovered : discovered.data ?? [];
    const requested = new Set(input.streamNames);
    const streams = streamProperties
      .filter((stream) => stream.streamName && requested.has(stream.streamName))
      .map((stream) => {
        if (!stream.syncModes?.includes("incremental_deduped_history")) {
          throw new AirbyteAdapterError(422, `stream ${stream.streamName ?? "unknown"} incremental deduped validation`);
        }
        return {
          name: stream.streamName as string,
          syncMode: "incremental_deduped_history",
          ...(stream.defaultCursorField?.length ? { cursorField: stream.defaultCursorField } : {}),
          ...(stream.sourceDefinedPrimaryKey?.length ? { primaryKey: stream.sourceDefinedPrimaryKey } : {}),
        };
      });
    if (streams.length === 0) throw new AirbyteAdapterError(422, "stream discovery");
    return this.request("/v1/connections", {
      method: "POST",
      body: JSON.stringify({
        sourceId: input.sourceId,
        destinationId: input.destinationId,
        name: input.name,
        configurations: { streams },
        namespaceDefinition: "custom_format",
        namespaceFormat: input.namespace,
        schedule: { scheduleType: "cron", cronExpression: "0 0 * * * ?" },
        nonBreakingSchemaUpdatesBehavior: "propagate_columns",
      }),
    });
  }

  triggerSync(connectionId: string): Promise<{ jobId: string | number; status: string }> {
    return this.request("/v1/jobs", { method: "POST", body: JSON.stringify({ connectionId, jobType: "sync" }) });
  }

  getJob(jobId: string | number): Promise<{ jobId: string | number; status: string; rowsSynced?: number }> {
    return this.request(`/v1/jobs/${encodeURIComponent(String(jobId))}`);
  }

  async listJobs(connectionId: string, limit = 10): Promise<Array<{ jobId: string | number; status: string; rowsSynced?: number }>> {
    const params = new URLSearchParams({ connectionId, jobType: "sync", limit: String(Math.min(Math.max(limit, 1), 100)), orderBy: "createdAt|DESC" });
    const result = await this.request<{ data?: Array<{ jobId: string | number; status: string; rowsSynced?: number }> }>(`/v1/jobs?${params}`);
    return result.data ?? [];
  }

  async hasActiveJob(connectionId: string): Promise<boolean> {
    const params = new URLSearchParams({ connectionId });
    const result = await this.request<{ data?: Array<{ status?: string }> }>(`/v1/jobs?${params}`);
    return (result.data ?? []).some((job) => ["running", "pending", "queued", "incomplete"].includes((job.status ?? "").toLowerCase()));
  }

  deleteConnection(connectionId: string): Promise<void> {
    return this.request(`/v1/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" });
  }

  deleteSource(sourceId: string): Promise<void> {
    return this.request(`/v1/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
  }

  deleteWorkspace(workspaceId: string): Promise<void> {
    return this.request(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
  }
}

export function airbyteFromEnv(): AirbyteHttpAdapter | null {
  const token = process.env.AIRBYTE_API_TOKEN?.trim();
  if (!token) return null;
  return new AirbyteHttpAdapter({ token });
}
