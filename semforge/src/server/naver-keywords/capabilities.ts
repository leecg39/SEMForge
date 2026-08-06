// @TASK NAVER-KI-CAP-01 - NAVER 공급자 기능 상태
// @SPEC user-approved-plan#3-a-official-data-collection
import type { NaverKeywordCapabilities } from "@/server/naver-keywords/contracts";

function enabledFlag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLocaleLowerCase("en-US"));
}

type CapabilityEnv = Record<string, string | undefined>;

function allConfigured(names: readonly string[], env: CapabilityEnv): boolean {
  return names.every((name) => Boolean(env[name]?.trim()));
}

export function getNaverKeywordCapabilities(
  env: CapabilityEnv = process.env,
): NaverKeywordCapabilities {
  const enabled = enabledFlag(env.NAVER_KEYWORD_INTELLIGENCE_ENABLED);
  const publicPreviewEnabled = enabled && enabledFlag(env.PUBLIC_NAVER_KEYWORD_PREVIEW_ENABLED);
  const searchAdsConfigured = allConfigured([
    "NAVER_SEARCH_AD_ACCESS_LICENSE",
    "NAVER_SEARCH_AD_SECRET_KEY",
    "NAVER_SEARCH_AD_CUSTOMER_ID",
  ], env);
  const apiHubConfigured = allConfigured([
    "NAVER_API_HUB_CLIENT_ID",
    "NAVER_API_HUB_CLIENT_SECRET",
  ], env);
  return {
    enabled,
    publicPreviewEnabled,
    providers: {
      searchAds: {
        enabled: enabled && searchAdsConfigured,
        source: "naver-search-ads-relkwdstat",
        ...(!enabled
          ? { reason: "NAVER 키워드 인텔리전스 기능이 비활성화되어 있습니다." }
          : !searchAdsConfigured
            ? { reason: "NAVER Search Ads 자격증명이 설정되지 않았습니다." }
            : {}),
      },
      apiHub: {
        enabled: enabled && apiHubConfigured,
        source: "naver-api-hub",
        ...(!enabled
          ? { reason: "NAVER 키워드 인텔리전스 기능이 비활성화되어 있습니다." }
          : !apiHubConfigured
            ? { reason: "NAVER API HUB 자격증명이 설정되지 않았습니다." }
            : {}),
      },
    },
  };
}
