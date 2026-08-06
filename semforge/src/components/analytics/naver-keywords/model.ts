// @TASK NAVER-P0-EXPLORER - 탐색기 정렬·필터·CSV·딥링크 모델
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/analytics/naver-keywords/model.test.ts
import { classifyIntent } from "@/lib/analytics/intent";
import type { AnalyticsIntent } from "@/lib/analytics/types";
import type {
  ExploreProvenance,
  KeywordFilters,
  NaverKeywordCount,
  NaverKeywordExploreView,
  NaverKeywordRow,
} from "@/components/analytics/naver-keywords/types";

export const PAGE_SIZE = 50;
export const MAX_SEEDS = 5;
export const MAX_ROWS = 1_000;
export const MAX_SELECTED_ROWS = 100;
export const MAX_ACTION_KEYWORDS = 20;

/** 목록의 단일 숫자 volume에는 공급자가 확정한 exact 값만 전달한다. */
export function exactKeywordVolume(count: NaverKeywordCount | null): number | null {
  if (
    count?.relation !== "exact" ||
    typeof count.value !== "number" ||
    !Number.isSafeInteger(count.value) ||
    count.value < 0
  ) {
    return null;
  }
  return count.value;
}

const EMPTY_PROVENANCE: ExploreProvenance = {
  status: "error",
  cache: "fresh",
  measurement: "absolute",
  source: "naver-search-ads",
  fetchedAt: "",
  expiresAt: "",
  reason: "응답 형식을 확인할 수 없습니다.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asCount(value: unknown): NaverKeywordCount | null {
  if (!isRecord(value)) return null;
  const relation = value.relation;
  const min = value.min;
  const maxExclusive = value.maxExclusive;
  const display = value.display;
  if (
    (relation !== "exact" && relation !== "lt" && relation !== "range") ||
    typeof min !== "number" ||
    !Number.isFinite(min) ||
    (maxExclusive !== null && (typeof maxExclusive !== "number" || !Number.isFinite(maxExclusive))) ||
    typeof display !== "string"
  ) {
    return null;
  }
  return {
    relation,
    min,
    maxExclusive,
    display,
    ...(typeof value.value === "number" && Number.isFinite(value.value)
      ? { value: value.value }
      : {}),
  };
}

function normalizeRow(value: unknown, provenance: ExploreProvenance): NaverKeywordRow | null {
  if (!isRecord(value) || typeof value.keyword !== "string" || !value.keyword.trim()) return null;
  const keyword = value.keyword.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const classification = classifyIntent({ keyword });
  const competition =
    value.competition === "low" || value.competition === "medium" || value.competition === "high"
      ? value.competition
      : null;
  return {
    snapshotId: typeof value.snapshotId === "string" ? value.snapshotId : null,
    keyword,
    normalizedKeyword:
      typeof value.normalizedKeyword === "string" && value.normalizedKeyword.trim()
        ? value.normalizedKeyword
        : keyword.toLocaleLowerCase("ko-KR"),
    monthlyPcQueries: asCount(value.monthlyPcQueries),
    monthlyMobileQueries: asCount(value.monthlyMobileQueries),
    monthlyTotalQueries: asCount(value.monthlyTotalQueries),
    monthlyAveragePcClicks: asNullableNumber(value.monthlyAveragePcClicks),
    monthlyAverageMobileClicks: asNullableNumber(value.monthlyAverageMobileClicks),
    monthlyAveragePcCtr: asNullableNumber(value.monthlyAveragePcCtr),
    monthlyAverageMobileCtr: asNullableNumber(value.monthlyAverageMobileCtr),
    averageAdDepth: asNullableNumber(value.averageAdDepth),
    competition,
    competitionLabel:
      typeof value.competitionLabel === "string" && value.competitionLabel.trim()
        ? value.competitionLabel
        : null,
    intent: classification.intent,
    intentMeasurement: "inferred",
    intentModel: classification.model,
    source: provenance.source,
    fetchedAt: provenance.fetchedAt,
    expiresAt: provenance.expiresAt,
    cache: provenance.cache,
  };
}

function normalizeProvenance(value: unknown): ExploreProvenance {
  if (!isRecord(value)) return EMPTY_PROVENANCE;
  const status =
    value.status === "live" || value.status === "unavailable" || value.status === "error"
      ? value.status
      : "error";
  const cache = value.cache === "stale" ? "stale" : "fresh";
  const measurement =
    value.measurement === "relative" ||
    value.measurement === "calculated" ||
    value.measurement === "inferred"
      ? value.measurement
      : "absolute";
  return {
    status,
    cache,
    measurement,
    source: typeof value.source === "string" ? value.source : "naver-search-ads",
    fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : "",
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : "",
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
  };
}

/** API 응답을 UI 전용 행으로 변환하되 공급자 값은 계산/보간하지 않는다. */
export function normalizeExplorePayload(payload: unknown): NaverKeywordExploreView {
  const wrapper = isRecord(payload) ? payload : {};
  const report = isRecord(wrapper.data) ? wrapper.data : {};
  const section = isRecord(report.keywords) ? report.keywords : {};
  const provenance = normalizeProvenance(section);
  const rawRows = section.status === "live" && Array.isArray(section.data) ? section.data : [];
  const rows = rawRows
    .slice(0, MAX_ROWS)
    .map((value) => normalizeRow(value, provenance))
    .filter((value): value is NaverKeywordRow => value !== null);

  return {
    seeds: Array.isArray(report.seeds)
      ? report.seeds.filter((value): value is string => typeof value === "string").slice(0, MAX_SEEDS)
      : [],
    generatedAt: typeof report.generatedAt === "string" ? report.generatedAt : provenance.fetchedAt,
    total: typeof report.total === "number" && Number.isFinite(report.total) ? report.total : rows.length,
    rows: sortKeywordRows(rows),
    provenance,
  };
}

export function normalizeSeeds(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("ko-KR");
    if (!unique.has(key)) unique.set(key, normalized);
  }
  const seeds = [...unique.values()];
  if (seeds.length < 1) throw new Error("seed 키워드를 1개 이상 입력해 주세요.");
  if (seeds.length > MAX_SEEDS) throw new Error(`seed 키워드는 최대 ${MAX_SEEDS}개까지 입력할 수 있습니다.`);
  if (seeds.some((seed) => Array.from(seed).length > 80)) throw new Error("seed 키워드는 80자 이하여야 합니다.");
  return seeds;
}

function countLowerBound(count: NaverKeywordCount | null): number {
  return count?.min ?? -1;
}

export function sortKeywordRows(rows: readonly NaverKeywordRow[]): NaverKeywordRow[] {
  return [...rows].sort((left, right) => {
    const volume = countLowerBound(right.monthlyTotalQueries) - countLowerBound(left.monthlyTotalQueries);
    return volume || left.keyword.localeCompare(right.keyword, "ko-KR");
  });
}

export function filterKeywordRows(
  rows: readonly NaverKeywordRow[],
  filters: KeywordFilters,
): NaverKeywordRow[] {
  const query = filters.query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  return rows.filter((row) => {
    if (query && !row.keyword.toLocaleLowerCase("ko-KR").includes(query)) return false;
    if (filters.competition === "unavailable" && row.competition !== null) return false;
    if (filters.competition !== "all" && filters.competition !== "unavailable" && row.competition !== filters.competition) return false;
    if (filters.intent !== "all" && row.intent !== filters.intent) return false;
    return true;
  });
}

export function paginateKeywordRows(rows: readonly NaverKeywordRow[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  const start = (page - 1) * PAGE_SIZE;
  return { page, pageCount, rows: rows.slice(start, start + PAGE_SIZE) };
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  // 스프레드시트가 공급자 키워드를 수식으로 실행하지 않도록 위험 선행문자를 텍스트로 고정한다.
  const safeText = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return /[",\n]/u.test(safeText) ? `"${safeText.replace(/"/gu, '""')}"` : safeText;
}

export function buildKeywordCsv(rows: readonly NaverKeywordRow[]): string {
  const header = [
    "키워드",
    "PC 월간 검색수",
    "모바일 월간 검색수",
    "전체 월간 검색수",
    "PC 평균 광고 클릭",
    "모바일 평균 광고 클릭",
    "PC 평균 CTR",
    "모바일 평균 CTR",
    "광고 경쟁도",
    "추론 의도",
    "의도 모델",
    "출처",
    "캐시",
    "수집 시각",
  ];
  const body = rows.map((row) => [
    row.keyword,
    row.monthlyPcQueries?.display,
    row.monthlyMobileQueries?.display,
    row.monthlyTotalQueries?.display,
    row.monthlyAveragePcClicks,
    row.monthlyAverageMobileClicks,
    row.monthlyAveragePcCtr,
    row.monthlyAverageMobileCtr,
    row.competitionLabel ?? row.competition,
    row.intent,
    row.intentModel,
    row.source,
    row.cache,
    row.fetchedAt,
  ]);
  return "\uFEFF" + [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
}

export type ExplorerAction = "content" | "advertising" | "keywordList";

export interface ExplorerActionContext {
  naverSource: string;
  naverFetchedAt: string;
  measurement: "absolute" | "relative" | "calculated" | "inferred";
  intents: readonly AnalyticsIntent[];
}

export function buildActionHref(
  action: ExplorerAction,
  keywords: readonly string[],
  context?: ExplorerActionContext,
): string {
  const safeKeywords = keywords.slice(0, MAX_ACTION_KEYWORDS);
  const pathname =
    action === "content"
      ? "/content/"
      : action === "advertising"
        ? "/analytics/adwords/positions/"
        : "/app/keyword-lists/";
  const params = new URLSearchParams({ source: "naver-keyword-explorer" });
  if (context) {
    params.set("naverSource", context.naverSource.slice(0, 80));
    params.set("naverFetchedAt", context.naverFetchedAt.slice(0, 32));
    params.set("measurement", context.measurement);
    params.set("naverIntents", context.intents.slice(0, MAX_ACTION_KEYWORDS).join(","));
    if (context.intents[0]) params.set("inferredIntent", context.intents[0]);
  }
  if (action === "content") {
    params.set("intent", "brief");
    safeKeywords.forEach((keyword) => params.append("keyword", keyword));
  } else if (action === "advertising") {
    params.set("keywords", safeKeywords.join(","));
  } else {
    safeKeywords.forEach((keyword) => params.append("keyword", keyword));
  }
  return `${pathname}?${params.toString()}`;
}

export const INTENT_LABELS: Record<AnalyticsIntent, string> = {
  informational: "정보성",
  navigational: "이동형",
  commercial: "상업 조사",
  transactional: "거래형",
};
