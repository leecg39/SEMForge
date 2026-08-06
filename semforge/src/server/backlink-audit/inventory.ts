import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { backlinkReportCaches, type BacklinkAuditProjectRow } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import type { AuditSourceOption } from "@/server/backlink-audit/contracts";
import type { BacklinkInboundLinkRow, BacklinkTargetPageRow } from "@/server/backlinks/contracts";
import { queryBacklinkList } from "@/server/backlinks/service";
import { listImportedBacklinks } from "@/server/backlinks/store";

interface ReportDetailsPayload {
  topTargetPages?: BacklinkTargetPageRow[];
  partial?: boolean;
  warning?: string | null;
}

function json<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function reportOverview(value: string | null): { totalInboundLinks?: number | null; linkedPages?: number | null } {
  return json(value, {});
}

export async function listAuditSources(auth: AuthContext): Promise<AuditSourceOption[]> {
  const rows = await db
    .select()
    .from(backlinkReportCaches)
    .where(and(
      eq(backlinkReportCaches.workspaceId, auth.workspaceId),
      or(
        eq(backlinkReportCaches.provider, "bing-webmaster"),
        eq(backlinkReportCaches.provider, "bing-csv"),
        eq(backlinkReportCaches.provider, "common-crawl"),
      ),
      isNotNull(backlinkReportCaches.fetchedAt),
    ))
    .orderBy(desc(backlinkReportCaches.updatedAt));
  return rows.flatMap((row) => {
    if (!row.fetchedAt || (row.provider !== "bing-webmaster" && row.provider !== "bing-csv" && row.provider !== "common-crawl")) return [];
    const overview = reportOverview(row.overviewPayload);
    const details = json<ReportDetailsPayload>(row.scoreProfilePayload, {});
    const siteUrl = row.effectiveTarget ?? (row.scope === "site" ? row.target : null);
    if (!siteUrl) return [];
    return [{
      reportId: row.id,
      siteUrl,
      provider: row.provider,
      totalInboundLinks: overview.totalInboundLinks ?? null,
      linkedPages: overview.linkedPages ?? null,
      fetchedAt: row.fetchedAt.toISOString(),
      stale: !row.expiresAt || row.expiresAt.getTime() <= Date.now(),
      partial: Boolean(details.partial),
    } satisfies AuditSourceOption];
  });
}

export interface CollectedAuditInventory {
  rows: BacklinkInboundLinkRow[];
  partial: boolean;
  warning: string | null;
}

function dedupeRows(rows: BacklinkInboundLinkRow[], limit: number): BacklinkInboundLinkRow[] {
  const deduped = new Map<string, BacklinkInboundLinkRow>();
  for (const row of rows) {
    const key = `${row.sourceUrl}\u0000${row.targetUrl}\u0000${row.anchor ?? ""}`;
    const current = deduped.get(key);
    if (!current || row.linkCount > current.linkCount) deduped.set(key, row);
    if (deduped.size >= limit) break;
  }
  return [...deduped.values()];
}

export async function collectAuditInventory(
  auth: AuthContext,
  project: BacklinkAuditProjectRow,
  limit: number,
): Promise<CollectedAuditInventory> {
  if (!project.sourceReportId) {
    throw new ApiError("NOT_FOUND", "원본 백링크 보고서가 만료되었습니다. 새 분석 결과로 감사 프로젝트를 다시 연결해 주세요.");
  }
  const [report] = await db
    .select()
    .from(backlinkReportCaches)
    .where(and(
      eq(backlinkReportCaches.id, project.sourceReportId),
      eq(backlinkReportCaches.workspaceId, auth.workspaceId),
    ))
    .limit(1);
  if (!report || !report.fetchedAt || !report.overviewPayload) {
    throw new ApiError("NOT_FOUND", "사용할 수 있는 백링크 분석 결과가 없습니다.");
  }
  if (report.provider !== project.sourceProvider) {
    throw new ApiError("VERSION_CONFLICT", "감사 프로젝트의 데이터 출처가 변경되었습니다.");
  }

  if (report.provider === "bing-csv" || report.provider === "common-crawl") {
    const all = await listImportedBacklinks(report.id);
    return {
      rows: dedupeRows(all, limit),
      partial: all.length > limit,
      warning: all.length > limit
        ? `${report.provider === "common-crawl" ? "Common Crawl" : "CSV"}의 앞 ${limit.toLocaleString()}개 링크만 감사했습니다.`
        : report.provider === "common-crawl"
          ? "Common Crawl 후보를 Firecrawl로 다시 확인했습니다. 공개 크롤 범위 밖의 링크는 포함되지 않을 수 있습니다."
          : null,
    };
  }

  const details = json<ReportDetailsPayload>(report.scoreProfilePayload, {});
  const targetPages = details.topTargetPages ?? [];
  const scope = report.scope === "page" ? "page" as const : "site" as const;
  const targetUrl = scope === "page" ? report.target : null;
  const collected: BacklinkInboundLinkRow[] = [];
  let truncated = false;

  outer: for (const targetPage of targetPages) {
    let page = 1;
    for (;;) {
      const result = await queryBacklinkList(auth, {
        siteUrl: project.siteUrl,
        targetUrl,
        scope,
        provider: "bing-webmaster",
        dataset: "inbound_links",
        targetPage: targetPage.url,
        page,
        pageSize: 25,
        sort: "source_url",
        direction: "asc",
        filters: { search: "" },
      });
      collected.push(...result.rows.filter((row): row is BacklinkInboundLinkRow => row.kind === "inbound_links"));
      if (collected.length >= limit) {
        truncated = page < result.totalPages || targetPages.indexOf(targetPage) < targetPages.length - 1;
        break outer;
      }
      if (page >= result.totalPages || result.rows.length === 0) break;
      page += 1;
    }
  }
  const rows = dedupeRows(collected, limit);
  return {
    rows,
    partial: truncated || Boolean(details.partial),
    warning: truncated
      ? `Bing이 반환한 링크 중 앞 ${limit.toLocaleString()}개만 감사했습니다.`
      : details.warning ?? (rows.length === 0 ? "Bing이 감사할 인바운드 링크를 반환하지 않았습니다." : null),
  };
}
