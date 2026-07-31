import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { ApiError } from "@/lib/api";
import {
  assessAiCrawlerAccess,
  type AiCrawlerAccessAssessment,
} from "@/server/ai-visibility/crawler-access";
import {
  assessLlmsTxt,
  type LlmsTxtAssessment,
} from "@/server/ai-visibility/llms-txt";

/** 진단 파일 하나가 사용할 수 있는 최대 응답 크기. */
export const DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES = 256_000;
export const DOMAIN_DIAGNOSTIC_TIMEOUT_MS = 10_000;
export const DOMAIN_DIAGNOSTIC_MAX_REDIRECTS = 3;
export const DOMAIN_DIAGNOSTIC_USER_AGENT =
  "SEMForge-AI-Visibility-Diagnostic/1.0 (+https://semforge.local/ai-seo/)";

export interface DiagnosticTarget {
  readonly domain: string;
  readonly origin: string;
}

export type DomainResourceStatus = "fetched" | "not-found" | "error";
export type DomainResourceErrorCode =
  | "unsafe-url"
  | "dns"
  | "timeout"
  | "network"
  | "http-error"
  | "too-large"
  | "too-many-redirects";

export interface DomainResourceDiagnostic<T> {
  /** 최초 요청 URL */
  readonly url: string;
  /** 리다이렉트 검증을 통과한 마지막 URL */
  readonly finalUrl: string;
  readonly status: DomainResourceStatus;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly bytes: number;
  readonly redirectCount: number;
  readonly errorCode: DomainResourceErrorCode | null;
  readonly error: string | null;
  /** 수집 실패 시 null로 두어 기본 허용이나 0점으로 오인하지 않게 한다. */
  readonly assessment: T | null;
}

export interface AiVisibilityDomainDiagnostic {
  readonly domain: string;
  readonly origin: string;
  readonly checkedAt: string;
  readonly robotsTxt: DomainResourceDiagnostic<AiCrawlerAccessAssessment>;
  readonly llmsTxt: DomainResourceDiagnostic<LlmsTxtAssessment>;
}

export interface DomainDiagnosticDependencies {
  readonly fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  readonly resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  readonly now?: () => Date;
}

interface FetchedTextResource {
  readonly url: string;
  readonly finalUrl: string;
  readonly status: Exclude<DomainResourceStatus, "error">;
  readonly httpStatus: number;
  readonly contentType: string | null;
  readonly bytes: number;
  readonly redirectCount: number;
  readonly body: string | null;
}

interface FetchErrorContext {
  readonly finalUrl: string;
  readonly httpStatus?: number | null;
  readonly contentType?: string | null;
  readonly redirectCount?: number;
}

class ResourceFetchError extends Error {
  readonly code: DomainResourceErrorCode;
  readonly context: FetchErrorContext;

  constructor(
    code: DomainResourceErrorCode,
    message: string,
    context: FetchErrorContext,
  ) {
    super(message);
    this.name = "ResourceFetchError";
    this.code = code;
    this.context = context;
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RESERVED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".test",
  ".invalid",
];

function validationError(message: string): ApiError {
  return new ApiError("VALIDATION_ERROR", message, {
    fields: { domain: "예: example.com 또는 https://example.com" },
  });
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4(address: string): readonly number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  return octets.every(
    (octet, index) =>
      /^\d{1,3}$/.test(parts[index] ?? "") &&
      Number.isInteger(octet) &&
      octet >= 0 &&
      octet <= 255,
  )
    ? octets
    : null;
}

function isPublicIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b] = octets;

  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 224 || a > 224) return false;
  return true;
}

function parseIpv6(address: string): readonly number[] | null {
  let normalized = stripIpv6Brackets(address).toLowerCase();
  if (normalized.includes("%")) return null;

  const ipv4Tail = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized)?.[1];
  if (ipv4Tail) {
    const octets = parseIpv4(ipv4Tail);
    if (!octets) return null;
    const replacement = `${((octets[0] ?? 0) << 8 | (octets[1] ?? 0)).toString(16)}:${((octets[2] ?? 0) << 8 | (octets[3] ?? 0)).toString(16)}`;
    normalized = normalized.slice(0, -ipv4Tail.length) + replacement;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  const parts = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

function isPublicIpv6(address: string): boolean {
  const words = parseIpv6(address);
  if (!words) return false;
  const first = words[0] ?? 0;
  const allZeroBeforeIpv4 = words.slice(0, 6).every((word) => word === 0);
  const mappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;

  if (words.every((word) => word === 0)) return false;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return false;
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && words[1] === 0x0db8) return false; // 문서용 주소
  if (first === 0x0064 && words[1] === 0xff9b) return false; // NAT64 우회 방지

  if (mappedIpv4 || allZeroBeforeIpv4) {
    const ipv4 = `${(words[6] ?? 0) >> 8}.${(words[6] ?? 0) & 0xff}.${(words[7] ?? 0) >> 8}.${(words[7] ?? 0) & 0xff}`;
    return isPublicIpv4(ipv4);
  }
  return true;
}

function isPublicIpAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address);
  const version = isIP(normalized);
  if (version === 4) return isPublicIpv4(normalized);
  if (version === 6) return isPublicIpv6(normalized);
  return false;
}

function isReservedHostname(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "metadata.google.internal" ||
    RESERVED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function formatUrlHostname(hostname: string): string {
  return isIP(hostname) === 6 ? `[${hostname}]` : hostname;
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function responseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.append(name, value);
    }
  }
  return result;
}

/** 검증한 IP에 직접 연결하고 Host/SNI는 원래 도메인을 유지해 DNS 재바인딩을 막는다. */
function requestPinnedAddress(
  url: string,
  address: string,
  init: RequestInit,
): Promise<Response> {
  const parsed = new URL(url);
  const originalHostname = stripIpv6Brackets(parsed.hostname);
  const headers = new Headers(init.headers);
  headers.set("host", parsed.host);
  const request = parsed.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(abortError());
      return;
    }

    let settled = false;
    const outgoing = request(
      {
        protocol: parsed.protocol,
        hostname: address,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? "GET",
        headers: Object.fromEntries(headers.entries()),
        ...(parsed.protocol === "https:" && isIP(originalHostname) === 0
          ? { servername: originalHostname }
          : {}),
      },
      (incoming) => {
        settled = true;
        const status = incoming.statusCode ?? 500;
        const hasBody = status !== 204 && status !== 205 && status !== 304;
        const body = hasBody
          ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
          : null;
        if (!hasBody) incoming.resume();
        resolve(
          new Response(body, {
            status,
            statusText: incoming.statusMessage,
            headers: responseHeaders(incoming.headers),
          }),
        );
      },
    );

    const onAbort = () => outgoing.destroy(abortError());
    init.signal?.addEventListener("abort", onAbort, { once: true });
    outgoing.once("close", () => init.signal?.removeEventListener("abort", onAbort));
    outgoing.once("error", (error) => {
      if (!settled) reject(error);
    });
    outgoing.end();
  });
}

function createPinnedFetcher(
  resolver: (hostname: string) => Promise<readonly string[]>,
): NonNullable<DomainDiagnosticDependencies["fetcher"]> {
  return async (url, init) => {
    const hostname = stripIpv6Brackets(new URL(url).hostname);
    const addresses = isIP(hostname) > 0 ? [hostname] : await resolver(hostname);
    let lastError: unknown = new Error("연결할 공개 IP가 없습니다.");

    for (const address of addresses) {
      try {
        return await requestPinnedAddress(url, address, init);
      } catch (error) {
        lastError = error;
        if (init.signal?.aborted) throw error;
      }
    }
    throw lastError;
  };
}

/** API 입력을 루트 origin으로 제한해 어떤 두 파일을 읽는지 모호하지 않게 한다. */
export function normalizeDiagnosticTarget(input: string): DiagnosticTarget {
  const raw = input.trim();
  if (!raw) throw validationError("진단할 도메인이 필요합니다.");

  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw validationError("유효한 도메인을 입력해 주세요.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationError("http 또는 https 도메인만 진단할 수 있습니다.");
  }
  if (parsed.username || parsed.password) {
    throw validationError("자격증명이 포함된 주소는 진단할 수 없습니다.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw validationError("페이지 경로 없이 도메인만 입력해 주세요.");
  }
  if (parsed.port) {
    throw validationError("표준 HTTP/HTTPS 포트의 도메인만 진단할 수 있습니다.");
  }

  const domain = stripIpv6Brackets(parsed.hostname).toLowerCase().replace(/\.$/, "");
  if (!domain || domain.length > 253 || isReservedHostname(domain)) {
    throw validationError("공개 인터넷 도메인을 입력해 주세요.");
  }
  if (isIP(domain) > 0 && !isPublicIpAddress(domain)) {
    throw validationError("내부 네트워크 주소는 진단할 수 없습니다.");
  }
  if (isIP(domain) === 0 && !domain.includes(".")) {
    throw validationError("공개 인터넷 도메인을 입력해 주세요.");
  }

  return {
    domain,
    origin: `${parsed.protocol}//${formatUrlHostname(domain)}`,
  };
}

function parseResourceUrl(value: string, context: FetchErrorContext): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ResourceFetchError("unsafe-url", "올바르지 않은 리다이렉트 주소입니다.", context);
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    isReservedHostname(parsed.hostname)
  ) {
    throw new ResourceFetchError(
      "unsafe-url",
      "안전하지 않은 외부 주소로는 요청을 보낼 수 없습니다.",
      context,
    );
  }
  const hostname = stripIpv6Brackets(parsed.hostname);
  if (isIP(hostname) > 0 && !isPublicIpAddress(hostname)) {
    throw new ResourceFetchError(
      "unsafe-url",
      "내부 네트워크 주소로는 요청을 보낼 수 없습니다.",
      context,
    );
  }
  return parsed;
}

async function assertPublicResolution(
  url: URL,
  resolver: (hostname: string) => Promise<readonly string[]>,
  context: FetchErrorContext,
): Promise<void> {
  const hostname = stripIpv6Brackets(url.hostname);
  if (isIP(hostname) > 0) return;

  let addresses: readonly string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new ResourceFetchError("dns", "도메인의 DNS 주소를 확인하지 못했습니다.", context);
  }
  if (addresses.length === 0) {
    throw new ResourceFetchError("dns", "도메인에 연결된 DNS 주소가 없습니다.", context);
  }
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new ResourceFetchError(
      "unsafe-url",
      "도메인이 내부 또는 예약 네트워크 주소를 가리켜 요청을 차단했습니다.",
      context,
    );
  }
}

async function readCappedText(response: Response, context: FetchErrorContext) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResourceFetchError(
      "too-large",
      `응답이 ${DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES}바이트 제한을 초과합니다.`,
      context,
    );
  }

  if (!response.body) return { body: await response.text(), bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ResourceFetchError(
          "too-large",
          `응답이 ${DOMAIN_DIAGNOSTIC_MAX_TEXT_BYTES}바이트 제한을 초과합니다.`,
          context,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    body: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    bytes: received,
  };
}

async function fetchTextResource(
  url: string,
  dependencies: Required<Pick<DomainDiagnosticDependencies, "fetcher" | "resolveHostname">>,
): Promise<FetchedTextResource> {
  const startedAt = Date.now();
  let currentUrl = url;
  let redirectCount = 0;

  for (;;) {
    const context: FetchErrorContext = { finalUrl: currentUrl, redirectCount };
    const parsed = parseResourceUrl(currentUrl, context);
    await assertPublicResolution(parsed, dependencies.resolveHostname, context);

    const remaining = DOMAIN_DIAGNOSTIC_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      throw new ResourceFetchError("timeout", "외부 파일 요청 시간이 초과되었습니다.", context);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, remaining);

    try {
      const response = await dependencies.fetcher(currentUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "user-agent": DOMAIN_DIAGNOSTIC_USER_AGENT,
          accept: "text/plain,text/markdown;q=0.9,*/*;q=0.1",
        },
      });

      const responseContext: FetchErrorContext = {
        finalUrl: currentUrl,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        redirectCount,
      };
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw new ResourceFetchError(
            "http-error",
            `HTTP ${response.status} 응답에 이동할 주소가 없습니다.`,
            responseContext,
          );
        }
        if (redirectCount >= DOMAIN_DIAGNOSTIC_MAX_REDIRECTS) {
          throw new ResourceFetchError(
            "too-many-redirects",
            "허용된 리다이렉트 횟수를 초과했습니다.",
            responseContext,
          );
        }
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          throw new ResourceFetchError(
            "unsafe-url",
            "올바르지 않은 리다이렉트 주소입니다.",
            responseContext,
          );
        }
        redirectCount += 1;
        continue;
      }

      const contentType = response.headers.get("content-type");
      if (response.status === 404 || response.status === 410) {
        await response.body?.cancel().catch(() => undefined);
        return {
          url,
          finalUrl: currentUrl,
          status: "not-found",
          httpStatus: response.status,
          contentType,
          bytes: 0,
          redirectCount,
          body: null,
        };
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel().catch(() => undefined);
        throw new ResourceFetchError(
          "http-error",
          `외부 파일이 HTTP ${response.status} 응답을 반환했습니다.`,
          responseContext,
        );
      }

      const { body, bytes } = await readCappedText(response, responseContext);
      return {
        url,
        finalUrl: currentUrl,
        status: "fetched",
        httpStatus: response.status,
        contentType,
        bytes,
        redirectCount,
        body,
      };
    } catch (error) {
      if (error instanceof ResourceFetchError) throw error;
      const timeout = timedOut || (error instanceof Error && error.name === "AbortError");
      throw new ResourceFetchError(
        timeout ? "timeout" : "network",
        timeout
          ? "외부 파일 요청 시간이 초과되었습니다."
          : "외부 파일을 가져오지 못했습니다.",
        context,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function errorDiagnostic<T>(url: string, error: unknown): DomainResourceDiagnostic<T> {
  const fetchError =
    error instanceof ResourceFetchError
      ? error
      : new ResourceFetchError("network", "외부 파일을 가져오지 못했습니다.", {
          finalUrl: url,
        });
  return {
    url,
    finalUrl: fetchError.context.finalUrl,
    status: "error",
    httpStatus: fetchError.context.httpStatus ?? null,
    contentType: fetchError.context.contentType ?? null,
    bytes: 0,
    redirectCount: fetchError.context.redirectCount ?? 0,
    errorCode: fetchError.code,
    error: fetchError.message,
    assessment: null,
  };
}

async function diagnoseRobotsTxt(
  url: string,
  dependencies: Required<Pick<DomainDiagnosticDependencies, "fetcher" | "resolveHostname">>,
): Promise<DomainResourceDiagnostic<AiCrawlerAccessAssessment>> {
  try {
    const resource = await fetchTextResource(url, dependencies);
    const { body, ...metadata } = resource;
    return {
      ...metadata,
      errorCode: null,
      error: null,
      assessment: assessAiCrawlerAccess(resource.status === "not-found" ? "404" : body ?? ""),
    };
  } catch (error) {
    return errorDiagnostic(url, error);
  }
}

async function diagnoseLlmsTxt(
  url: string,
  dependencies: Required<Pick<DomainDiagnosticDependencies, "fetcher" | "resolveHostname">>,
): Promise<DomainResourceDiagnostic<LlmsTxtAssessment>> {
  try {
    const resource = await fetchTextResource(url, dependencies);
    const { body, ...metadata } = resource;
    return {
      ...metadata,
      errorCode: null,
      error: null,
      assessment: resource.status === "not-found" ? null : assessLlmsTxt(body ?? ""),
    };
  } catch (error) {
    return errorDiagnostic(url, error);
  }
}

/** 실제 도메인의 robots.txt와 llms.txt를 안전하게 가져와 Phase 0 진단을 실행한다. */
export async function diagnoseAiVisibilityDomain(
  input: string,
  dependencies: DomainDiagnosticDependencies = {},
): Promise<AiVisibilityDomainDiagnostic> {
  const target = normalizeDiagnosticTarget(input);
  const baseResolver =
    dependencies.resolveHostname ??
    (async (hostname: string) =>
      (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address));
  const resolutionCache = new Map<string, Promise<readonly string[]>>();
  const resolveHostname = (hostname: string) => {
    const key = hostname.toLowerCase();
    const cached = resolutionCache.get(key);
    if (cached) return cached;
    const pending = baseResolver(hostname);
    resolutionCache.set(key, pending);
    return pending;
  };
  const networkDependencies = {
    fetcher: dependencies.fetcher ?? createPinnedFetcher(resolveHostname),
    resolveHostname,
  };
  const [robotsTxt, llmsTxt] = await Promise.all([
    diagnoseRobotsTxt(`${target.origin}/robots.txt`, networkDependencies),
    diagnoseLlmsTxt(`${target.origin}/llms.txt`, networkDependencies),
  ]);

  return {
    ...target,
    checkedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    robotsTxt,
    llmsTxt,
  };
}
