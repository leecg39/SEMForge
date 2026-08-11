// @TASK P2-A1-T1 - Framework-light session cookie boundary
// @SPEC user-approved-plan#인증과-GSC

export const SESSION_COOKIE_NAME = "semforge_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1_000;

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
  readonly expires: Date;
}

export interface SessionCookieReader {
  get(name: string): { readonly value: string } | undefined;
}

function defaultProductionMode(): boolean {
  return process.env.NODE_ENV === "production";
}

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Session cookie date must be valid.");
  }
}

/** Next cookies().set에도 그대로 전달할 수 있는 테스트 가능한 순수 옵션 함수다. */
export function sessionCookieOptions(
  now: Date = new Date(),
  production: boolean = defaultProductionMode(),
): SessionCookieOptions {
  assertValidDate(now);
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: new Date(now.getTime() + SESSION_TTL_MS),
  };
}

/** 로그아웃 시 사용할 즉시 만료 옵션이다. */
export function sessionDeletionCookieOptions(
  production: boolean = defaultProductionMode(),
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export const createSessionCookieOptions = sessionCookieOptions;
export const createSessionDeletionCookieOptions = sessionDeletionCookieOptions;

function normalizedSessionToken(value: string): string | null {
  if (value.length === 0 || value.length > 512) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

/** 표준 Request Cookie 헤더를 파싱한다. 중복 이름은 cookie tossing 방지를 위해 거부한다. */
export function readSessionTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;

  const values: string[] = [];
  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex < 0) continue;

    const name = pair.slice(0, separatorIndex).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const encodedValue = pair.slice(separatorIndex + 1).trim();
    try {
      values.push(decodeURIComponent(encodedValue));
    } catch {
      return null;
    }
  }

  if (values.length !== 1) return null;
  return normalizedSessionToken(values[0] ?? "");
}

export function readSessionTokenFromRequest(request: Request): string | null {
  return readSessionTokenFromCookieHeader(request.headers.get("cookie"));
}

/** Next 16의 비동기 cookies() 반환값을 직접 await하는 얇은 어댑터다. */
export async function readSessionTokenFromCookieStore(
  cookieStore: SessionCookieReader | PromiseLike<SessionCookieReader>,
): Promise<string | null> {
  const store = await cookieStore;
  return normalizedSessionToken(store.get(SESSION_COOKIE_NAME)?.value ?? "");
}

function serializeSessionCookie(
  value: string,
  options: SessionCookieOptions,
): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `Expires=${options.expires.toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

/** Response 생성자의 headers에 넣을 표준 Set-Cookie 값이다. */
export function sessionCookieHeader(
  token: string,
  now: Date = new Date(),
  production: boolean = defaultProductionMode(),
): string {
  const normalized = normalizedSessionToken(token);
  if (!normalized) throw new TypeError("Session token is invalid.");
  return serializeSessionCookie(normalized, sessionCookieOptions(now, production));
}

/** Response 생성자의 headers에 넣을 세션 삭제 Set-Cookie 값이다. */
export function sessionDeletionCookieHeader(
  production: boolean = defaultProductionMode(),
): string {
  return serializeSessionCookie("", sessionDeletionCookieOptions(production));
}
