import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { gscConnections, type GscConnectionRow } from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptionConfigured,
} from "@/lib/crypto";
import { newId } from "@/lib/ids";
import {
  getGscOAuthConfig,
  refreshGscAccessToken,
  type GscOAuthConfig,
} from "@/server/gsc/oauth";

/**
 * Google Search Console API 클라이언트.
 * 문서: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 *   POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
 * 연결 정보는 gsc_connections 테이블(로컬 단일 연결 모델)에 보관하고,
 * 액세스 토큰이 만료되면 refresh_token 으로 갱신한 뒤 DB 를 함께 갱신한다.
 *
 * 참고: webmasters.readonly scope 만으로는 구글 계정 이메일을 조회할 수 없어
 * user_email 은 확인 가능한 경우에만 채운다 (없으면 null).
 */

const API_BASE = "https://www.googleapis.com/webmasters/v3";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** 만료 60초 전부터는 갱신 대상으로 본다. */
const EXPIRY_REFRESH_BUFFER_MS = 60_000;
const MAX_ROW_LIMIT = 5_000;

export interface GscConnection {
  id: string;
  userEmail: string | null;
  siteUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiryMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 저장 행 → 연결 객체. 토큰은 복호화해 돌려준다.
 * 복호화 실패(APP_SECRET 변경 등)는 null — 호출부는 "미연결"로 다뤄 재연결을 유도한다.
 */
function toConnection(row: GscConnectionRow): GscConnection | null {
  const accessToken = decryptSecret(row.accessToken);
  if (accessToken === null) return null;
  const refreshToken = row.refreshToken === null ? null : decryptSecret(row.refreshToken);
  if (row.refreshToken !== null && refreshToken === null) return null;
  return {
    id: row.id,
    userEmail: row.userEmail,
    siteUrl: row.siteUrl,
    accessToken,
    refreshToken,
    expiryMs: row.expiry,
    createdAtMs: row.createdAt,
    updatedAtMs: row.updatedAt,
  };
}

/** gsc_connections 마이그레이션 미적용 여부. 라우트가 unavailable 로 정직하게 환산한다. */
export function isGscStorageMissing(error: unknown): boolean {
  return (
    error instanceof Error && /no such table:\s*gsc_connections/i.test(error.message)
  );
}

/** 평문 시절 행을 발견하면 암호화해 다시 저장한다 (lazy 재암호화, 베스트 에포트). */
function reencryptIfPlaintext(row: GscConnectionRow): void {
  if (!isEncryptionConfigured()) return;
  if (isEncrypted(row.accessToken) && (row.refreshToken === null || isEncrypted(row.refreshToken))) {
    return;
  }
  try {
    db.update(gscConnections)
      .set({
        accessToken: isEncrypted(row.accessToken)
          ? row.accessToken
          : encryptSecret(row.accessToken),
        refreshToken:
          row.refreshToken === null || isEncrypted(row.refreshToken)
            ? row.refreshToken
            : encryptSecret(row.refreshToken),
        updatedAt: Date.now(),
      })
      .where(eq(gscConnections.id, row.id))
      .run();
  } catch (error) {
    console.warn("[gsc] 토큰 재암호화 실패 (다음 조회에서 재시도)", error);
  }
}

/** 저장된 Search Console 연결 1건. 연결된 적이 없거나 복호화 불가면 null. */
export function getGscConnection(): GscConnection | null {
  const [row] = db
    .select()
    .from(gscConnections)
    .orderBy(asc(gscConnections.createdAt))
    .limit(1)
    .all();
  if (!row) return null;
  reencryptIfPlaintext(row);
  return toConnection(row);
}

/**
 * 연결을 저장한다. 로컬 단일 사용자 도구이므로 기존 행을 모두 지우고
 * 최신 연결 1건만 유지한다.
 */
export function saveGscConnection(input: {
  userEmail?: string | null;
  siteUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiryMs?: number | null;
}): GscConnection {
  const id = newId("gsc");
  db.delete(gscConnections).run();
  db.insert(gscConnections)
    .values({
      id,
      userEmail: input.userEmail ?? null,
      siteUrl: input.siteUrl ?? null,
      accessToken: encryptSecret(input.accessToken),
      refreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      expiry: input.expiryMs ?? null,
    })
    .run();
  const saved = getGscConnection();
  if (!saved) {
    throw new ApiError("INTERNAL", "Search Console 연결 정보를 저장하지 못했습니다.");
  }
  return saved;
}

export function deleteGscConnection(): void {
  db.delete(gscConnections).run();
}

function updateConnectionTokens(
  id: string,
  tokens: { accessToken: string; expiryMs?: number }
): void {
  db.update(gscConnections)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      expiry: tokens.expiryMs ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(gscConnections.id, id))
    .run();
}

async function fetchGoogleApi(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    throw new ApiError(
      "INTERNAL",
      controller.signal.aborted
        ? "Google Search Console 응답이 시간 초과되었습니다. 잠시 후 다시 시도해 주세요."
        : "Google Search Console 에 연결하지 못했습니다.",
      { details: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response, fetchUrl: string): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("INTERNAL", "Google Search Console 이 올바른 JSON 응답을 반환하지 않았습니다.");
  }
  if (!isRecord(payload)) {
    throw new ApiError(
      "INTERNAL",
      `Google Search Console 이 객체 형태의 JSON 응답을 반환하지 않았습니다. (${fetchUrl})`
    );
  }
  return payload;
}

function googleApiErrorMessage(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (isRecord(error)) {
    const message = error.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }
  return "알 수 없는 Google API 오류";
}

export interface GscClientOptions {
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

/** 만료 임박 시 refresh_token 으로 갱신하고 DB 행도 함께 갱신한다. */
async function ensureFreshAccessToken(
  connection: GscConnection,
  config: GscOAuthConfig,
  options?: GscClientOptions
): Promise<GscConnection> {
  const expiresSoon =
    connection.expiryMs !== null &&
    connection.expiryMs <= Date.now() + EXPIRY_REFRESH_BUFFER_MS;
  if (!expiresSoon) return connection;
  if (!connection.refreshToken) {
    throw new ApiError(
      "UNAUTHENTICATED",
      "Google 연동 갱신 토큰이 없습니다. Search Console 연결을 다시 진행해 주세요."
    );
  }
  const refreshed = await refreshGscAccessToken(connection.refreshToken, config, {
    fetchImpl: options?.fetchImpl,
  });
  updateConnectionTokens(connection.id, {
    accessToken: refreshed.accessToken,
    expiryMs: refreshed.expiryMs,
  });
  return {
    ...connection,
    accessToken: refreshed.accessToken,
    expiryMs: refreshed.expiryMs ?? null,
  };
}

export interface GscSiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

/** 계정에 등록된 Search Console 속성 목록. 연결 직후 대표 속성을 고를 때 사용한다. */
export async function listGscSites(
  accessToken: string,
  options?: GscClientOptions
): Promise<GscSiteEntry[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const response = await fetchGoogleApi(
    `${API_BASE}/sites`,
    { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` } },
    fetchImpl,
    timeoutMs
  );
  const payload = await readJson(response, `${API_BASE}/sites`);
  if (!response.ok) {
    throw new ApiError(
      "INTERNAL",
      `Search Console 속성 목록 조회에 실패했습니다: ${googleApiErrorMessage(payload)}`
    );
  }
  const entries = Array.isArray(payload.siteEntry) ? payload.siteEntry : [];
  return entries
    .filter(isRecord)
    .map((entry) => ({
      siteUrl: typeof entry.siteUrl === "string" ? entry.siteUrl : "",
      permissionLevel:
        typeof entry.permissionLevel === "string" ? entry.permissionLevel : "",
    }))
    .filter((entry) => entry.siteUrl.length > 0);
}

export type GscDimension = "query" | "page" | "date" | "country" | "device";

export interface GscAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryInput {
  siteUrl: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  dimensions: GscDimension[];
  rowLimit?: number;
}

export interface GscQueryResult {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: GscDimension[];
  rows: GscAnalyticsRow[];
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * searchanalytics.query 래퍼. 토큰 만료 시 자동으로 갱신하고,
 * 갱신 후에도 401 이면 재연결 안내 오류를 던진다.
 */
export async function querySearchAnalytics(
  input: GscQueryInput,
  options?: GscClientOptions & { connection?: GscConnection }
): Promise<GscQueryResult> {
  const config = getGscOAuthConfig();
  if (!config) {
    throw new ApiError(
      "INTERNAL",
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET 이 설정되지 않았습니다. .env.local 에 OAuth 클라이언트 정보를 추가하세요."
    );
  }
  const connection = options?.connection ?? getGscConnection();
  if (!connection) {
    throw new ApiError(
      "UNAUTHENTICATED",
      "Google Search Console 이 연결되지 않았습니다. 먼저 계정을 연결해 주세요."
    );
  }

  const fresh = await ensureFreshAccessToken(connection, config, options);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const rowLimit = Math.min(
    MAX_ROW_LIMIT,
    Math.max(1, Math.floor(input.rowLimit ?? 50))
  );
  const endpoint = `${API_BASE}/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`;
  const requestBody = JSON.stringify({
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: input.dimensions,
    rowLimit,
  });

  let retriedAfter401 = false;
  let current = fresh;
  for (;;) {
    const response = await fetchGoogleApi(
      endpoint,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${current.accessToken}`,
        },
        body: requestBody,
      },
      fetchImpl,
      timeoutMs
    );
    const payload = await readJson(response, endpoint);

    if (response.ok) {
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      return {
        siteUrl: input.siteUrl,
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: input.dimensions,
        rows: rows.filter(isRecord).map((row) => ({
          keys: Array.isArray(row.keys)
            ? row.keys.filter((key): key is string => typeof key === "string")
            : [],
          clicks: toFiniteNumber(row.clicks),
          impressions: toFiniteNumber(row.impressions),
          ctr: toFiniteNumber(row.ctr),
          position: toFiniteNumber(row.position),
        })),
      };
    }

    const message = googleApiErrorMessage(payload);
    // 401 은 갱신 직후에도 실패한 것이거나 만료 시각 정보가 부정확한 경우다.
    // 한 번만 강제 갱신 후 재시도한다.
    if (response.status === 401 && !retriedAfter401 && current.refreshToken) {
      retriedAfter401 = true;
      const refreshed = await refreshGscAccessToken(current.refreshToken, config, {
        fetchImpl,
      });
      updateConnectionTokens(current.id, {
        accessToken: refreshed.accessToken,
        expiryMs: refreshed.expiryMs,
      });
      current = {
        ...current,
        accessToken: refreshed.accessToken,
        expiryMs: refreshed.expiryMs ?? null,
      };
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        "UNAUTHENTICATED",
        `Search Console 접근 권한이 없습니다. 속성 권한을 확인하거나 계정을 다시 연결해 주세요. (${message})`
      );
    }
    if (response.status === 429) {
      throw new ApiError(
        "RATE_LIMITED",
        "Search Console API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
    throw new ApiError("INTERNAL", `Search Console 조회에 실패했습니다: ${message}`);
  }
}
