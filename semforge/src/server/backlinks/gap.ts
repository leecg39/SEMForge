import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { backlinkImportedLinks, backlinkReportCaches, folders } from "@/db/schema";
import type { AuthContext } from "@/lib/session";
import { commonCrawlConnectionStatus } from "@/server/backlinks/common-crawl";
import {
  BACKLINK_COMMON_CRAWL_PROVIDER,
  BACKLINK_CSV_PROVIDER,
  type BacklinkInboundLinkRow,
  type BacklinkProvider,
} from "@/server/backlinks/contracts";
import { refreshBacklinkReport } from "@/server/backlinks/service";
import { listImportedBacklinks } from "@/server/backlinks/store";
import { normalizeBacklinkSiteUrl } from "@/server/backlinks/target";

const siteInputSchema = z.string().trim().min(1).max(2000);

export const backlinkGapRequestSchema = z.object({
  ownSiteUrl: siteInputSchema,
  competitorSiteUrls: z.array(siteInputSchema).min(1).max(4),
  collect: z.boolean().default(true),
}).superRefine((value, context) => {
  try {
    const own = canonicalDomain(value.ownSiteUrl);
    const competitors = value.competitorSiteUrls.map(canonicalDomain);
    if (competitors.includes(own)) {
      context.addIssue({ code: "custom", path: ["competitorSiteUrls"], message: "내 도메인은 경쟁 도메인에서 제외해 주세요." });
    }
    if (new Set(competitors).size !== competitors.length) {
      context.addIssue({ code: "custom", path: ["competitorSiteUrls"], message: "중복된 경쟁 도메인을 제거해 주세요." });
    }
  } catch {
    // URL 형식 오류는 실제 정규화 단계에서 일관된 API 오류로 반환한다.
  }
});

export type BacklinkGapRequest = z.infer<typeof backlinkGapRequestSchema>;

export interface BacklinkGapCachedDataset {
  siteUrl: string;
  provider: "common-crawl" | "bing-csv";
  fetchedAt: string;
  rowCount: number;
}

export interface BacklinkGapBootstrap {
  sources: {
    commonCrawl: { enabled: boolean; reason: string };
    csv: { enabled: true; reason: string };
  };
  folders: Array<{ id: string; name: string; domain: string }>;
  cachedDatasets: BacklinkGapCachedDataset[];
}

export interface BacklinkGapDatasetStatus {
  siteUrl: string;
  domain: string;
  role: "own" | "competitor";
  status: "ready" | "missing" | "failed";
  provider: "common-crawl" | "bing-csv" | null;
  fetchedAt: string | null;
  rowCount: number;
  message: string | null;
}

export interface BacklinkGapOpportunity {
  sourceDomain: string;
  competitors: string[];
  competitorCount: number;
  linkCount: number;
  sourceUrl: string;
  targetUrl: string;
  anchor: string | null;
}

export interface BacklinkGapResult {
  state: "ready" | "needs_data";
  ownSiteUrl: string;
  competitorSiteUrls: string[];
  summary: {
    ownReferringDomains: number;
    competitorReferringDomains: number;
    opportunities: number;
    sharedByMultipleCompetitors: number;
    comparedDatasets: number;
  };
  datasets: BacklinkGapDatasetStatus[];
  rows: BacklinkGapOpportunity[];
  warning: string | null;
}

function canonicalDomain(value: string): string {
  return new URL(normalizeBacklinkSiteUrl(value)).hostname.toLowerCase().replace(/^www\./, "");
}

function sourceDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

async function listCachedDatasets(workspaceId: string): Promise<BacklinkGapCachedDataset[]> {
  const rows = await db.select({
    siteUrl: backlinkReportCaches.target,
    provider: backlinkReportCaches.provider,
    fetchedAt: backlinkReportCaches.fetchedAt,
    rowCount: sql<number>`count(${backlinkImportedLinks.id})`,
  })
    .from(backlinkReportCaches)
    .leftJoin(backlinkImportedLinks, eq(backlinkImportedLinks.reportId, backlinkReportCaches.id))
    .where(and(
      eq(backlinkReportCaches.workspaceId, workspaceId),
      eq(backlinkReportCaches.scope, "site"),
      eq(backlinkReportCaches.status, "ready"),
      or(
        eq(backlinkReportCaches.provider, BACKLINK_COMMON_CRAWL_PROVIDER),
        eq(backlinkReportCaches.provider, BACKLINK_CSV_PROVIDER),
      ),
    ))
    .groupBy(backlinkReportCaches.id)
    .orderBy(desc(backlinkReportCaches.updatedAt));

  return rows.flatMap((row) => {
    if (!row.fetchedAt || (row.provider !== BACKLINK_COMMON_CRAWL_PROVIDER && row.provider !== BACKLINK_CSV_PROVIDER)) return [];
    return [{
      siteUrl: row.siteUrl,
      provider: row.provider,
      fetchedAt: row.fetchedAt.toISOString(),
      rowCount: Number(row.rowCount),
    }];
  });
}

export async function backlinkGapBootstrap(auth: AuthContext): Promise<BacklinkGapBootstrap> {
  const [folderRows, cachedDatasets] = await Promise.all([
    db.select({ id: folders.id, name: folders.name, domain: folders.domain })
      .from(folders)
      .where(and(eq(folders.workspaceId, auth.workspaceId), isNull(folders.deletedAt)))
      .orderBy(desc(folders.pinned), folders.name),
    listCachedDatasets(auth.workspaceId),
  ]);
  const commonCrawl = commonCrawlConnectionStatus();
  return {
    sources: {
      commonCrawl: { enabled: commonCrawl.configured, reason: commonCrawl.reason },
      csv: { enabled: true, reason: "Bing Webmaster 또는 다른 백링크 도구에서 내보낸 URL 단위 CSV를 사용할 수 있습니다." },
    },
    folders: folderRows,
    cachedDatasets,
  };
}

type LoadedDataset = {
  status: BacklinkGapDatasetStatus;
  rows: BacklinkInboundLinkRow[];
};

async function latestStoredDataset(
  auth: AuthContext,
  rawSiteUrl: string,
  role: "own" | "competitor",
  collectionError: string | null,
): Promise<LoadedDataset> {
  const siteUrl = normalizeBacklinkSiteUrl(rawSiteUrl);
  const [report] = await db.select().from(backlinkReportCaches)
    .where(and(
      eq(backlinkReportCaches.workspaceId, auth.workspaceId),
      eq(backlinkReportCaches.target, siteUrl),
      eq(backlinkReportCaches.scope, "site"),
      eq(backlinkReportCaches.status, "ready"),
      or(
        eq(backlinkReportCaches.provider, BACKLINK_COMMON_CRAWL_PROVIDER),
        eq(backlinkReportCaches.provider, BACKLINK_CSV_PROVIDER),
      ),
    ))
    .orderBy(desc(backlinkReportCaches.updatedAt))
    .limit(1);

  if (!report || !report.fetchedAt) {
    return {
      status: {
        siteUrl,
        domain: canonicalDomain(siteUrl),
        role,
        status: collectionError ? "failed" : "missing",
        provider: null,
        fetchedAt: null,
        rowCount: 0,
        message: collectionError ?? "저장된 URL 단위 백링크 데이터가 없습니다.",
      },
      rows: [],
    };
  }
  const provider = report.provider as BacklinkProvider;
  const rows = await listImportedBacklinks(report.id);
  return {
    status: {
      siteUrl,
      domain: canonicalDomain(siteUrl),
      role,
      status: "ready",
      provider: provider === BACKLINK_COMMON_CRAWL_PROVIDER ? BACKLINK_COMMON_CRAWL_PROVIDER : BACKLINK_CSV_PROVIDER,
      fetchedAt: report.fetchedAt.toISOString(),
      rowCount: rows.length,
      message: collectionError ? `자동 수집 실패로 저장 데이터를 사용했습니다: ${collectionError}` : null,
    },
    rows,
  };
}

async function collectSite(auth: AuthContext, siteUrl: string): Promise<string | null> {
  try {
    await refreshBacklinkReport(auth, {
      siteUrl,
      targetUrl: null,
      scope: "site",
      mode: "if-stale",
      provider: BACKLINK_COMMON_CRAWL_PROVIDER,
      limit: 500,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Common Crawl 수집에 실패했습니다.";
  }
}

export async function analyzeBacklinkGap(auth: AuthContext, input: BacklinkGapRequest): Promise<BacklinkGapResult> {
  const ownSiteUrl = normalizeBacklinkSiteUrl(input.ownSiteUrl);
  const competitorSiteUrls = input.competitorSiteUrls.map(normalizeBacklinkSiteUrl);
  const sourceStatus = commonCrawlConnectionStatus();
  const allSites = [ownSiteUrl, ...competitorSiteUrls];
  const collectionErrors = input.collect && sourceStatus.configured
    ? await Promise.all(allSites.map((siteUrl) => collectSite(auth, siteUrl)))
    : allSites.map(() => null);
  const datasets = await Promise.all(allSites.map((siteUrl, index) => latestStoredDataset(
    auth,
    siteUrl,
    index === 0 ? "own" : "competitor",
    collectionErrors[index],
  )));

  const ownDataset = datasets[0];
  const competitorDatasets = datasets.slice(1).filter((dataset) => dataset.status.status === "ready");
  const ownSources = new Set(ownDataset.rows.map((row) => sourceDomain(row.sourceDomain)));
  const competitorSources = new Set<string>();
  const opportunities = new Map<string, {
    competitors: Set<string>;
    linkCount: number;
    sourceUrl: string;
    targetUrl: string;
    anchor: string | null;
  }>();

  for (const dataset of competitorDatasets) {
    const competitor = dataset.status.domain;
    for (const row of dataset.rows) {
      const domain = sourceDomain(row.sourceDomain);
      if (!domain) continue;
      competitorSources.add(domain);
      if (ownSources.has(domain)) continue;
      const current = opportunities.get(domain) ?? {
        competitors: new Set<string>(),
        linkCount: 0,
        sourceUrl: row.sourceUrl,
        targetUrl: row.targetUrl,
        anchor: row.anchor,
      };
      current.competitors.add(competitor);
      current.linkCount += row.linkCount;
      opportunities.set(domain, current);
    }
  }

  const rows = [...opportunities.entries()].map(([domain, value]) => ({
    sourceDomain: domain,
    competitors: [...value.competitors].sort(),
    competitorCount: value.competitors.size,
    linkCount: value.linkCount,
    sourceUrl: value.sourceUrl,
    targetUrl: value.targetUrl,
    anchor: value.anchor,
  })).sort((left, right) => right.competitorCount - left.competitorCount
    || right.linkCount - left.linkCount
    || left.sourceDomain.localeCompare(right.sourceDomain));

  const comparedDatasets = datasets.filter((dataset) => dataset.status.status === "ready").length;
  const state = ownDataset.status.status === "ready" && competitorDatasets.length > 0 ? "ready" : "needs_data";
  const missing = datasets.filter((dataset) => dataset.status.status !== "ready").map((dataset) => dataset.status.domain);
  const setupWarning = !sourceStatus.configured && input.collect
    ? "Common Crawl 자동 수집기가 설정되지 않아 워크스페이스에 저장된 CSV 또는 캐시만 비교했습니다."
    : null;
  const missingWarning = missing.length > 0 ? `데이터가 없는 도메인: ${missing.join(", ")}` : null;

  return {
    state,
    ownSiteUrl,
    competitorSiteUrls,
    summary: {
      ownReferringDomains: ownSources.size,
      competitorReferringDomains: competitorSources.size,
      opportunities: rows.length,
      sharedByMultipleCompetitors: rows.filter((row) => row.competitorCount > 1).length,
      comparedDatasets,
    },
    datasets: datasets.map((dataset) => dataset.status),
    rows: rows.slice(0, 1000),
    warning: [setupWarning, missingWarning].filter(Boolean).join(" ") || null,
  };
}
