import { ApiError } from "@/lib/api";

const AUTHORIZATION_ENDPOINT = "https://www.bing.com/webmasters/oauth/authorize";
const TOKEN_ENDPOINT = "https://www.bing.com/webmasters/oauth/token";
const REFRESH_ENDPOINT = "https://www.bing.com/webmasters/token";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/bing-webmaster/callback";
const REQUEST_TIMEOUT_MS = 30_000;
export const BING_WEBMASTER_SCOPE = "webmaster.read";

export interface BingOauthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface BingTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiryMs?: number;
}

export function getBingOauthConfig(): BingOauthConfig | null {
  const clientId = process.env.BING_WEBMASTER_CLIENT_ID?.trim();
  const clientSecret = process.env.BING_WEBMASTER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.BING_WEBMASTER_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI,
  };
}

export function buildBingAuthorizationUrl(config: BingOauthConfig, state: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", BING_WEBMASTER_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(endpoint: string, body: URLSearchParams, fetchImpl: typeof fetch): Promise<BingTokenSet> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("INTERNAL", controller.signal.aborted
      ? "Bing 인증 서버 응답이 시간 초과되었습니다."
      : "Bing 인증 서버에 연결하지 못했습니다.");
  } finally {
    clearTimeout(timeout);
  }
  let payload: Record<string, unknown> = {};
  try {
    const raw: unknown = await response.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) payload = raw as Record<string, unknown>;
  } catch {
    throw new ApiError("INTERNAL", "Bing 인증 서버가 올바른 응답을 반환하지 않았습니다.");
  }
  if (!response.ok || typeof payload.access_token !== "string") {
    const code = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    if (code === "invalid_grant") throw new ApiError("UNAUTHENTICATED", "Bing 연결이 만료되었습니다. 다시 연결해 주세요.");
    throw new ApiError("INTERNAL", "Bing 토큰을 발급하지 못했습니다.", { details: { providerReason: code } });
  }
  return {
    accessToken: payload.access_token,
    ...(typeof payload.refresh_token === "string" ? { refreshToken: payload.refresh_token } : {}),
    ...(typeof payload.expires_in === "number" ? { expiryMs: Date.now() + payload.expires_in * 1000 } : {}),
  };
}

export function exchangeBingCode(code: string, config: BingOauthConfig, fetchImpl: typeof fetch = fetch): Promise<BingTokenSet> {
  return tokenRequest(TOKEN_ENDPOINT, new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  }), fetchImpl);
}

export function refreshBingAccessToken(refreshToken: string, config: BingOauthConfig, fetchImpl: typeof fetch = fetch): Promise<BingTokenSet> {
  return tokenRequest(REFRESH_ENDPOINT, new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }), fetchImpl);
}
