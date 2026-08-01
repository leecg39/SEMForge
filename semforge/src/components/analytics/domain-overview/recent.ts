/**
 * "마지막 확인" 도메인 목록.
 * 서버에는 도메인 조회 이력을 저장하지 않으므로(개인 이력) 브라우저 localStorage 에만 남긴다.
 * 랜딩에서는 useSyncExternalStore 로 읽어 SSR(빈 목록)과 하이드레이션이 어긋나지 않게 한다.
 */

const STORAGE_KEY = "semforge.domain-overview.recent";
const MAX_ENTRIES = 6;

export interface RecentDomainEntry {
  domain: string;
  country: string;
}

const EMPTY: RecentDomainEntry[] = [];

function parseEntries(raw: string | null): RecentDomainEntry[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const entries = parsed
      .filter(
        (item): item is RecentDomainEntry =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as RecentDomainEntry).domain === "string" &&
          typeof (item as RecentDomainEntry).country === "string",
      )
      .slice(0, MAX_ENTRIES);
    return entries.length > 0 ? entries : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// getSnapshot 은 값이 바뀌지 않는 한 같은 참조를 돌려줘야 하므로 raw 문자열 기준으로 캐시한다.
let snapshotCache: { raw: string | null; entries: RecentDomainEntry[] } = {
  raw: null,
  entries: EMPTY,
};

export function subscribeRecentDomains(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function getRecentDomainsSnapshot(): RecentDomainEntry[] {
  const raw = readRaw();
  if (snapshotCache.raw !== raw) {
    snapshotCache = { raw, entries: parseEntries(raw) };
  }
  return snapshotCache.entries;
}

export function getRecentDomainsServerSnapshot(): RecentDomainEntry[] {
  return EMPTY;
}

export function pushRecentDomain(entry: RecentDomainEntry): void {
  if (typeof window === "undefined" || !entry.domain) return;
  try {
    const next = [
      entry,
      ...parseEntries(readRaw()).filter((item) => item.domain !== entry.domain),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 조용히 무시한다 — 목록은 편의 기능일 뿐이다.
  }
}
