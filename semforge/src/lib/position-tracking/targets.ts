export type TrackingTargetType = "root_domain" | "subdomain" | "exact_url" | "subfolder";

const MULTI_LEVEL_PUBLIC_SUFFIXES = new Set([
  "co.kr", "or.kr", "ne.kr", "go.kr", "ac.kr",
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "co.jp", "ne.jp", "or.jp",
]);

function inputUrl(value: string): URL {
  const trimmed = value.trim();
  return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
}

export function normalizeHostname(value: string): string {
  try {
    return inputUrl(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function registrableDomain(value: string): string {
  const hostname = normalizeHostname(value);
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) return hostname;
  const suffix2 = labels.slice(-2).join(".");
  return MULTI_LEVEL_PUBLIC_SUFFIXES.has(suffix2)
    ? labels.slice(-3).join(".")
    : labels.slice(-2).join(".");
}

function normalizePath(pathname: string): string {
  const decoded = decodeURI(pathname || "/").replace(/\/{2,}/g, "/");
  if (decoded === "/") return "/";
  return decoded.replace(/\/+$/, "");
}

export function normalizeTrackingTarget(type: TrackingTargetType, value: string): string {
  const url = inputUrl(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".")) throw new Error("유효한 도메인 또는 URL을 입력해 주세요.");
  if (type === "root_domain") return registrableDomain(hostname);
  if (type === "subdomain") return hostname;
  const pathname = normalizePath(url.pathname);
  return `https://${hostname}${pathname}`;
}

export function trackingTargetBelongsToDomain(
  type: TrackingTargetType,
  targetValue: string,
  projectDomain: string
): boolean {
  const projectRoot = registrableDomain(projectDomain);
  const targetHost = type === "root_domain" || type === "subdomain"
    ? normalizeHostname(targetValue)
    : normalizeHostname(targetValue);
  return targetHost === projectRoot || targetHost.endsWith(`.${projectRoot}`);
}

export function matchesTrackingTarget(
  candidateUrl: string,
  type: TrackingTargetType,
  targetValue: string
): boolean {
  let candidate: URL;
  try {
    candidate = inputUrl(candidateUrl);
  } catch {
    return false;
  }
  const candidateHost = candidate.hostname.toLowerCase().replace(/\.$/, "");
  if (type === "root_domain") {
    const targetRoot = registrableDomain(targetValue);
    return candidateHost === targetRoot || candidateHost.endsWith(`.${targetRoot}`);
  }
  if (type === "subdomain") {
    const targetHost = normalizeHostname(targetValue);
    return candidateHost === targetHost || candidateHost.endsWith(`.${targetHost}`);
  }
  let target: URL;
  try {
    target = inputUrl(targetValue);
  } catch {
    return false;
  }
  if (candidateHost !== target.hostname.toLowerCase()) return false;
  const candidatePath = normalizePath(candidate.pathname);
  const targetPath = normalizePath(target.pathname);
  if (type === "exact_url") return candidatePath === targetPath;
  return candidatePath === targetPath || candidatePath.startsWith(`${targetPath}/`);
}
