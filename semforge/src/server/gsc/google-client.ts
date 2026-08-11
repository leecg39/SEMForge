// @TASK P2-G1-T1 - Google Search Console REST adapter
// @SPEC user-approved-plan#인증과-GSC
// @TEST src/server/gsc/google-client.contract.test.ts

const SEARCH_CONSOLE_SITES_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites";
const TOKEN_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface GscProperty {
  readonly siteUrl: string;
  readonly permissionLevel: string;
}

export interface GoogleSearchConsoleClient {
  listSites(accessToken: string): Promise<GscProperty[]>;
  revokeToken(token: string): Promise<void>;
}

interface GoogleSitesResponse {
  siteEntry?: Array<{
    siteUrl?: unknown;
    permissionLevel?: unknown;
  }>;
}

export class GoogleSearchConsoleError extends Error {
  constructor(
    readonly code: "UNAUTHORIZED" | "RATE_LIMITED" | "UPSTREAM",
    message: string = code,
  ) {
    super(message);
    this.name = "GoogleSearchConsoleError";
  }
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GoogleSearchConsoleError("UPSTREAM", "Google Search Console request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function mapStatus(response: Response): never {
  if (response.status === 401 || response.status === 403) {
    throw new GoogleSearchConsoleError("UNAUTHORIZED");
  }
  if (response.status === 429) {
    throw new GoogleSearchConsoleError("RATE_LIMITED");
  }
  throw new GoogleSearchConsoleError("UPSTREAM", `Google Search Console request failed with HTTP ${response.status}.`);
}

export function createGoogleSearchConsoleClient(
  options: { fetchImpl?: typeof fetch } = {},
): GoogleSearchConsoleClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listSites(accessToken: string): Promise<GscProperty[]> {
      return withTimeout(async (signal) => {
        const response = await fetchImpl(SEARCH_CONSOLE_SITES_ENDPOINT, {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          signal,
          cache: "no-store",
        });
        if (!response.ok) mapStatus(response);
        const payload = (await response.json()) as GoogleSitesResponse;
        return (payload.siteEntry ?? [])
          .filter(
            (entry): entry is { siteUrl: string; permissionLevel: string } =>
              typeof entry.siteUrl === "string" &&
              entry.siteUrl.length > 0 &&
              typeof entry.permissionLevel === "string" &&
              entry.permissionLevel.length > 0,
          )
          .map((entry) => ({
            siteUrl: entry.siteUrl,
            permissionLevel: entry.permissionLevel,
          }));
      });
    },

    async revokeToken(token: string): Promise<void> {
      await withTimeout(async (signal) => {
        const response = await fetchImpl(TOKEN_REVOKE_ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ token }).toString(),
          signal,
          cache: "no-store",
        });
        if (!response.ok) mapStatus(response);
      });
    },
  };
}
