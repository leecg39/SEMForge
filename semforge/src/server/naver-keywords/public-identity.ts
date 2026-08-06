// @TASK NAVER-KI-PUBLIC-01 - 공개 미리보기 익명 서명 쿠키
// @SPEC user-approved-plan#3-c-public-free-tool
// @TEST src/server/naver-keywords/public-identity.test.ts
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const NAVER_PREVIEW_COOKIE = "sf_naver_preview";
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export class PublicPreviewSecurityError extends Error {
  constructor() {
    super("공개 키워드 조회 보안 설정을 확인할 수 없습니다.");
    this.name = "PublicPreviewSecurityError";
  }
}

export function resolvePublicRateLimitSecret(
  env: Record<string, string | undefined> = process.env,
  nodeEnv = process.env.NODE_ENV,
  databasePath = process.env.DATABASE_PATH ?? "default",
): string {
  const configured = env.PUBLIC_RATE_LIMIT_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (nodeEnv === "production") throw new PublicPreviewSecurityError();

  // 로컬 개발에서만 프로젝트/DB별 결정적 키를 사용한다. production에는 절대 진입하지 않는다.
  return createHash("sha256")
    .update(`semforge-dev-public-preview:${process.cwd()}:${databasePath}`)
    .digest("hex");
}

function signature(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`anonymous:${id}`).digest("base64url");
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function validSignedValue(value: string, secret: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const received = value.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{20,64}$/u.test(id) || !received) return null;
  const expected = signature(id, secret);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return id;
}

export interface AnonymousIdentity {
  name: typeof NAVER_PREVIEW_COOKIE;
  id: string;
  value: string;
  isNew: boolean;
}

export function resolveAnonymousIdentity(
  cookieHeader: string | null,
  secret: string,
): AnonymousIdentity {
  const existing = parseCookie(cookieHeader, NAVER_PREVIEW_COOKIE);
  const verifiedId = existing ? validSignedValue(existing, secret) : null;
  const id = verifiedId ?? randomBytes(24).toString("base64url");
  return {
    name: NAVER_PREVIEW_COOKIE,
    id,
    value: `${id}.${signature(id, secret)}`,
    isNew: !verifiedId,
  };
}

export function serializeAnonymousIdentityCookie(
  identity: AnonymousIdentity,
  production = process.env.NODE_ENV === "production",
): string {
  return [
    `${identity.name}=${encodeURIComponent(identity.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    ...(production ? ["Secure"] : []),
  ].join("; ");
}
