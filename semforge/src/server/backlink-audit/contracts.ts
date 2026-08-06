import { z } from "zod";

export const AUDIT_LINK_LIMITS = [100, 500, 1000] as const;
export const AUDIT_PAGE_SIZE = 25;

export const auditRiskLevelSchema = z.enum(["unscored", "low", "medium", "high"]);
export type AuditRiskLevel = z.infer<typeof auditRiskLevelSchema>;

export const auditStatusSchema = z.enum(["unverified", "active", "missing", "unavailable"]);
export type AuditStatus = z.infer<typeof auditStatusSchema>;

export const auditReviewStatusSchema = z.enum([
  "pending",
  "safe",
  "watch",
  "remove",
  "disavow",
  "ignore",
]);
export type AuditReviewStatus = z.infer<typeof auditReviewStatusSchema>;

export const auditLinkTypeSchema = z.enum(["text", "image", "form", "frame", "unknown"]);
export type AuditLinkType = z.infer<typeof auditLinkTypeSchema>;

export const auditProjectCreateSchema = z.object({
  reportId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120).optional(),
  maxLinks: z.union([z.literal(100), z.literal(500), z.literal(1000)]).default(100),
});
export type AuditProjectCreateInput = z.infer<typeof auditProjectCreateSchema>;

export const auditRunCreateSchema = z.object({
  maxLinks: z.union([z.literal(100), z.literal(500), z.literal(1000)]).default(100),
});

const nullableQueryEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess((value) => value === "" || value === undefined ? undefined : value, z.enum(values).optional());

export const auditLinksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(40_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(AUDIT_PAGE_SIZE),
  search: z.string().trim().max(200).default(""),
  riskLevel: nullableQueryEnum(["unscored", "low", "medium", "high"]),
  auditStatus: nullableQueryEnum(["unverified", "active", "missing", "unavailable"]),
  reviewStatus: nullableQueryEnum(["pending", "safe", "watch", "remove", "disavow", "ignore"]),
  change: nullableQueryEnum(["new", "lost"]),
  sort: z.enum(["risk", "source", "domain", "target", "checked", "created"]).default("risk"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type AuditLinksQuery = z.infer<typeof auditLinksQuerySchema>;

export const auditReviewInputSchema = z.object({
  linkIds: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
  decision: auditReviewStatusSchema,
  note: z.string().trim().max(1000).nullable().optional(),
});

export const removalCreateSchema = z.object({
  linkId: z.string().trim().min(1).max(100),
  contact: z.string().trim().max(320).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const removalUpdateSchema = z.object({
  id: z.string().trim().min(1).max(100),
  status: z.enum(["pending", "contacted", "removed", "failed"]),
  contact: z.string().trim().max(320).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  followUpAt: z.string().datetime().nullable().optional(),
});

export const disavowEntryCreateSchema = z.object({
  linkId: z.string().trim().min(1).max(100).nullable().optional(),
  kind: z.enum(["url", "domain"]),
  value: z.string().trim().min(1).max(2048),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const disavowEntryDeleteSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export interface AuditSignal {
  code:
    | "target_http_error"
    | "source_link_missing"
    | "domain_concentration"
    | "repeated_anchor";
  label: string;
  severity: "notice" | "warning" | "high";
  weight: number;
  evidence: string;
}

export interface AuditSourceOption {
  reportId: string;
  siteUrl: string;
  provider: "bing-webmaster" | "bing-csv" | "common-crawl";
  totalInboundLinks: number | null;
  linkedPages: number | null;
  fetchedAt: string;
  stale: boolean;
  partial: boolean;
}

export interface AuditProjectSummary {
  id: string;
  name: string;
  siteUrl: string;
  sourceProvider: "bing-webmaster" | "bing-csv" | "common-crawl";
  sourceReportId: string | null;
  status: "ready" | "queued" | "running" | "failed";
  lastCollectedAt: string | null;
  lastErrorMessage: string | null;
  totalLinks: number;
  pendingLinks: number;
  riskyLinks: number;
  latestRun: AuditRunSummary | null;
}

export interface AuditRunSummary {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  requestedLinks: number;
  discoveredLinks: number;
  processedLinks: number;
  activeLinks: number;
  missingLinks: number;
  unavailableLinks: number;
  riskyLinks: number;
  inventoryPartial: boolean;
  warningMessage: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AuditLinkItem {
  id: string;
  sourceUrl: string;
  finalSourceUrl: string | null;
  targetUrl: string;
  sourceDomain: string;
  providerAnchor: string | null;
  observedAnchor: string | null;
  linkCount: number;
  sourceStatus: number | null;
  targetStatus: number | null;
  auditStatus: AuditStatus;
  linkType: AuditLinkType;
  isFollow: boolean | null;
  isNofollow: boolean | null;
  isSponsored: boolean | null;
  isUgc: boolean | null;
  riskLevel: AuditRiskLevel;
  riskScore: number;
  confidence: "low" | "medium" | "high";
  signals: AuditSignal[];
  fetchError: string | null;
  reviewStatus: AuditReviewStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastCheckedAt: string | null;
}

export interface AuditOverview {
  project: AuditProjectSummary;
  totals: {
    links: number;
    sourceDomains: number;
    targetPages: number;
    active: number;
    missing: number;
    unavailable: number;
    unverified: number;
    pending: number;
    highRisk: number;
    mediumRisk: number;
    reviewed: number;
    follow: number;
    nofollow: number;
    sponsored: number;
    ugc: number;
  };
  riskDistribution: Array<{ level: AuditRiskLevel; count: number }>;
  auditDistribution: Array<{ status: AuditStatus; count: number }>;
  reviewDistribution: Array<{ status: AuditReviewStatus; count: number }>;
  topDomains: Array<{
    domain: string;
    totalLinks: number;
    activeLinks: number;
    riskyLinks: number;
    unreviewedLinks: number;
    topAnchor: string | null;
  }>;
  topAnchors: Array<{ anchor: string; count: number }>;
  topTargets: Array<{
    targetUrl: string;
    links: number;
    sourceDomains: number;
    brokenLinks: number;
    status: number | null;
  }>;
  changes: { newLinks: number | null; lostLinks: number | null; comparable: boolean };
}
