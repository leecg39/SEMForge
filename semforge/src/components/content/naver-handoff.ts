// @TASK NAVER-P0-CONTENT-HANDOFF - NAVER 키워드 콘텐츠 브리프 전달 모델
// @SPEC user-approved-plan#3-d-authenticated-features
// @TEST src/components/content/naver-handoff.test.ts
import type { Locale } from "@/i18n/config";

export type NaverContentEntrySource =
  | "naver-keyword-explorer"
  | "naver-keyword-overview"
  | "naver-public-preview";

export type NaverInferredIntent =
  | "informational"
  | "navigational"
  | "commercial"
  | "transactional";

interface SearchParamsReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

export interface NaverContentHandoff {
  entrySource: NaverContentEntrySource;
  keywords: string[];
  primaryKeyword: string;
  omittedKeywordCount: number;
  inferredIntent: NaverInferredIntent | null;
  inferredIntentLabel: string | null;
  naverSource: string;
  naverSourceLabel: string;
  naverFetchedAt: string | null;
  naverTrend: string | null;
  naverBlogTitles: string[];
  prefill: string;
}

const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 80;
const MAX_TREND_LENGTH = 600;
const MAX_BLOG_TITLES = 3;
const MAX_BLOG_TITLE_LENGTH = 180;

const ENTRY_SOURCE_DEFAULTS: Record<NaverContentEntrySource, { source: string; label: string }> = {
  "naver-keyword-explorer": { source: "naver-search-ads", label: "NAVER Search Ads" },
  "naver-keyword-overview": { source: "naver-keyword-intelligence", label: "NAVER Search Ads · NAVER API HUB" },
  "naver-public-preview": { source: "naver-keyword-intelligence", label: "NAVER Search Ads · NAVER API HUB" },
};

const OFFICIAL_SOURCE_LABELS: Record<string, string> = {
  "naver-search-ads": "NAVER Search Ads",
  "naver-api-hub": "NAVER API HUB",
  "naver-api-hub-search-trend": "NAVER API HUB Search Trend",
  "naver-api-hub-blog-search": "NAVER API HUB Blog Search",
  "naver-keyword-intelligence": "NAVER Search Ads · NAVER API HUB",
};

const INTENT_LABELS: Record<Locale, Record<NaverInferredIntent, string>> = {
  ko: {
    informational: "정보성",
    navigational: "이동형",
    commercial: "상업 조사",
    transactional: "거래형",
  },
  en: {
    informational: "Informational",
    navigational: "Navigational",
    commercial: "Commercial investigation",
    transactional: "Transactional",
  },
};

function normalizeText(value: string, maxLength: number): string {
  const withoutControls = value.replace(/[\u0000-\u001f\u007f]/gu, " ");
  return Array.from(withoutControls.normalize("NFKC").trim().replace(/\s+/gu, " "))
    .slice(0, maxLength)
    .join("");
}

function normalizeKeywords(values: readonly string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeText(value, MAX_KEYWORD_LENGTH + 1);
    if (!normalized || Array.from(normalized).length > MAX_KEYWORD_LENGTH) continue;
    const identity = normalized.toLocaleLowerCase("ko-KR");
    if (!unique.has(identity)) unique.set(identity, normalized);
  }
  const all = [...unique.values()];
  return {
    keywords: all.slice(0, MAX_KEYWORDS),
    omittedKeywordCount: Math.max(0, all.length - MAX_KEYWORDS),
  };
}

function parseEntrySource(value: string | null): NaverContentEntrySource | null {
  return value === "naver-keyword-explorer" ||
    value === "naver-keyword-overview" ||
    value === "naver-public-preview"
    ? value
    : null;
}

function parseIntent(value: string | null): NaverInferredIntent | null {
  return value === "informational" ||
    value === "navigational" ||
    value === "commercial" ||
    value === "transactional"
    ? value
    : null;
}

function parseFetchedAt(value: string | null): string | null {
  if (!value || value.length > 64) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function buildPrefill(input: Omit<NaverContentHandoff, "prefill">, locale: Locale): string {
  if (locale === "en") {
    return [
      `Primary keyword: ${input.primaryKeyword}`,
      ...(input.keywords.length > 1
        ? [`Also selected keywords: ${input.keywords.slice(1).join(", ")}`]
        : []),
      ...(input.omittedKeywordCount > 0
        ? [`Additional selected keywords: ${input.omittedKeywordCount} omitted by the link handoff limit`]
        : []),
      ...(input.inferredIntentLabel
        ? [`Inferred search intent: ${input.inferredIntentLabel} (clone-intent-v1 inference)`]
        : []),
      ...(input.naverTrend ? [`NAVER relative search trend: ${input.naverTrend}`] : []),
      ...(input.naverBlogTitles.length
        ? [
            "NAVER Blog Search API response titles (not integrated-search rankings):",
            ...input.naverBlogTitles.map((title) => `- ${title}`),
          ]
        : []),
      `Source: ${input.naverSourceLabel}`,
      ...(input.naverFetchedAt ? [`Fetched at: ${input.naverFetchedAt}`] : []),
      "",
      "Use the data above to create a NAVER content brief covering the target audience, inferred search intent, key message, recommended outline, and claims that require verification. Do not publish automatically; create a draft only.",
    ].join("\n");
  }

  const lines = [
    `핵심 키워드: ${input.primaryKeyword}`,
    ...(input.keywords.length > 1
      ? [`함께 선택한 키워드: ${input.keywords.slice(1).join(", ")}`]
      : []),
    ...(input.omittedKeywordCount > 0
      ? [`추가 선택 키워드: ${input.omittedKeywordCount}개(링크 전달 한도로 미포함)`]
      : []),
    ...(input.inferredIntentLabel
      ? [`추론 검색 의도: ${input.inferredIntentLabel} (clone-intent-v1 추론값)`]
      : []),
    ...(input.naverTrend ? [`NAVER 상대 검색 추이: ${input.naverTrend}`] : []),
    ...(input.naverBlogTitles.length
      ? [
          "네이버 블로그 검색 API 응답 제목(통합검색 순위 아님):",
          ...input.naverBlogTitles.map((title) => `- ${title}`),
        ]
      : []),
    `출처: ${input.naverSourceLabel}`,
    ...(input.naverFetchedAt ? [`수집 시각: ${input.naverFetchedAt}`] : []),
    "",
    "위 데이터를 참고해 대상 독자, 추론 검색 의도, 핵심 메시지, 권장 목차, 근거 확인이 필요한 항목을 포함한 NAVER 콘텐츠 브리프를 작성해 주세요. 자동 게시하지 말고 초안만 생성해 주세요.",
  ];
  return lines.join("\n");
}

/**
 * NAVER 키워드 화면이 만든 딱 세 가지 내부 source만 handoff로 인정한다.
 * URL 값은 신뢰 데이터가 아니므로 자유 형식 출처를 표시하지 않고 허용 목록만 사용한다.
 */
export function parseNaverContentHandoff(params: SearchParamsReader, locale: Locale = "ko"): NaverContentHandoff | null {
  const entrySource = parseEntrySource(params.get("source"));
  const requestedIntent = params.get("intent");
  if (!entrySource || (requestedIntent !== "brief" && requestedIntent !== "topic")) return null;

  const normalizedKeywords = normalizeKeywords(params.getAll("keyword"));
  const primaryKeyword = normalizedKeywords.keywords[0];
  if (!primaryKeyword) return null;

  const inferredIntent = parseIntent(params.get("inferredIntent") ?? params.get("naverIntent"));
  const requestedNaverSource = params.get("naverSource");
  const defaultSource = ENTRY_SOURCE_DEFAULTS[entrySource];
  const naverSource = requestedNaverSource && OFFICIAL_SOURCE_LABELS[requestedNaverSource]
    ? requestedNaverSource
    : defaultSource.source;
  const naverSourceLabel = OFFICIAL_SOURCE_LABELS[naverSource] ?? defaultSource.label;
  const naverTrend = normalizeText(params.get("naverTrend") ?? "", MAX_TREND_LENGTH) || null;
  const naverBlogTitles = [...new Set(
    params
      .getAll("naverBlogTitle")
      .map((title) => normalizeText(title, MAX_BLOG_TITLE_LENGTH))
      .filter(Boolean),
  )].slice(0, MAX_BLOG_TITLES);

  const input: Omit<NaverContentHandoff, "prefill"> = {
    entrySource,
    ...normalizedKeywords,
    primaryKeyword,
    inferredIntent,
    inferredIntentLabel: inferredIntent ? INTENT_LABELS[locale][inferredIntent] : null,
    naverSource,
    naverSourceLabel,
    naverFetchedAt: parseFetchedAt(params.get("naverFetchedAt")),
    naverTrend,
    naverBlogTitles,
  };
  return { ...input, prefill: buildPrefill(input, locale) };
}
