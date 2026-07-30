import { ApiError } from "@/lib/api";

/**
 * Google OAuth 2.0 (Business Profile 연동용).
 * GSC 커넥터와 같은 Google OAuth 클라이언트(GOOGLE_CLIENT_ID/SECRET)를 쓰되
 * scope 는 business.manage 로 별도 연결한다.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/gbp/callback";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface GbpOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** env 가 갖춰지지 않으면 null 을 반환한다. 호출부는 이를 unavailable 로 처리한다. */
export function getGbpOAuthConfig(): GbpOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GBP_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI,
  };
}

export function buildGbpAuthorizationUrl(config: GbpOAuthConfig, state?: string): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GBP_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export interface GbpTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiryMs?: number;
  scope?: string;
  tokenType?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function postTokenRequest(
  body: URLSearchParams,
  fetchImpl: typeof fetch
): Promise<GbpTokenSet> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "Google 인증 서버 응답이 시간 초과되었습니다. 잠시 후 다시 시도해 주세요."
        : "Google 인증 서버에 연결하지 못했습니다.",
      { details: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("INTERNAL", "Google 인증 서버가 올바른 JSON 응답을 반환하지 않았습니다.");
  }
  const token: GoogleTokenResponse = isRecord(payload) ? payload : {};

  if (!response.ok || token.error) {
    const description =
      typeof token.error_description === "string" && token.error_description.trim().length > 0
        ? token.error_description.trim()
        : typeof token.error === "string"
          ? token.error
          : `HTTP ${response.status}`;
    if (token.error === "invalid_grant") {
      throw new ApiError(
        "UNAUTHENTICATED",
        "Google 연동 인증이 만료되었거나 취소되었습니다. Business Profile 연결을 다시 진행해 주세요."
      );
    }
    throw new ApiError("INTERNAL", `Google 토큰 발급에 실패했습니다: ${description}`);
  }

  if (typeof token.access_token !== "string" || token.access_token.length === 0) {
    throw new ApiError("INTERNAL", "Google 인증 서버가 액세스 토큰을 반환하지 않았습니다.");
  }

  return {
    accessToken: token.access_token,
    ...(typeof token.refresh_token === "string" && token.refresh_token.length > 0
      ? { refreshToken: token.refresh_token }
      : {}),
    ...(typeof token.expires_in === "number" && Number.isFinite(token.expires_in)
      ? { expiryMs: Date.now() + token.expires_in * 1000 }
      : {}),
    ...(typeof token.scope === "string" ? { scope: token.scope } : {}),
    ...(typeof token.token_type === "string" ? { tokenType: token.token_type } : {}),
  };
}

/** authorization code 를 토큰으로 교환한다. 최초 1회만 refresh_token 이 내려온다. */
export function exchangeGbpCode(
  code: string,
  config: GbpOAuthConfig,
  options?: { fetchImpl?: typeof fetch }
): Promise<GbpTokenSet> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  return postTokenRequest(body, options?.fetchImpl ?? fetch);
}

/** refresh_token 으로 액세스 토큰을 갱신한다. */
export function refreshGbpAccessToken(
  refreshToken: string,
  config: GbpOAuthConfig,
  options?: { fetchImpl?: typeof fetch }
): Promise<GbpTokenSet> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  return postTokenRequest(body, options?.fetchImpl ?? fetch);
}
