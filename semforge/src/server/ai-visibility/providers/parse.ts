/**
 * AI 답변 제공자의 원시 출력에서 본문·언급 브랜드·인용 도메인을 뽑아내는 순수 로직.
 *
 * 제공자(계정 인증 Grok / xAI HTTP API)가 무엇이든 출력 형태는 같게 맞춘다.
 * 형식을 지키지 못한 응답을 "언급 없음"으로 확정하면 가짜 0% 가시성이 만들어지므로,
 * 판정 불가는 false 가 아니라 null 로 돌려준다.
 */

/**
 * 수집 프롬프트를 만든다.
 *
 * 대상 도메인을 프롬프트에 넣지 않는 것이 핵심이다. 알려주면 모델이 그 브랜드를
 * 언급하도록 유도되어 "우리를 언급하는가"라는 측정 자체가 무의미해진다.
 */
export function buildCollectionPrompt(input: { prompt: string; locale?: string }): string {
  return [
    "당신은 검색 어시스턴트다. 아래 질문에 실제 사용자에게 답하듯 평소대로 답하라.",
    "특정 브랜드를 의도적으로 밀거나 피하지 마라.",
    "",
    `질문: ${input.prompt}`,
    "",
    "답변 마지막에 아래 JSON 한 줄만 덧붙여라. 코드펜스나 추가 설명은 붙이지 마라.",
    '{"brands":["답변에서 언급한 브랜드·기관명"],"sources":["참고한 도메인"]}',
  ].join("\n");
}

export interface ParsedProviderOutput {
  answerText: string;
  mentionedBrands: string[];
  citedDomains: string[];
  /** 기대한 JSON 구조를 실제로 얻었는가. false 면 목록을 신뢰할 수 없다. */
  structured: boolean;
}

interface RawPayload {
  brands?: unknown;
  sources?: unknown;
}

/** 문자열 배열만 남기고 공백을 제거한다. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 호스트명만 남기고 소문자·www 제거 후 중복을 없앤다. */
export function normalizeDomainList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0) continue;
    const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    const host = withoutScheme.split(/[/?#]/)[0].replace(/^www\./, "");
    // 점이 없는 값은 도메인으로 보지 않는다.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) continue;
    seen.add(host);
  }
  return [...seen];
}

/** 코드펜스를 걷어내고 마지막 JSON 객체의 시작 위치를 찾는다. */
function findLastJsonObject(text: string): { json: RawPayload; start: number } | null {
  const fenceStripped = text.replace(/```[a-z]*\s*|```/gi, "");
  for (let index = fenceStripped.lastIndexOf("{"); index >= 0; index = fenceStripped.lastIndexOf("{", index - 1)) {
    const candidate = fenceStripped.slice(index);
    const end = candidate.lastIndexOf("}");
    if (end < 0) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(0, end + 1));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return { json: parsed as RawPayload, start: text.indexOf("{", Math.max(0, index - 8)) };
      }
    } catch {
      // 다음 후보로 넘어간다.
    }
  }
  return null;
}

export function parseProviderOutput(raw: string): ParsedProviderOutput {
  const text = raw.trim();
  if (text.length === 0) {
    return { answerText: "", mentionedBrands: [], citedDomains: [], structured: false };
  }

  const found = findLastJsonObject(text);
  if (found === null) {
    return { answerText: text, mentionedBrands: [], citedDomains: [], structured: false };
  }

  const cutAt = found.start >= 0 ? found.start : text.length;
  const answerText = text
    .slice(0, cutAt)
    .replace(/```[a-z]*\s*$/i, "")
    .trim();

  return {
    answerText,
    mentionedBrands: toStringList(found.json.brands),
    citedDomains: normalizeDomainList(toStringList(found.json.sources)),
    structured: true,
  };
}

export interface BrandMentionInput {
  /** 판정 대상 도메인 (정규화된 루트 도메인). */
  domain: string;
  answerText: string;
  mentionedBrands: readonly string[];
  citedDomains: readonly string[];
  /** parseProviderOutput 의 structured 값. 기본 true. */
  structured?: boolean;
}

export interface BrandMentionResult {
  /** 판정 불가면 null. 절대 임의로 false 로 확정하지 않는다. */
  brandMentioned: boolean | null;
  brandRank: number | null;
}

function isSameOrSubdomain(candidate: string, domain: string): boolean {
  return candidate === domain || candidate.endsWith(`.${domain}`);
}

export function detectBrandMention(input: BrandMentionInput): BrandMentionResult {
  if (input.structured === false) {
    return { brandMentioned: null, brandRank: null };
  }

  const domain = input.domain.trim().toLowerCase().replace(/^www\./, "");
  const domains = normalizeDomainList(input.citedDomains);
  const index = domains.findIndex((candidate) => isSameOrSubdomain(candidate, domain));
  if (index >= 0) {
    return { brandMentioned: true, brandRank: index + 1 };
  }
  return { brandMentioned: false, brandRank: null };
}
