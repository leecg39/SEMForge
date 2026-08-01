import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { folders } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const PROBE_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 4;

export interface DomainValidationResult {
  normalizedDomain: string;
  reachable: boolean;
  resolvedAddresses: string[];
  duplicateProjects: { id: string; name: string; domain: string }[];
  reason: string | null;
}

export function normalizeDomainInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ApiError("VALIDATION_ERROR", "도메인을 입력하세요.", {
      fields: { domain: "도메인을 입력하세요." },
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "올바른 도메인 형식이 아닙니다.", {
      fields: { domain: "예: example.com 또는 blog.example.com" },
    });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ApiError("VALIDATION_ERROR", "HTTP(S) 도메인만 입력할 수 있습니다.", {
      fields: { domain: "HTTP(S) 도메인만 입력할 수 있습니다." },
    });
  }
  if (parsed.port) {
    throw new ApiError("VALIDATION_ERROR", "포트가 포함된 주소는 지원하지 않습니다.", {
      fields: { domain: "포트를 제거하고 도메인만 입력하세요." },
    });
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new ApiError("VALIDATION_ERROR", "하위 폴더나 쿼리가 포함된 주소는 지원하지 않습니다.", {
      fields: { domain: "하위 경로를 제거하고 도메인 또는 서브도메인만 입력하세요." },
    });
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(hostname) || !DOMAIN_PATTERN.test(hostname)) {
    throw new ApiError("VALIDATION_ERROR", "올바른 공개 도메인을 입력하세요.", {
      fields: { domain: "예: example.com 또는 blog.example.com" },
    });
  }
  return hostname;
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const parts = ipv4Parts(address);
    if (!parts) return false;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    if (normalized.startsWith("ff")) return false;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isPublicAddress(mapped);
    }
    return true;
  }
  return false;
}

async function resolvePublicHost(hostname: string): Promise<string[]> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ApiError("VALIDATION_ERROR", "존재하지 않거나 DNS를 확인할 수 없는 도메인입니다.", {
      fields: { domain: "도메인 철자를 확인해 주세요." },
    });
  }
  const values = [...new Set(addresses.map((item) => item.address))];
  if (values.length === 0 || values.some((address) => !isPublicAddress(address))) {
    throw new ApiError("VALIDATION_ERROR", "공개 인터넷 도메인만 진단할 수 있습니다.", {
      fields: { domain: "로컬·사설·예약 주소는 보안상 사용할 수 없습니다." },
    });
  }
  return values;
}

async function probe(start: URL): Promise<{ url: string; addresses: string[] }> {
  let current = start;
  const allAddresses = new Set<string>();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    for (const address of await resolvePublicHost(current.hostname)) allAddresses.add(address);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "SEMForgeDomainValidator/1.0" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { url: current.toString(), addresses: [...allAddresses] };
      const next = new URL(location, current);
      if (!['http:', 'https:'].includes(next.protocol)) {
        throw new ApiError("VALIDATION_ERROR", "웹사이트가 지원하지 않는 주소로 이동합니다.");
      }
      current = next;
      continue;
    }
    return { url: current.toString(), addresses: [...allAddresses] };
  }
  throw new ApiError("VALIDATION_ERROR", "웹사이트 리다이렉트가 너무 많습니다.");
}

export async function validatePublicDomain(
  auth: AuthContext,
  raw: string
): Promise<DomainValidationResult> {
  const normalizedDomain = normalizeDomainInput(raw);
  let probeResult: { url: string; addresses: string[] } | null = null;
  let reason: string | null = null;
  for (const protocol of ["https:", "http:"] as const) {
    try {
      probeResult = await probe(new URL(`${protocol}//${normalizedDomain}`));
      break;
    } catch (error) {
      if (error instanceof ApiError && error.fields) throw error;
      reason = error instanceof Error ? error.message : String(error);
    }
  }
  if (!probeResult) {
    throw new ApiError("VALIDATION_ERROR", "도메인에 연결할 수 없습니다.", {
      fields: { domain: reason ?? "웹사이트가 공개적으로 접속 가능한지 확인해 주세요." },
    });
  }
  const duplicateProjects = await db
    .select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders)
    .where(
      and(
        eq(folders.workspaceId, auth.workspaceId),
        eq(folders.domain, normalizedDomain),
        isNull(folders.deletedAt)
      )
    );
  return {
    normalizedDomain,
    reachable: true,
    resolvedAddresses: probeResult.addresses,
    duplicateProjects,
    reason,
  };
}
