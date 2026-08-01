/**
 * "최근 비교" 조합 목록.
 * 서버에는 비교 이력을 저장하지 않으므로(개인 이력) 브라우저 localStorage 에만 남긴다.
 * 도메인 개요의 recent.ts 와 같은 useSyncExternalStore 규약을 따른다.
 */

const STORAGE_KEY = "semforge.keyword-gap.recent";
const MAX_ENTRIES = 5;

export interface RecentGapEntry {
  /** `[scope:]value` 인코딩된 대상 — [0] = 나 */
  targets: string[];
  country: string;
}

const EMPTY: RecentGapEntry[] = [];

function parseEntries(raw: string | null): RecentGapEntry[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const entries = parsed
      .filter(
        (item): item is RecentGapEntry =>
          typeof item === "object" &&
          item !== null &&
          Array.isArray((item as RecentGapEntry).targets) &&
          (item as RecentGapEntry).targets.every((target) => typeof target === "string") &&
          (item as RecentGapEntry).targets.length >= 2 &&
          typeof (item as RecentGapEntry).country === "string",
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

let snapshotCache: { raw: string | null; entries: RecentGapEntry[] } = {
  raw: null,
  entries: EMPTY,
};

export function subscribeRecentGaps(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function getRecentGapsSnapshot(): RecentGapEntry[] {
  const raw = readRaw();
  if (snapshotCache.raw !== raw) {
    snapshotCache = { raw, entries: parseEntries(raw) };
  }
  return snapshotCache.entries;
}

export function getRecentGapsServerSnapshot(): RecentGapEntry[] {
  return EMPTY;
}

function entryKey(entry: RecentGapEntry): string {
  return `${entry.country}|${entry.targets.join(",")}`;
}

export function pushRecentGap(entry: RecentGapEntry): void {
  if (typeof window === "undefined" || entry.targets.length < 2) return;
  try {
    const next = [
      entry,
      ...parseEntries(readRaw()).filter((item) => entryKey(item) !== entryKey(entry)),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 조용히 무시한다 — 목록은 편의 기능일 뿐이다.
  }
}

/** 최근 비교 항목 → 리포트 URL 쿼리 문자열. */
export function recentGapQuery(entry: RecentGapEntry): string {
  const params = new URLSearchParams();
  params.set("you", entry.targets[0]);
  entry.targets.slice(1).forEach((target, index) => {
    params.set(`c${index + 1}`, target);
  });
  params.set("country", entry.country);
  return params.toString();
}
