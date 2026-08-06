import { z } from "zod";

export const BACKLINK_PROVIDER = "bing-webmaster" as const;
export const BACKLINK_CSV_PROVIDER = "bing-csv" as const;
export const BACKLINK_COMMON_CRAWL_PROVIDER = "common-crawl" as const;
export const BACKLINK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const COMMON_CRAWL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const BACKLINK_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const BACKLINK_REFRESH_LEASE_MS = 2 * 60 * 1000;
export const BACKLINK_IMPORT_TTL_MS = 30 * 60 * 1000;
export const BACKLINK_PAGE_SIZE = 25;
export const BACKLINK_MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const BACKLINK_MAX_IMPORT_ROWS = 100_000;

export const backlinkProviderSchema = z.enum([
  BACKLINK_PROVIDER,
  BACKLINK_CSV_PROVIDER,
  BACKLINK_COMMON_CRAWL_PROVIDER,
]);
export type BacklinkProvider = z.infer<typeof backlinkProviderSchema>;

export const backlinkCollectionProviderSchema = z.enum([
  "auto",
  BACKLINK_PROVIDER,
  BACKLINK_COMMON_CRAWL_PROVIDER,
]);
export type BacklinkCollectionProvider = z.infer<typeof backlinkCollectionProviderSchema>;

export const backlinkScopeSchema = z.enum(["site", "page"]);
export type BacklinkScope = z.infer<typeof backlinkScopeSchema>;

export const backlinkDatasetSchema = z.enum(["target_pages", "inbound_links"]);
export type BacklinkDataset = z.infer<typeof backlinkDatasetSchema>;

export const backlinkFiltersSchema = z.object({
  search: z.string().trim().max(200).default(""),
});
export type BacklinkFilters = z.infer<typeof backlinkFiltersSchema>;

export const backlinkReportRequestSchema = z
  .object({
    siteUrl: z.string().trim().min(1).max(2000),
    targetUrl: z.string().trim().max(2000).nullable().optional(),
    scope: backlinkScopeSchema.default("site"),
    mode: z.enum(["if-stale", "force"]).default("if-stale"),
    provider: backlinkCollectionProviderSchema.default("auto"),
    limit: z.union([z.literal(100), z.literal(500), z.literal(1000)]).default(100),
  })
  .superRefine((input, context) => {
    if (input.scope === "page" && !input.targetUrl) {
      context.addIssue({ code: "custom", path: ["targetUrl"], message: "페이지 범위에는 대상 URL이 필요합니다." });
    }
  });
export type BacklinkReportRequest = z.infer<typeof backlinkReportRequestSchema>;

export const backlinkListRequestSchema = z
  .object({
    siteUrl: z.string().trim().min(1).max(2000),
    targetUrl: z.string().trim().max(2000).nullable().optional(),
    scope: backlinkScopeSchema.default("site"),
    provider: backlinkProviderSchema,
    dataset: backlinkDatasetSchema,
    targetPage: z.string().trim().max(2000).nullable().optional(),
    page: z.coerce.number().int().min(1).max(32_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(1000).default(BACKLINK_PAGE_SIZE),
    sort: z.string().trim().max(40).optional(),
    direction: z.enum(["asc", "desc"]).default("desc"),
    filters: backlinkFiltersSchema.default({ search: "" }),
  })
  .superRefine((input, context) => {
    if (input.dataset === "inbound_links" && !input.targetPage) {
      context.addIssue({ code: "custom", path: ["targetPage"], message: "인바운드 링크를 조회할 대상 페이지를 선택해 주세요." });
    }
  });
export type BacklinkListRequest = z.infer<typeof backlinkListRequestSchema>;

export const backlinkExportRequestSchema = backlinkListRequestSchema.extend({
  limit: z.union([z.literal(100), z.literal(500), z.literal(1000)]).default(100),
});

export const backlinkImportMappingSchema = z.object({
  sourceUrl: z.string().min(1),
  targetUrl: z.string().min(1),
  anchor: z.string().nullable().optional(),
  linkCount: z.string().nullable().optional(),
});
export type BacklinkImportMapping = z.infer<typeof backlinkImportMappingSchema>;

export const backlinkImportCommitSchema = z.object({
  importId: z.string().trim().min(1).max(80),
  siteUrl: z.string().trim().min(1).max(2000),
  mapping: backlinkImportMappingSchema,
});

export interface BacklinkOverview {
  domainRating: number | null;
  totalInboundLinks: number | null;
  linkedPages: number | null;
  newLinks: number | null;
  lostLinks: number | null;
}

export interface BacklinkHistoryPoint {
  date: string;
  totalInboundLinks: number | null;
  linkedPages: number | null;
}

export interface BacklinkTargetPageRow {
  kind: "target_pages";
  url: string;
  linkCount: number;
}

export interface BacklinkInboundLinkRow {
  kind: "inbound_links";
  sourceUrl: string;
  targetUrl: string;
  sourceDomain: string;
  anchor: string | null;
  linkCount: number;
}

export type BacklinkRow = BacklinkTargetPageRow | BacklinkInboundLinkRow;

export interface BacklinkProvenance {
  provider: BacklinkProvider;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  cached: boolean;
  partial: boolean;
  warning: string | null;
  requestIds: string[];
  domainRatingAttribution: "Domain Rating by Ahrefs" | null;
  domainRatingLicenseUrl: string | null;
  commonCrawlRelease: string | null;
  fallbackFromBing: boolean;
}

export interface BacklinkReport {
  siteUrl: string;
  targetUrl: string | null;
  scope: BacklinkScope;
  overview: BacklinkOverview;
  history: BacklinkHistoryPoint[];
  topTargetPages: BacklinkTargetPageRow[];
  provenance: BacklinkProvenance;
}

export interface BacklinkListResult {
  siteUrl: string;
  targetUrl: string | null;
  scope: BacklinkScope;
  provider: BacklinkProvider;
  dataset: BacklinkDataset;
  targetPage: string | null;
  rows: BacklinkRow[];
  total: number | null;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: string;
  direction: "asc" | "desc";
  provenance: {
    provider: BacklinkProvider;
    fetchedAt: string;
    expiresAt: string;
    cached: boolean;
    partial: boolean;
    requestId: string | null;
  };
}

export interface BingSite {
  siteUrl: string;
  verified: boolean;
}

export interface BingConnectionStatus {
  configured: boolean;
  connected: boolean;
  selectedSiteUrl: string | null;
  expiresAt: string | null;
  reason: string | null;
}

export interface CommonCrawlConnectionStatus {
  configured: boolean;
  reason: string;
}

export interface BacklinkImportPreview {
  importId: string;
  fileName: string;
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  detectedMapping: Partial<BacklinkImportMapping>;
  expiresAt: string;
}
