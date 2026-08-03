import { z } from "zod";

export const BACKLINK_PROVIDER = "semrush-v4" as const;
export const BACKLINK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const BACKLINK_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const BACKLINK_REFRESH_LEASE_MS = 2 * 60 * 1000;
export const BACKLINK_PAGE_SIZE = 25;

export const backlinkScopeSchema = z.enum(["root_domain", "subdomain", "page"]);
export type BacklinkScope = z.infer<typeof backlinkScopeSchema>;

export const backlinkDatasetSchema = z.enum([
  "links",
  "ref_domains",
  "anchors",
  "pages",
]);
export type BacklinkDataset = z.infer<typeof backlinkDatasetSchema>;

export const backlinkFiltersSchema = z.object({
  status: z.enum(["all", "new", "lost"]).default("all"),
  attribute: z
    .enum(["all", "follow", "nofollow", "sponsored", "ugc"])
    .default("all"),
  linkType: z.enum(["all", "text", "image", "form", "frame"]).default("all"),
  search: z.string().trim().max(200).default(""),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});
export type BacklinkFilters = z.infer<typeof backlinkFiltersSchema>;

export const backlinkReportRequestSchema = z.object({
  target: z.string().trim().min(1).max(2000),
  scope: backlinkScopeSchema.default("root_domain"),
  mode: z.enum(["if-stale", "force"]).default("if-stale"),
});

export const backlinkListRequestSchema = z.object({
  target: z.string().trim().min(1).max(2000),
  scope: backlinkScopeSchema.default("root_domain"),
  dataset: backlinkDatasetSchema,
  page: z.coerce.number().int().min(1).max(4000).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(BACKLINK_PAGE_SIZE),
  sort: z.string().trim().max(40).optional(),
  direction: z.enum(["asc", "desc"]).default("desc"),
  filters: backlinkFiltersSchema.default({
    status: "all",
    attribute: "all",
    linkType: "all",
    search: "",
    dateFrom: null,
    dateTo: null,
  }),
});
export type BacklinkListRequest = z.infer<typeof backlinkListRequestSchema>;

export const backlinkExportRequestSchema = backlinkListRequestSchema.extend({
  limit: z.union([z.literal(100), z.literal(500), z.literal(1000)]).default(100),
});

export interface BacklinkOverview {
  authorityScore: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  referringPages: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  followBacklinks: number | null;
  nofollowBacklinks: number | null;
  sponsoredBacklinks: number | null;
  ugcBacklinks: number | null;
  textBacklinks: number | null;
  imageBacklinks: number | null;
  formBacklinks: number | null;
  frameBacklinks: number | null;
}

export interface BacklinkHistoryPoint {
  month: string;
  authorityScore: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  followBacklinks: number | null;
}

export interface BacklinkScoreBucket {
  score: number;
  referringDomains: number;
}

export interface BacklinkProvenance {
  provider: typeof BACKLINK_PROVIDER;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  cached: boolean;
  requestIds: string[];
  warning: string | null;
}

export interface BacklinkReport {
  target: string;
  effectiveTarget: string;
  scope: BacklinkScope;
  overview: BacklinkOverview;
  history: BacklinkHistoryPoint[];
  scoreProfile: BacklinkScoreBucket[];
  provenance: BacklinkProvenance;
}

export interface BacklinkLinkRow {
  kind: "links";
  sourceUrl: string;
  targetUrl: string;
  sourceDomain: string;
  sourceTitle: string | null;
  anchor: string | null;
  domainScore: number | null;
  pageScore: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
  image: boolean;
  form: boolean;
  frame: boolean;
  isNew: boolean;
  isLost: boolean;
}

export interface BacklinkRefDomainRow {
  kind: "ref_domains";
  domain: string;
  backlinks: number | null;
  domainScore: number | null;
  ipAddress: string | null;
  country: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  follow: boolean | null;
  isNew: boolean;
  isLost: boolean;
}

export interface BacklinkAnchorRow {
  kind: "anchors";
  anchor: string;
  backlinks: number | null;
  referringDomains: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface BacklinkPageRow {
  kind: "pages";
  url: string;
  title: string | null;
  responseCode: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export type BacklinkRow =
  | BacklinkLinkRow
  | BacklinkRefDomainRow
  | BacklinkAnchorRow
  | BacklinkPageRow;

export interface BacklinkListResult {
  target: string;
  scope: BacklinkScope;
  dataset: BacklinkDataset;
  rows: BacklinkRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: string;
  direction: "asc" | "desc";
  provenance: {
    provider: typeof BACKLINK_PROVIDER;
    fetchedAt: string;
    expiresAt: string;
    cached: boolean;
    requestId: string | null;
  };
}

export interface ProviderResult<T> {
  data: T;
  requestId: string | null;
  effectiveTarget: string | null;
  total?: number;
}
