/**
 * 한국형 키워드 인텔리전스 입력 경계.
 * 외부 공급자와 캐시가 같은 키를 사용하도록 모든 진입점에서 동일한 정규화를 적용한다.
 */

export const MAX_NAVER_KEYWORD_LENGTH = 80;
export const MAX_NAVER_SEED_KEYWORDS = 5;

export class KeywordInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeywordInputError";
  }
}

export function normalizeKeyword(value: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized) {
    throw new KeywordInputError("키워드를 입력해 주세요.");
  }
  if (Array.from(normalized).length > MAX_NAVER_KEYWORD_LENGTH) {
    throw new KeywordInputError(`키워드는 ${MAX_NAVER_KEYWORD_LENGTH}자 이하여야 합니다.`);
  }
  return normalized;
}

export function normalizeKeywordSeeds(values: readonly string[]): string[] {
  if (values.length < 1 || values.length > MAX_NAVER_SEED_KEYWORDS) {
    throw new KeywordInputError(`seed 키워드는 1개 이상 ${MAX_NAVER_SEED_KEYWORDS}개 이하여야 합니다.`);
  }

  const unique = new Map<string, string>();
  for (const value of values) {
    const keyword = normalizeKeyword(value);
    const key = keyword.toLocaleLowerCase("ko-KR");
    if (!unique.has(key)) unique.set(key, keyword);
  }
  return [...unique.values()];
}
