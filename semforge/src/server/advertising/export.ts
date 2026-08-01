import type { AdCampaignDraft } from "@/server/advertising/contracts";

const ZERO_DECIMAL_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export function budgetMajorAmount(amount: number, currencyCode: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? amount : amount / 100;
}

const CSV_HEADERS = [
  "row_type",
  "campaign",
  "platform",
  "ad_group",
  "domain",
  "country",
  "language",
  "daily_budget",
  "currency",
  "keyword",
  "match_type",
  "negative",
  "headlines",
  "descriptions",
  "primary_text",
  "path_1",
  "path_2",
  "final_url",
  "status",
] as const;

/** 스프레드시트에서 =,+,-,@ 로 시작하는 셀이 수식으로 실행되지 않게 막는다. */
export function safeSpreadsheetCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  const safe = safeSpreadsheetCell(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function advertisingCampaignCsv(campaign: AdCampaignDraft): string {
  const base = {
    campaign: campaign.name,
    platform: campaign.platform,
    ad_group: campaign.adGroup.name,
    domain: campaign.domain,
    country: campaign.countryCode,
    language: campaign.languageCode,
    daily_budget: budgetMajorAmount(campaign.dailyBudgetCents, campaign.currencyCode).toFixed(
      ZERO_DECIMAL_CURRENCIES.has(campaign.currencyCode.toUpperCase()) ? 0 : 2,
    ),
    currency: campaign.currencyCode,
    headlines: campaign.creative.headlines.join(" | "),
    descriptions: campaign.creative.descriptions.join(" | "),
    primary_text: campaign.creative.primaryText ?? "",
    path_1: campaign.creative.path1 ?? "",
    path_2: campaign.creative.path2 ?? "",
    final_url: campaign.creative.finalUrl,
    status: campaign.status,
  };
  const keywordRows = campaign.keywords.map((keyword) => ({
    row_type: "keyword",
    ...base,
    keyword: keyword.keyword,
    match_type: keyword.matchType,
    negative: keyword.negative ? "true" : "false",
  }));
  const rows = keywordRows.length
    ? keywordRows
    : [{ row_type: "creative", ...base, keyword: "", match_type: "", negative: "" }];
  return [
    CSV_HEADERS.map(csvCell).join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvCell(row[header])).join(",")),
  ].join("\r\n");
}

export function advertisingCampaignJson(campaign: AdCampaignDraft): string {
  return JSON.stringify(
    {
      schema: "semforge.advertising-draft.v1",
      /** 결정적 내보내기: 다운로드 시각 대신 마지막 저장 시각을 기록한다. */
      exportedAt: campaign.updatedAt,
      campaign,
      publishing: {
        connected: false,
        note: "Google Ads·Meta 계정 게시가 아닌 검토용 초안입니다.",
      },
    },
    null,
    2,
  );
}

export function safeExportFilename(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9가-힣._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "advertising-campaign";
}
