import assert from "node:assert/strict";
import test from "node:test";
import type { AdCampaignDraft } from "@/server/advertising/contracts";
import {
  advertisingCampaignCsv,
  advertisingCampaignJson,
  budgetMajorAmount,
  safeSpreadsheetCell,
} from "@/server/advertising/export";

function campaignFixture(): AdCampaignDraft {
  return {
    id: "adc_fixture",
    folderId: null,
    name: "=DANGEROUS()",
    domain: "example.com",
    platform: "google",
    goal: "sales",
    countryCode: "KR",
    languageCode: "ko",
    dailyBudgetCents: 30000,
    currencyCode: "KRW",
    status: "ready",
    version: 3,
    updatedAt: "2026-08-01T00:00:00.000Z",
    adGroup: { id: "adg_fixture", name: "기본 그룹", finalUrl: "https://example.com" },
    keywords: [
      {
        id: "adk_fixture",
        keyword: "+위험한 수식",
        matchType: "phrase",
        negative: false,
        source: "manual",
        volume: null,
        cpcCents: null,
      },
    ],
    creative: {
      id: "adv_fixture",
      headlines: ["안전한 광고"],
      descriptions: ["검토용 초안"],
      primaryText: null,
      path1: null,
      path2: null,
      callToAction: null,
      finalUrl: "https://example.com",
      source: "manual",
    },
    recommendations: [],
  };
}

test("CSV 수식 시작 문자를 모두 비활성화한다", () => {
  assert.equal(safeSpreadsheetCell("=1+1"), "'=1+1");
  assert.equal(safeSpreadsheetCell("+SUM(A:A)"), "'+SUM(A:A)");
  assert.equal(safeSpreadsheetCell("-1+2"), "'-1+2");
  assert.equal(safeSpreadsheetCell("@cmd"), "'@cmd");
  const csv = advertisingCampaignCsv(campaignFixture());
  assert.match(csv, /'=DANGEROUS\(\)/);
  assert.match(csv, /'\+위험한 수식/);
});

test("동일 초안의 CSV와 JSON 재다운로드 결과는 결정적이다", () => {
  const campaign = campaignFixture();
  assert.equal(advertisingCampaignCsv(campaign), advertisingCampaignCsv(campaign));
  assert.equal(advertisingCampaignJson(campaign), advertisingCampaignJson(campaign));
  assert.match(advertisingCampaignJson(campaign), /semforge\.advertising-draft\.v1/);
  assert.match(advertisingCampaignJson(campaign), /2026-08-01T00:00:00\.000Z/);
});

test("0소수 통화와 소수 통화의 저장 단위를 올바르게 변환한다", () => {
  assert.equal(budgetMajorAmount(30000, "KRW"), 30000);
  assert.equal(budgetMajorAmount(30000, "JPY"), 30000);
  assert.equal(budgetMajorAmount(30000, "USD"), 300);
});
