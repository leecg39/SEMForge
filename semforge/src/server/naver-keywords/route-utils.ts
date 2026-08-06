import { ApiError } from "@/lib/api";
import { getNaverKeywordCapabilities } from "@/server/naver-keywords/capabilities";
import {
  KeywordInputError,
  normalizeKeyword,
  normalizeKeywordSeeds,
} from "@/server/naver-keywords/normalization";

export function apiKeyword(value: string): string {
  try {
    return normalizeKeyword(value);
  } catch (error) {
    if (error instanceof KeywordInputError) {
      throw new ApiError("VALIDATION_ERROR", error.message, {
        fields: { keyword: error.message },
      });
    }
    throw error;
  }
}

export function apiKeywordSeeds(values: readonly string[]): string[] {
  try {
    return normalizeKeywordSeeds(values);
  } catch (error) {
    if (error instanceof KeywordInputError) {
      throw new ApiError("VALIDATION_ERROR", error.message, {
        fields: { seeds: error.message },
      });
    }
    throw error;
  }
}

export function assertNaverKeywordFeature(publicPreview = false): void {
  const capabilities = getNaverKeywordCapabilities();
  const enabled = publicPreview ? capabilities.publicPreviewEnabled : capabilities.enabled;
  if (!enabled) {
    throw new ApiError("NOT_FOUND", "NAVER 키워드 인텔리전스 기능이 비활성화되어 있습니다.");
  }
}
