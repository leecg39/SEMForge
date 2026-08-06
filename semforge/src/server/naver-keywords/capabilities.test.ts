import assert from "node:assert/strict";
import { test } from "node:test";
import { getNaverKeywordCapabilities } from "@/server/naver-keywords/capabilities";

test("출시 플래그는 미설정 시 인증·공개 모두 fail closed다", () => {
  const capabilities = getNaverKeywordCapabilities({});
  assert.equal(capabilities.enabled, false);
  assert.equal(capabilities.publicPreviewEnabled, false);
});

test("master와 public 플래그 및 두 공급자 자격증명을 독립적으로 보고한다", () => {
  const capabilities = getNaverKeywordCapabilities({
    NAVER_KEYWORD_INTELLIGENCE_ENABLED: "true",
    PUBLIC_NAVER_KEYWORD_PREVIEW_ENABLED: "true",
    NAVER_SEARCH_AD_ACCESS_LICENSE: "access",
    NAVER_SEARCH_AD_SECRET_KEY: "secret",
    NAVER_SEARCH_AD_CUSTOMER_ID: "customer",
    NAVER_API_HUB_CLIENT_ID: "client",
    NAVER_API_HUB_CLIENT_SECRET: "client-secret",
  });
  assert.equal(capabilities.enabled, true);
  assert.equal(capabilities.publicPreviewEnabled, true);
  assert.equal(capabilities.providers.searchAds.enabled, true);
  assert.equal(capabilities.providers.apiHub.enabled, true);
});
