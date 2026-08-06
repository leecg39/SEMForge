import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export type PublicKeywordIdentityType = "cookie" | "ip_prefix";

export interface PublicKeywordUsageRow {
  identityType: PublicKeywordIdentityType;
  identityHash: string;
  keywordHash: string;
  firstSeenAt: Date;
  expiresAt: Date;
}

export interface PublicKeywordUsageRepository {
  cleanup(expiredBefore: Date): Promise<void>;
  list(identityHash: string, since: Date): Promise<PublicKeywordUsageRow[]>;
  record(row: PublicKeywordUsageRow): Promise<void>;
  consumeAtomically?(input: PublicKeywordAtomicInput): Promise<PublicKeywordAtomicResult>;
}

export interface PublicKeywordAtomicIdentity {
  type: PublicKeywordIdentityType;
  hash: string;
  limit: number;
}

export interface PublicKeywordAtomicInput {
  identities: PublicKeywordAtomicIdentity[];
  keywordHash: string;
  now: Date;
  since: Date;
  expiresAt: Date;
  windowMs: number;
}

export type PublicKeywordAtomicResult =
  | {
    allowed: true;
    states: Array<{ type: PublicKeywordIdentityType; duplicate: boolean; count: number }>;
  }
  | {
    allowed: false;
    scope: PublicKeywordIdentityType;
    retryAfterSeconds: number;
  };

export class PublicKeywordRateLimitError extends Error {
  constructor(
    readonly scope: PublicKeywordIdentityType,
    readonly retryAfterSeconds: number,
  ) {
    super("무료 검색 한도를 모두 사용했습니다.");
    this.name = "PublicKeywordRateLimitError";
  }
}

interface PublicKeywordRateLimiterOptions {
  secret: string;
  cookieLimit?: number;
  ipPrefixLimit?: number;
  windowMs?: number;
  retentionMs?: number;
}

export interface PublicKeywordRateLimitResult {
  duplicate: boolean;
  cookieRemaining: number;
  ipPrefixRemaining: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 48 * 60 * 60 * 1_000;

function ipv4Prefix(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return `${numbers[0]}.${numbers[1]}.${numbers[2]}.0/24`;
}

function expandIpv6(value: string): string[] | null {
  let address = value;
  const dottedIndex = address.lastIndexOf(":");
  const dottedTail = dottedIndex >= 0 ? address.slice(dottedIndex + 1) : "";
  if (dottedTail.includes(".")) {
    const parts = dottedTail.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null;
    }
    address = `${address.slice(0, dottedIndex)}:${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/iu.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16).toString(16).padStart(4, "0"));
}

export function normalizeIpPrefix(ip: string | null): string {
  if (!ip) return "unknown";
  const value = ip.trim().toLowerCase();
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u);
  if (mapped) return ipv4Prefix(mapped[1]) ?? "unknown";
  const version = isIP(value);
  if (version === 4) return ipv4Prefix(value) ?? "unknown";
  if (version !== 6) return "unknown";
  const expanded = expandIpv6(value);
  if (!expanded) return "unknown";
  return `${expanded.slice(0, 4).join(":")}::/64`;
}

export class PublicKeywordRateLimiter {
  private readonly cookieLimit: number;
  private readonly ipPrefixLimit: number;
  private readonly windowMs: number;
  private readonly retentionMs: number;

  constructor(
    private readonly repository: PublicKeywordUsageRepository,
    private readonly options: PublicKeywordRateLimiterOptions,
  ) {
    this.cookieLimit = options.cookieLimit ?? 3;
    this.ipPrefixLimit = options.ipPrefixLimit ?? 30;
    this.windowMs = options.windowMs ?? DAY_MS;
    this.retentionMs = options.retentionMs ?? RETENTION_MS;
  }

  private hash(kind: string, value: string): string {
    return createHmac("sha256", this.options.secret).update(`${kind}:${value}`).digest("hex");
  }

  async consume(input: {
    cookieId: string;
    ip: string | null;
    keyword: string;
    now?: Date;
  }): Promise<PublicKeywordRateLimitResult> {
    const now = input.now ?? new Date();
    const since = new Date(now.getTime() - this.windowMs);
    const expiresAt = new Date(now.getTime() + this.retentionMs);
    await this.repository.cleanup(now);

    const keywordHash = this.hash("keyword", input.keyword.toLocaleLowerCase("ko-KR"));
    const identities = [
      {
        type: "cookie" as const,
        hash: this.hash("cookie", input.cookieId),
        limit: this.cookieLimit,
      },
      {
        type: "ip_prefix" as const,
        hash: this.hash("ip_prefix", normalizeIpPrefix(input.ip)),
        limit: this.ipPrefixLimit,
      },
    ];

    if (this.repository.consumeAtomically) {
      const reserved = await this.repository.consumeAtomically({
        identities,
        keywordHash,
        now,
        since,
        expiresAt,
        windowMs: this.windowMs,
      });
      if (!reserved.allowed) {
        throw new PublicKeywordRateLimitError(reserved.scope, reserved.retryAfterSeconds);
      }
      const cookie = reserved.states.find((state) => state.type === "cookie")!;
      const ip = reserved.states.find((state) => state.type === "ip_prefix")!;
      return {
        duplicate: cookie.duplicate,
        cookieRemaining: Math.max(0, this.cookieLimit - cookie.count),
        ipPrefixRemaining: Math.max(0, this.ipPrefixLimit - ip.count),
      };
    }

    const states = await Promise.all(identities.map(async (identity) => {
      const rows = await this.repository.list(identity.hash, since);
      const duplicate = rows.some((row) => row.keywordHash === keywordHash);
      if (!duplicate && rows.length >= identity.limit) {
        const oldest = rows.reduce((value, row) =>
          row.firstSeenAt < value ? row.firstSeenAt : value, rows[0].firstSeenAt);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldest.getTime() + this.windowMs - now.getTime()) / 1_000),
        );
        throw new PublicKeywordRateLimitError(identity.type, retryAfterSeconds);
      }
      return { identity, rows, duplicate };
    }));

    await Promise.all(states.filter((state) => !state.duplicate).map((state) =>
      this.repository.record({
        identityType: state.identity.type,
        identityHash: state.identity.hash,
        keywordHash,
        firstSeenAt: now,
        expiresAt,
      })));

    const cookie = states[0];
    const ip = states[1];
    return {
      duplicate: cookie.duplicate,
      cookieRemaining: Math.max(0, this.cookieLimit - cookie.rows.length - (cookie.duplicate ? 0 : 1)),
      ipPrefixRemaining: Math.max(0, this.ipPrefixLimit - ip.rows.length - (ip.duplicate ? 0 : 1)),
    };
  }
}
