// @TASK P2-S1-T1 - Canonical site domain and SSRF-safe registration boundary
// @SPEC docs/planning/06-tasks.md#p2-s1-t1--사이트와-추적-항목-api
// @TEST src/server/sites/domain.test.ts
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

const DISALLOWED_SUFFIXES = [
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localhost",
  ".test",
] as const;

export class SiteDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteDomainError";
  }
}

function invalidDomain(message = "사이트 도메인이 올바르지 않습니다."): never {
  throw new SiteDomainError(message);
}

function ipv4ToInteger(address: string): number {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => value * 256 + octet, 0) >>> 0;
}

function inIpv4Cidr(address: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === (ipv4ToInteger(base) & mask) >>> 0;
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToInteger(address);
  const blocked = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const;
  return !blocked.some(([base, prefix]) => inIpv4Cidr(value, base, prefix));
}

function expandIpv6(address: string): bigint | null {
  let source = address.toLowerCase();
  const ipv4Match = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const ipv4 = ipv4Match[1]!;
    if (isIP(ipv4) !== 4) return null;
    const value = ipv4ToInteger(ipv4);
    source = `${source.slice(0, -ipv4.length)}${(value >>> 16).toString(16)}:${(
      value & 0xffff
    ).toString(16)}`;
  }

  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }
  return groups.reduce(
    (value, group) => (value << BigInt(16)) | BigInt(`0x${group}`),
    BigInt(0),
  );
}

function hasIpv6Prefix(value: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return value >> shift === base >> shift;
}

function isPublicIpv6(address: string): boolean {
  const value = expandIpv6(address);
  if (value === null) return false;

  const mappedIpv4Base = BigInt(0xffff) << BigInt(32);
  if (hasIpv6Prefix(value, mappedIpv4Base, 96)) {
    const ipv4 = Number(value & BigInt(0xffffffff));
    return isPublicIpv4(
      [24, 16, 8, 0].map((shift) => String((ipv4 >>> shift) & 0xff)).join("."),
    );
  }

  // 공개 웹 사이트 등록은 global-unicast(2000::/3)만 허용한다.
  if (!hasIpv6Prefix(value, BigInt("0x20000000000000000000000000000000"), 3)) return false;
  if (hasIpv6Prefix(value, BigInt("0x20010db8000000000000000000000000"), 32)) return false;
  if (hasIpv6Prefix(value, BigInt("0x20010002000000000000000000000000"), 48)) return false;
  return true;
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

export function normalizeSiteDomain(input: string): string {
  const value = input.trim();
  if (!value) invalidDomain();

  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return invalidDomain();
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    return invalidDomain();
  }

  const ascii = domainToASCII(url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, ""))
    .toLowerCase();
  if (!ascii || ascii.length > 253 || isIP(ascii) !== 0) return invalidDomain();

  const labels = ascii.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    ) ||
    /^\d+$/.test(labels.at(-1) ?? "") ||
    DISALLOWED_SUFFIXES.some(
      (suffix) => ascii === suffix.slice(1) || ascii.endsWith(suffix),
    )
  ) {
    return invalidDomain();
  }
  return ascii;
}

export type DomainAddressResolver = (domain: string) => Promise<readonly string[]>;

export async function resolveDomainAddresses(domain: string): Promise<readonly string[]> {
  const [ipv4, ipv6] = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
  return [
    ...(ipv4.status === "fulfilled" ? ipv4.value : []),
    ...(ipv6.status === "fulfilled" ? ipv6.value : []),
  ];
}

export async function assertPublicSiteDomain(
  domain: string,
  resolver: DomainAddressResolver = resolveDomainAddresses,
): Promise<void> {
  const normalized = normalizeSiteDomain(domain);
  const addresses = [...new Set(await resolver(normalized))];
  if (addresses.length === 0) {
    throw new SiteDomainError("사이트 도메인의 DNS 주소를 확인할 수 없습니다.");
  }
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new SiteDomainError("사이트 도메인은 공개 주소만 사용할 수 있습니다.");
  }
}
