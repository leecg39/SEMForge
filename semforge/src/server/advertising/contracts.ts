export type AdvertisingPlatform = "google" | "meta";
export type AdvertisingGoal = "sales" | "leads" | "traffic" | "awareness";
export type AdvertisingCampaignStatus = "draft" | "ready" | "exported";
export type AdvertisingMatchType = "broad" | "phrase" | "exact";

export interface AdvertisingCapabilities {
  paidSearch: { enabled: boolean; reason: string | null };
  pla: { enabled: boolean; reason: string | null };
  aiCopy: { enabled: boolean; reason: string | null };
  aiImage: { enabled: false; reason: string };
  export: { enabled: true; reason: null };
}

export interface CampaignKeywordInput {
  id?: string;
  keyword: string;
  matchType: AdvertisingMatchType;
  negative: boolean;
  source?: "manual" | "research" | "ai";
  volume?: number | null;
  cpcCents?: number | null;
}

export interface CampaignCreativeInput {
  id?: string;
  headlines: string[];
  descriptions: string[];
  primaryText?: string | null;
  path1?: string | null;
  path2?: string | null;
  callToAction?: string | null;
  finalUrl: string;
}

export interface CampaignDraftInput {
  folderId?: string | null;
  requestId?: string | null;
  name: string;
  domain: string;
  platform: AdvertisingPlatform;
  goal: AdvertisingGoal;
  countryCode: string;
  languageCode: string;
  dailyBudgetCents: number;
  currencyCode: string;
  adGroupName: string;
  finalUrl: string;
  status?: "draft" | "ready";
  keywords?: CampaignKeywordInput[];
  creative?: CampaignCreativeInput;
}

export interface CampaignDraftPatch extends Partial<CampaignDraftInput> {
  version: number;
}

export interface AdCampaignDraft {
  id: string;
  folderId: string | null;
  name: string;
  domain: string;
  platform: AdvertisingPlatform;
  goal: AdvertisingGoal;
  countryCode: string;
  languageCode: string;
  dailyBudgetCents: number;
  currencyCode: string;
  status: AdvertisingCampaignStatus;
  version: number;
  updatedAt: string;
  adGroup: { id: string; name: string; finalUrl: string };
  keywords: Array<CampaignKeywordInput & { id: string }>;
  creative: CampaignCreativeInput & { id: string; source: "manual" | "ai" };
  recommendations: AdRecommendation[];
}

export type RecommendationKind =
  | "add_keyword"
  | "remove_keyword"
  | "restructure_ad_group"
  | "rewrite_copy"
  | "landing_page"
  | "budget";

export interface AdRecommendation {
  id: string;
  kind: RecommendationKind;
  status: "pending" | "applied" | "rejected";
  rationale: string;
  beforeValue: unknown;
  afterValue: unknown;
  source: string;
  createdAt: string;
}

export interface AdvertisingResearchRunView {
  id: string;
  folderId: string | null;
  domain: string;
  countryCode: string;
  device: "desktop" | "mobile";
  keywords: string[];
  status: "queued" | "running" | "completed" | "failed";
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  currentKeyword: string | null;
  errorMessage: string | null;
  source: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AdvertisingResearchResultRow {
  keyword: string;
  resultType: "search_ad" | "shopping_ad";
  position: number;
  previousPosition: number | null;
  domain: string;
  advertiser: string | null;
  title: string;
  description: string | null;
  url: string;
  placement: "top" | "bottom" | "shopping" | "unknown";
  price: string | null;
  imageUrl: string | null;
  volume: number | null;
  cpcCents: number | null;
}

export interface AdvertisingResearchReport {
  run: AdvertisingResearchRunView;
  rows: AdvertisingResearchResultRow[];
  coverage: {
    searchAds: number;
    shoppingAds: number;
    zeroResultKeywords: number;
    failedKeywords: number;
    plaAvailability: "checking" | "available" | "no_results" | "unavailable";
  };
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
