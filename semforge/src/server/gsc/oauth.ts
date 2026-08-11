import { createHash, randomBytes } from "node:crypto";

import { ApiError } from "@/lib/api-v1";

/**
 * Google OAuth 2.0 (Search Console 연동용).
 * 문서: https://developers.google.com/identity/protocols/oauth2/web-server
 *   인증 URL: https://accounts.google.com/o/oauth2/v2/auth
 *   토큰 교환/갱신: POST https://oauth2.googleapis.com/token (form-urlencoded)
 * scope 는 읽기 전용(webmasters.readonly)만 요청한다.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/v1/integrations/gsc/callback";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const ALLOWED_RETURN_PATHS = [
  /^\/app$/,
  /^\/app\/settings$/,
  /^\/app\/sites$/,
  /^\/app\/sites\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
] as const;

export interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** env 가 갖춰지지 않으면 null 을 반환한다. 호출부는 이를 unavailable 로 처리한다. */
export function getGscOAuthConfig(): GscOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GSC_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI,
  };
}

export function buildGscAuthorizationUrl(
  config: GscOAuthConfig,
  state?: string
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GSC_SCOPE);
  // refresh_token 을 받으려면 offline access 와 consent 강제가 필요하다.
  // select_account: 다른 계정으로 재연결할 수 있게 항상 계정 선택기를 띄운다
  // (세션이 하나뿐이면 Google 이 계정 선택을 건너뛰어 같은 계정으로만 이어지는 문제 방지).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function newOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthState(rawState: string): string {
  return createHash("sha256").update(rawState, "utf8").digest("hex");
}

export function safeGscReturnPath(input: string | null | undefined): string {
  if (!input) return "/app/settings";
  if (!input.startsWith("/") || input.startsWith("//")) return "/app/settings";
  let path: string;
  try {
    const url = new URL(input, "https://semforge.local");
    if (url.origin !== "https://semforge.local") return "/app/settings";
    path = `${url.pathname}${url.search}`;
  } catch {
    return "/app/settings";
  }
  const pathname = path.split("?", 1)[0] ?? "";
  if (ALLOWED_RETURN_PATHS.some((pattern) => pattern.test(pathname))) return path;
  return "/app/settings";
}

export interface GscTokenSet {
  accessToken: string;
  /** authorization code 교환 시에만 내려온다. 갱신 응답에는 없을 수 있다. */
  refreshToken?: string;
  /** expires_in 을 절대 시각(ms epoch)으로 환산한 값 */
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
): Promise<GscTokenSet> {
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
      { cause: error }
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
        "Google 연동 인증이 만료되었거나 취소되었습니다. Search Console 연결을 다시 진행해 주세요."
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
export function exchangeGscCode(
  code: string,
  config: GscOAuthConfig,
  options?: { fetchImpl?: typeof fetch }
): Promise<GscTokenSet> {
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
export function refreshGscAccessToken(
  refreshToken: string,
  config: GscOAuthConfig,
  options?: { fetchImpl?: typeof fetch }
): Promise<GscTokenSet> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  return postTokenRequest(body, options?.fetchImpl ?? fetch);
}
