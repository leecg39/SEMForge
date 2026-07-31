import type { AnalyticsIntent } from "@/lib/analytics/types";

/**
 * clone-intent-v1 — 규칙 기반 검색 의도 분류기.
 *
 * Semrush 공식 문서(kb/1226)가 밝힌 "키워드 패턴 + SERP 피처" 조합 방식을
 * 소규모 규칙으로 모사한다. ML 모델이 아니므로 추정치이며, UI 는 반드시
 * "계산식 clone-intent-v1" provenance 배지와 근거(evidence)를 함께 표시한다.
 *
 * 우선순위: transactional > commercial > navigational > informational.
 * 키워드 패턴 매칭이 1순위 근거, SERP 피처는 보조 근거다.
 */

export interface IntentEvidence {
  /** 근거 종류: 키워드 패턴 매칭 또는 SERP 피처. */
  rule: "keyword-pattern" | "serp-feature";
  /** 매칭된 토큰 (키워드 패턴 원문 또는 피처 이름). */
  match: string;
}

export interface IntentClassification {
  intent: AnalyticsIntent;
  evidence: IntentEvidence[];
  model: "clone-intent-v1";
}

/** 의도별 키워드 패턴. 한국어는 조사가 붙으므로 부분 문자열, 영어는 단어 경계로 매칭한다. */
const KEYWORD_PATTERNS: Record<Exclude<AnalyticsIntent, "informational">, { ko: string[]; en: string[] }> = {
  transactional: {
    ko: ["구매", "구입", "주문", "예약", "신청", "결제", "다운로드", "쿠폰", "할인", "특가", "세일", "최저가", "배송"],
    en: ["buy", "purchase", "order", "book", "download", "coupon", "discount", "deal", "sale", "cheap", "subscribe", "pricing"],
  },
  commercial: {
    ko: ["추천", "후기", "리뷰", "비교", "순위", "가격", "장단점", "vs", "베스트", "브랜드", "어디가 좋"],
    en: ["best", "top", "review", "compare", "comparison", "vs", "alternative", "price", "cost", "brands"],
  },
  navigational: {
    ko: ["로그인", "홈페이지", "공식", "사이트", "고객센터", "바로가기", "앱"],
    en: ["login", "log in", "sign in", "official", "website", "homepage", "customer service", "app"],
  },
};

/** 정보성 신호 (질문형). 다른 의도 매칭이 없을 때 informational 근거로 쓴다. */
const INFORMATIONAL_PATTERNS: { ko: string[]; en: string[] } = {
  ko: ["방법", "뜻", "의미", "이란", "무엇", "어떻게", "왜", "언제", "차이"],
  en: ["how to", "what is", "what are", "why", "when", "guide", "tutorial", "meaning", "definition", "examples"],
};

/** SERP 피처 → 의도 보조 신호. */
const FEATURE_SIGNALS: Partial<Record<string, AnalyticsIntent>> = {
  shopping: "commercial",
  local_pack: "transactional",
  knowledge_panel: "navigational",
  people_also_ask: "informational",
  answer_box: "informational",
  ai_overview: "informational",
};

const INTENT_PRIORITY: AnalyticsIntent[] = [
  "transactional",
  "commercial",
  "navigational",
  "informational",
];

function matchKoreanPattern(keyword: string, pattern: string): boolean {
  return keyword.includes(pattern);
}

function matchEnglishPattern(keyword: string, pattern: string): boolean {
  // 단어 경계 매칭 — "best" 가 "asbestos" 에 걸리지 않게 한다.
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`, "i").test(keyword);
}

function matchPatterns(keyword: string, patterns: { ko: string[]; en: string[] }): string[] {
  const matches: string[] = [];
  for (const pattern of patterns.ko) {
    if (matchKoreanPattern(keyword, pattern)) matches.push(pattern);
  }
  for (const pattern of patterns.en) {
    if (matchEnglishPattern(keyword, pattern)) matches.push(pattern);
  }
  return matches;
}

export function classifyIntent(input: {
  keyword: string;
  serpFeatures?: readonly string[];
}): IntentClassification {
  const keyword = input.keyword.trim().replace(/\s+/g, " ").toLowerCase();
  const features = input.serpFeatures ?? [];

  const evidenceByIntent = new Map<AnalyticsIntent, IntentEvidence[]>();
  const push = (intent: AnalyticsIntent, evidence: IntentEvidence) => {
    const list = evidenceByIntent.get(intent) ?? [];
    list.push(evidence);
    evidenceByIntent.set(intent, list);
  };

  for (const intent of ["transactional", "commercial", "navigational"] as const) {
    for (const match of matchPatterns(keyword, KEYWORD_PATTERNS[intent])) {
      push(intent, { rule: "keyword-pattern", match });
    }
  }
  for (const match of matchPatterns(keyword, INFORMATIONAL_PATTERNS)) {
    push("informational", { rule: "keyword-pattern", match });
  }
  for (const feature of features) {
    const intent = FEATURE_SIGNALS[feature];
    if (intent) push(intent, { rule: "serp-feature", match: feature });
  }

  // 키워드 패턴이 있는 의도를 우선순위대로 선택하고, 없으면 피처 신호,
  // 그것도 없으면 informational 기본값(근거 없음)으로 둔다.
  for (const intent of INTENT_PRIORITY) {
    const evidence = evidenceByIntent.get(intent) ?? [];
    if (evidence.some((item) => item.rule === "keyword-pattern")) {
      return { intent, evidence, model: "clone-intent-v1" };
    }
  }
  for (const intent of INTENT_PRIORITY) {
    const evidence = evidenceByIntent.get(intent) ?? [];
    if (evidence.length > 0) {
      return { intent, evidence, model: "clone-intent-v1" };
    }
  }
  return { intent: "informational", evidence: [], model: "clone-intent-v1" };
}
