// @TASK P3-C2-T1 - Google Search Console Search Analytics adapter
// @SPEC docs/planning/06-tasks.md#p3-c2-t1--naver와-gsc-주간-수집
// @TEST src/server/collectors/gsc/client.contract.test.ts

const SEARCH_ANALYTICS_BASE_URL = "https://www.googleapis.com/webmasters/v3/sites";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ROW_LIMIT = 25_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export type GscSearchDimension = "date" | "query" | "page";

export interface GscSearchAnalyticsRequest {
  readonly startDate: string;
  readonly endDate: string;
  readonly dimensions: readonly GscSearchDimension[];
  readonly rowLimit: number;
}

export interface GscSearchAnalyticsRow {
  readonly dimensions: Readonly<Record<string, string>>;
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number;
  readonly position: number;
}

export class GscSearchAnalyticsError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "UNAUTHORIZED"
      | "RATE_LIMITED"
      | "INVALID_RESPONSE"
      | "UPSTREAM",
  ) {
    super(code);
    this.name = "GscSearchAnalyticsError";
  }
}

export interface GscSearchAnalyticsClient {
  query(
    accessToken: string,
    propertyUri: string,
    request: GscSearchAnalyticsRequest,
  ): Promise<GscSearchAnalyticsRow[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertRequest(request: GscSearchAnalyticsRequest): void {
  if (
    !isCalendarDate(request.startDate) ||
    !isCalendarDate(request.endDate) ||
    request.startDate > request.endDate ||
    request.dimensions.length === 0 ||
    new Set(request.dimensions).size !== request.dimensions.length ||
    !request.dimensions.every((dimension) =>
      dimension === "date" || dimension === "query" || dimension === "page"
    ) ||
    !Number.isInteger(request.rowLimit) ||
    request.rowLimit < 1 ||
    request.rowLimit > MAX_ROW_LIMIT
  ) {
    throw new GscSearchAnalyticsError("INVALID_REQUEST");
  }
}

function metric(
  row: Record<string, unknown>,
  key: "clicks" | "impressions" | "ctr" | "position",
): number {
  const value = row[key];
  const valid = typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (!valid) throw new GscSearchAnalyticsError("INVALID_RESPONSE");
  if ((key === "clicks" || key === "impressions") && !Number.isInteger(value)) {
    throw new GscSearchAnalyticsError("INVALID_RESPONSE");
  }
  if (key === "ctr" && value > 1) {
    throw new GscSearchAnalyticsError("INVALID_RESPONSE");
  }
  return value;
}

function normalizeRows(
  payload: unknown,
  dimensions: readonly GscSearchDimension[],
): GscSearchAnalyticsRow[] {
  if (!isRecord(payload)) throw new GscSearchAnalyticsError("INVALID_RESPONSE");
  if (payload.rows === undefined) return [];
  if (!Array.isArray(payload.rows)) throw new GscSearchAnalyticsError("INVALID_RESPONSE");

  return payload.rows.map((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.keys)) {
      throw new GscSearchAnalyticsError("INVALID_RESPONSE");
    }
    const keys = candidate.keys;
    if (
      keys.length !== dimensions.length ||
      !keys.every((key) => typeof key === "string" && key.length > 0)
    ) {
      throw new GscSearchAnalyticsError("INVALID_RESPONSE");
    }
    const normalizedKeys = keys as string[];
    const dateIndex = dimensions.indexOf("date");
    if (dateIndex >= 0 && !isCalendarDate(normalizedKeys[dateIndex]!)) {
      throw new GscSearchAnalyticsError("INVALID_RESPONSE");
    }
    return {
      dimensions: Object.fromEntries(
        dimensions.map((dimension, index) => [dimension, normalizedKeys[index]!]),
      ),
      clicks: metric(candidate, "clicks"),
      impressions: metric(candidate, "impressions"),
      ctr: metric(candidate, "ctr"),
      position: metric(candidate, "position"),
    };
  });
}

function mapHttpStatus(status: number): never {
  if (status === 401 || status === 403) throw new GscSearchAnalyticsError("UNAUTHORIZED");
  if (status === 429) throw new GscSearchAnalyticsError("RATE_LIMITED");
  throw new GscSearchAnalyticsError("UPSTREAM");
}

export function createGscSearchAnalyticsClient(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): GscSearchAnalyticsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async query(accessToken, propertyUri, request) {
      assertRequest(request);
      if (!accessToken || !propertyUri || timeoutMs <= 0) {
        throw new GscSearchAnalyticsError("INVALID_REQUEST");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(
          `${SEARCH_ANALYTICS_BASE_URL}/${encodeURIComponent(propertyUri)}/searchAnalytics/query`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(request),
            signal: controller.signal,
            cache: "no-store",
          },
        );
      } catch {
        throw new GscSearchAnalyticsError("UPSTREAM");
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) mapHttpStatus(response.status);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new GscSearchAnalyticsError("INVALID_RESPONSE");
      }
      return normalizeRows(payload, request.dimensions);
    },
  };
}
