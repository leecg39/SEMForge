import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  backlinkAuditDomainRollups,
  backlinkAuditLinks,
  backlinkAuditProjects,
  backlinkAuditReviews,
  backlinkAuditRuns,
  backlinkDisavowEntries,
  backlinkRemovalRequests,
  type BacklinkAuditLinkRow,
  type BacklinkAuditProjectRow,
  type BacklinkAuditRunRow,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import { assertSameWorkspace } from "@/lib/rbac";
import type { AuthContext } from "@/lib/session";
import type {
  AuditLinkItem,
  AuditLinksQuery,
  AuditOverview,
  AuditProjectCreateInput,
  AuditProjectSummary,
  AuditReviewStatus,
  AuditRunSummary,
  AuditSignal,
} from "@/server/backlink-audit/contracts";
import { collectLinkEvidence, type AuditScraper } from "@/server/backlink-audit/enrichment";
import { collectAuditInventory, listAuditSources, type CollectedAuditInventory } from "@/server/backlink-audit/inventory";
import { assessBacklinkRisk } from "@/server/backlink-audit/risk-rules";
import { firecrawlScrapeHtml } from "@/server/firecrawl/client";

const PROGRESS_BATCH_SIZE = 3;

function parseSignals(payload: string): AuditSignal[] {
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed as AuditSignal[] : [];
  } catch {
    return [];
  }
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).trim().slice(0, 500)
    || "백링크 감사 실행에 실패했습니다.";
}

function runSummary(run: BacklinkAuditRunRow | null | undefined): AuditRunSummary | null {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    requestedLinks: run.requestedLinks,
    discoveredLinks: run.discoveredLinks,
    processedLinks: run.processedLinks,
    activeLinks: run.activeLinks,
    missingLinks: run.missingLinks,
    unavailableLinks: run.unavailableLinks,
    riskyLinks: run.riskyLinks,
    inventoryPartial: run.inventoryPartial,
    warningMessage: run.warningMessage,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

async function latestRun(projectId: string): Promise<BacklinkAuditRunRow | null> {
  const [run] = await db.select().from(backlinkAuditRuns)
    .where(eq(backlinkAuditRuns.projectId, projectId))
    .orderBy(desc(backlinkAuditRuns.createdAt)).limit(1);
  return run ?? null;
}

async function projectCounts(projectId: string): Promise<{ total: number; pending: number; risky: number }> {
  const rows = await db.select({
    reviewStatus: backlinkAuditLinks.reviewStatus,
    riskLevel: backlinkAuditLinks.riskLevel,
  }).from(backlinkAuditLinks).where(eq(backlinkAuditLinks.projectId, projectId));
  return {
    total: rows.length,
    pending: rows.filter((row) => row.reviewStatus === "pending").length,
    risky: rows.filter((row) => row.riskLevel === "high" || row.riskLevel === "medium").length,
  };
}

async function summarizeProject(project: BacklinkAuditProjectRow): Promise<AuditProjectSummary> {
  const [run, counts] = await Promise.all([latestRun(project.id), projectCounts(project.id)]);
  return {
    id: project.id,
    name: project.name,
    siteUrl: project.siteUrl,
    sourceProvider: project.sourceProvider,
    sourceReportId: project.sourceReportId,
    status: project.status,
    lastCollectedAt: project.lastCollectedAt?.toISOString() ?? null,
    lastErrorMessage: project.lastErrorMessage,
    totalLinks: counts.total,
    pendingLinks: counts.pending,
    riskyLinks: counts.risky,
    latestRun: runSummary(run),
  };
}

export async function listBacklinkAuditSources(auth: AuthContext) {
  return listAuditSources(auth);
}

export async function listBacklinkAuditProjects(auth: AuthContext): Promise<AuditProjectSummary[]> {
  const projects = await db.select().from(backlinkAuditProjects)
    .where(and(eq(backlinkAuditProjects.workspaceId, auth.workspaceId), isNull(backlinkAuditProjects.deletedAt)))
    .orderBy(desc(backlinkAuditProjects.updatedAt));
  return Promise.all(projects.map(summarizeProject));
}

export async function getBacklinkAuditProject(auth: AuthContext, id: string): Promise<BacklinkAuditProjectRow> {
  const [project] = await db.select().from(backlinkAuditProjects)
    .where(and(eq(backlinkAuditProjects.id, id), isNull(backlinkAuditProjects.deletedAt))).limit(1);
  assertSameWorkspace(auth, project, "백링크 감사 프로젝트");
  return project;
}

export async function createBacklinkAuditProject(
  auth: AuthContext,
  input: AuditProjectCreateInput,
): Promise<AuditProjectSummary> {
  const sources = await listAuditSources(auth);
  const source = sources.find((item) => item.reportId === input.reportId);
  if (!source) throw new ApiError("NOT_FOUND", "선택한 백링크 분석 결과를 찾을 수 없습니다.");
  const defaultName = `${new URL(source.siteUrl).hostname} 백링크 감사`;
  const now = new Date();
  const [existing] = await db.select().from(backlinkAuditProjects).where(and(
    eq(backlinkAuditProjects.workspaceId, auth.workspaceId),
    eq(backlinkAuditProjects.siteUrl, source.siteUrl),
    eq(backlinkAuditProjects.sourceProvider, source.provider),
  )).limit(1);
  let project: BacklinkAuditProjectRow;
  if (existing) {
    [project] = await db.update(backlinkAuditProjects).set({
      sourceReportId: source.reportId,
      name: input.name ?? existing.name,
      status: "ready",
      lastErrorMessage: null,
      deletedAt: null,
      updatedAt: now,
    }).where(eq(backlinkAuditProjects.id, existing.id)).returning();
  } else {
    [project] = await db.insert(backlinkAuditProjects).values({
      id: newId("bap"),
      workspaceId: auth.workspaceId,
      sourceReportId: source.reportId,
      sourceProvider: source.provider,
      name: input.name ?? defaultName,
      siteUrl: source.siteUrl,
      status: "ready",
      createdBy: auth.userId,
      createdAt: now,
      updatedAt: now,
    }).returning();
  }
  return summarizeProject(project);
}

export async function enqueueBacklinkAuditRun(
  auth: AuthContext,
  projectId: string,
  requestedLinks: 100 | 500 | 1000,
): Promise<AuditRunSummary> {
  const project = await getBacklinkAuditProject(auth, projectId);
  if (!project.sourceReportId) {
    throw new ApiError("NOT_FOUND", "원본 백링크 보고서가 만료되었습니다. 백링크 분석에서 새 보고서를 연결해 주세요.");
  }
  const [active] = await db.select({ id: backlinkAuditRuns.id }).from(backlinkAuditRuns)
    .where(and(
      eq(backlinkAuditRuns.projectId, project.id),
      inArray(backlinkAuditRuns.status, ["queued", "running"]),
    )).limit(1);
  if (active) throw new ApiError("VERSION_CONFLICT", "이미 백링크 감사가 준비 중이거나 실행 중입니다.");
  const now = new Date();
  const [run] = await db.insert(backlinkAuditRuns).values({
    id: newId("bar"),
    workspaceId: auth.workspaceId,
    projectId: project.id,
    status: "queued",
    requestedLinks,
    heartbeatAt: now,
    createdBy: auth.userId,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await db.update(backlinkAuditProjects).set({ status: "queued", lastErrorMessage: null, updatedAt: now })
    .where(eq(backlinkAuditProjects.id, project.id));
  return runSummary(run)!;
}

function fingerprint(row: { sourceUrl: string; targetUrl: string; anchor: string | null }): string {
  return createHash("sha256").update(`${row.sourceUrl}\u0000${row.targetUrl}\u0000${row.anchor ?? ""}`).digest("hex");
}

async function saveInventory(
  auth: AuthContext,
  project: BacklinkAuditProjectRow,
  run: BacklinkAuditRunRow,
  inventory: CollectedAuditInventory,
  now: Date,
): Promise<BacklinkAuditLinkRow[]> {
  for (const row of inventory.rows) {
    await db.insert(backlinkAuditLinks).values({
      id: newId("bal"),
      workspaceId: auth.workspaceId,
      projectId: project.id,
      lastRunId: run.id,
      fingerprint: fingerprint(row),
      sourceUrl: row.sourceUrl,
      targetUrl: row.targetUrl,
      sourceDomain: row.sourceDomain,
      providerAnchor: row.anchor,
      linkCount: row.linkCount,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [backlinkAuditLinks.projectId, backlinkAuditLinks.fingerprint],
      set: {
        lastRunId: run.id,
        sourceUrl: row.sourceUrl,
        targetUrl: row.targetUrl,
        sourceDomain: row.sourceDomain,
        providerAnchor: row.anchor,
        linkCount: row.linkCount,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
  }
  return db.select().from(backlinkAuditLinks).where(and(
    eq(backlinkAuditLinks.projectId, project.id),
    eq(backlinkAuditLinks.lastRunId, run.id),
  )).orderBy(asc(backlinkAuditLinks.createdAt));
}

function auditScraper(dependency: AuditScraper | null | undefined): AuditScraper | null {
  if (dependency !== undefined) return dependency;
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) return null;
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ApiError("VALIDATION_ERROR", "감사 대상은 공개 HTTP/HTTPS URL이어야 합니다.");
    }
    if (parsed.hostname === "localhost" || /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(parsed.hostname)) {
      throw new ApiError("VALIDATION_ERROR", "내부 네트워크 주소는 감사할 수 없습니다.");
    }
    const result = await firecrawlScrapeHtml(url, apiKey);
    return { ...result, error: result.status >= 400 ? `HTTP ${result.status}` : null };
  };
}

function domainMetrics(rows: BacklinkAuditLinkRow[]) {
  const domainCount = new Map<string, number>();
  const anchorCount = new Map<string, number>();
  const domainAnchors = new Map<string, Set<string>>();
  for (const row of rows) {
    domainCount.set(row.sourceDomain, (domainCount.get(row.sourceDomain) ?? 0) + row.linkCount);
    const anchor = (row.providerAnchor ?? "").trim().toLocaleLowerCase();
    if (!anchor) continue;
    const key = `${row.sourceDomain}\u0000${anchor}`;
    anchorCount.set(key, (anchorCount.get(key) ?? 0) + row.linkCount);
    const values = domainAnchors.get(row.sourceDomain) ?? new Set<string>();
    values.add(anchor);
    domainAnchors.set(row.sourceDomain, values);
  }
  return { domainCount, anchorCount, domainAnchors };
}

async function rebuildDomainRollups(auth: AuthContext, projectId: string): Promise<void> {
  const rows = await db.select().from(backlinkAuditLinks).where(eq(backlinkAuditLinks.projectId, projectId));
  const grouped = new Map<string, BacklinkAuditLinkRow[]>();
  for (const row of rows) grouped.set(row.sourceDomain, [...(grouped.get(row.sourceDomain) ?? []), row]);
  await db.delete(backlinkAuditDomainRollups).where(eq(backlinkAuditDomainRollups.projectId, projectId));
  const now = new Date();
  for (const [domain, links] of grouped) {
    const anchors = new Map<string, number>();
    for (const link of links) {
      const anchor = (link.observedAnchor ?? link.providerAnchor ?? "").trim();
      if (anchor) anchors.set(anchor, (anchors.get(anchor) ?? 0) + link.linkCount);
    }
    const topAnchor = [...anchors].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    await db.insert(backlinkAuditDomainRollups).values({
      id: newId("bad"),
      workspaceId: auth.workspaceId,
      projectId,
      sourceDomain: domain,
      totalLinks: links.reduce((sum, link) => sum + link.linkCount, 0),
      activeLinks: links.filter((link) => link.auditStatus === "active").length,
      riskyLinks: links.filter((link) => link.riskLevel === "medium" || link.riskLevel === "high").length,
      unreviewedLinks: links.filter((link) => link.reviewStatus === "pending").length,
      topAnchor,
      updatedAt: now,
    });
  }
}

export async function executeBacklinkAuditRun(
  auth: AuthContext,
  runId: string,
  dependencies?: {
    inventory?: (auth: AuthContext, project: BacklinkAuditProjectRow, limit: number) => Promise<CollectedAuditInventory>;
    scraper?: AuditScraper | null;
  },
): Promise<{ status: "completed" | "failed"; message: string }> {
  const [joined] = await db.select({ run: backlinkAuditRuns, project: backlinkAuditProjects })
    .from(backlinkAuditRuns)
    .innerJoin(backlinkAuditProjects, eq(backlinkAuditProjects.id, backlinkAuditRuns.projectId))
    .where(eq(backlinkAuditRuns.id, runId)).limit(1);
  if (!joined || joined.run.workspaceId !== auth.workspaceId || joined.project.deletedAt) {
    throw new ApiError("NOT_FOUND", "백링크 감사 실행을 찾을 수 없습니다.");
  }
  const startedAt = new Date();
  const claimed = await db.update(backlinkAuditRuns).set({
    status: "running", startedAt, heartbeatAt: startedAt, updatedAt: startedAt, errorMessage: null,
  }).where(and(eq(backlinkAuditRuns.id, runId), eq(backlinkAuditRuns.status, "queued")))
    .returning({ id: backlinkAuditRuns.id });
  if (claimed.length === 0) {
    const current = await getBacklinkAuditRun(auth, runId);
    return { status: current.status === "completed" ? "completed" : "failed", message: current.errorMessage ?? `실행 상태: ${current.status}` };
  }
  const { project } = joined;
  const scraper = auditScraper(dependencies?.scraper);
  try {
    const inventory = await (dependencies?.inventory ?? collectAuditInventory)(auth, project, joined.run.requestedLinks);
    const rows = await saveInventory(auth, project, joined.run, inventory, startedAt);
    await db.update(backlinkAuditRuns).set({
      discoveredLinks: rows.length,
      inventoryPartial: inventory.partial,
      warningMessage: [inventory.warning, !scraper ? "Firecrawl 키가 없어 링크 상태는 확인 불가로 저장했습니다." : null].filter(Boolean).join(" ") || null,
      heartbeatAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(backlinkAuditRuns.id, runId));

    const metrics = domainMetrics(rows);
    const targetStatusCache = new Map<string, Promise<number | null>>();
    const targetStatus = (url: string): Promise<number | null> => {
      const current = targetStatusCache.get(url);
      if (current) return current;
      const pending = scraper
        ? scraper(url).then((result) => result.status || null).catch(() => null)
        : Promise.resolve(null);
      targetStatusCache.set(url, pending);
      return pending;
    };
    let active = 0;
    let missing = 0;
    let unavailable = 0;
    let risky = 0;
    for (let offset = 0; offset < rows.length; offset += PROGRESS_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + PROGRESS_BATCH_SIZE);
      const evaluated = await Promise.all(batch.map(async (row) => {
        const [evidence, targetHttpStatus] = await Promise.all([
          collectLinkEvidence({ sourceUrl: row.sourceUrl, targetUrl: row.targetUrl, scraper }),
          targetStatus(row.targetUrl),
        ]);
        const anchor = (evidence.observedAnchor ?? row.providerAnchor ?? "").trim().toLocaleLowerCase();
        const risk = assessBacklinkRisk({
          auditStatus: evidence.auditStatus,
          targetStatus: targetHttpStatus,
          sourceDomain: row.sourceDomain,
          providerAnchor: row.providerAnchor,
          observedAnchor: evidence.observedAnchor,
          domainLinkCount: metrics.domainCount.get(row.sourceDomain) ?? row.linkCount,
          anchorOccurrenceCount: anchor ? metrics.anchorCount.get(`${row.sourceDomain}\u0000${anchor}`) ?? row.linkCount : 0,
          domainDistinctAnchorCount: metrics.domainAnchors.get(row.sourceDomain)?.size ?? 0,
        });
        const checkedAt = new Date();
        await db.update(backlinkAuditLinks).set({
          finalSourceUrl: evidence.finalSourceUrl,
          sourceStatus: evidence.sourceStatus,
          targetStatus: targetHttpStatus,
          auditStatus: evidence.auditStatus,
          observedAnchor: evidence.observedAnchor,
          linkType: evidence.linkType,
          isFollow: evidence.isFollow,
          isNofollow: evidence.isNofollow,
          isSponsored: evidence.isSponsored,
          isUgc: evidence.isUgc,
          riskLevel: risk.riskLevel,
          riskScore: risk.riskScore,
          confidence: risk.confidence,
          signalsPayload: JSON.stringify(risk.signals),
          fetchError: evidence.fetchError,
          lastCheckedAt: checkedAt,
          updatedAt: checkedAt,
        }).where(eq(backlinkAuditLinks.id, row.id));
        return { evidence, risk };
      }));
      active += evaluated.filter((item) => item.evidence.auditStatus === "active").length;
      missing += evaluated.filter((item) => item.evidence.auditStatus === "missing").length;
      unavailable += evaluated.filter((item) => item.evidence.auditStatus === "unavailable").length;
      risky += evaluated.filter((item) => item.risk.riskLevel === "medium" || item.risk.riskLevel === "high").length;
      const now = new Date();
      await db.update(backlinkAuditRuns).set({
        processedLinks: Math.min(rows.length, offset + batch.length),
        activeLinks: active,
        missingLinks: missing,
        unavailableLinks: unavailable,
        riskyLinks: risky,
        heartbeatAt: now,
        updatedAt: now,
      }).where(eq(backlinkAuditRuns.id, runId));
    }
    await rebuildDomainRollups(auth, project.id);
    const finishedAt = new Date();
    await Promise.all([
      db.update(backlinkAuditRuns).set({
        status: "completed",
        finishedAt,
        heartbeatAt: finishedAt,
        updatedAt: finishedAt,
      }).where(eq(backlinkAuditRuns.id, runId)),
      db.update(backlinkAuditProjects).set({
        status: "ready",
        lastCollectedAt: finishedAt,
        lastErrorMessage: null,
        updatedAt: finishedAt,
      }).where(eq(backlinkAuditProjects.id, project.id)),
    ]);
    return { status: "completed", message: `${rows.length.toLocaleString()}개 링크 중 활성 ${active}, 누락 ${missing}, 확인 불가 ${unavailable}` };
  } catch (error) {
    const message = safeMessage(error);
    const finishedAt = new Date();
    await Promise.all([
      db.update(backlinkAuditRuns).set({
        status: "failed", errorMessage: message, finishedAt, heartbeatAt: finishedAt, updatedAt: finishedAt,
      }).where(eq(backlinkAuditRuns.id, runId)),
      db.update(backlinkAuditProjects).set({
        status: "failed", lastErrorMessage: message, updatedAt: finishedAt,
      }).where(eq(backlinkAuditProjects.id, project.id)),
    ]);
    return { status: "failed", message };
  }
}

export async function getBacklinkAuditRun(auth: AuthContext, runId: string): Promise<AuditRunSummary> {
  const [run] = await db.select().from(backlinkAuditRuns).where(eq(backlinkAuditRuns.id, runId)).limit(1);
  assertSameWorkspace(auth, run, "백링크 감사 실행");
  return runSummary(run)!;
}

function linkItem(row: BacklinkAuditLinkRow): AuditLinkItem {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    finalSourceUrl: row.finalSourceUrl,
    targetUrl: row.targetUrl,
    sourceDomain: row.sourceDomain,
    providerAnchor: row.providerAnchor,
    observedAnchor: row.observedAnchor,
    linkCount: row.linkCount,
    sourceStatus: row.sourceStatus,
    targetStatus: row.targetStatus,
    auditStatus: row.auditStatus,
    linkType: row.linkType,
    isFollow: row.isFollow,
    isNofollow: row.isNofollow,
    isSponsored: row.isSponsored,
    isUgc: row.isUgc,
    riskLevel: row.riskLevel,
    riskScore: row.riskScore,
    confidence: row.confidence,
    signals: parseSignals(row.signalsPayload),
    fetchError: row.fetchError,
    reviewStatus: row.reviewStatus,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  };
}

async function completedRuns(projectId: string): Promise<BacklinkAuditRunRow[]> {
  return db.select().from(backlinkAuditRuns).where(and(
    eq(backlinkAuditRuns.projectId, projectId), eq(backlinkAuditRuns.status, "completed"),
  )).orderBy(desc(backlinkAuditRuns.createdAt));
}

export async function listBacklinkAuditLinks(auth: AuthContext, projectId: string, query: AuditLinksQuery) {
  await getBacklinkAuditProject(auth, projectId);
  const runs = await completedRuns(projectId);
  const comparable = runs.length >= 2;
  const latestStarted = runs[0]?.startedAt ?? runs[0]?.createdAt ?? null;
  let rows = await db.select().from(backlinkAuditLinks).where(eq(backlinkAuditLinks.projectId, projectId));
  const search = query.search.toLocaleLowerCase();
  rows = rows.filter((row) => {
    if (query.riskLevel && row.riskLevel !== query.riskLevel) return false;
    if (query.auditStatus && row.auditStatus !== query.auditStatus) return false;
    if (query.reviewStatus && row.reviewStatus !== query.reviewStatus) return false;
    if (query.change && !comparable) return false;
    if (query.change === "new" && latestStarted && row.firstSeenAt < latestStarted) return false;
    if (query.change === "lost" && row.auditStatus !== "missing") return false;
    if (search && ![row.sourceUrl, row.targetUrl, row.sourceDomain, row.observedAnchor ?? row.providerAnchor ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(search))) return false;
    return true;
  });
  const factor = query.direction === "asc" ? 1 : -1;
  const value = (row: BacklinkAuditLinkRow): string | number => {
    if (query.sort === "source") return row.sourceUrl;
    if (query.sort === "domain") return row.sourceDomain;
    if (query.sort === "target") return row.targetUrl;
    if (query.sort === "checked") return row.lastCheckedAt?.getTime() ?? 0;
    if (query.sort === "created") return row.createdAt.getTime();
    return row.riskScore;
  };
  rows.sort((a, b) => {
    const left = value(a); const right = value(b);
    return typeof left === "number" && typeof right === "number"
      ? (left - right) * factor
      : String(left).localeCompare(String(right)) * factor;
  });
  const total = rows.length;
  const start = (query.page - 1) * query.pageSize;
  return {
    rows: rows.slice(start, start + query.pageSize).map(linkItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    comparableChanges: comparable,
  };
}

export async function getBacklinkAuditOverview(auth: AuthContext, projectId: string): Promise<AuditOverview> {
  const project = await getBacklinkAuditProject(auth, projectId);
  const [summary, links, rollups, runs] = await Promise.all([
    summarizeProject(project),
    db.select().from(backlinkAuditLinks).where(eq(backlinkAuditLinks.projectId, projectId)),
    db.select().from(backlinkAuditDomainRollups).where(eq(backlinkAuditDomainRollups.projectId, projectId))
      .orderBy(desc(backlinkAuditDomainRollups.totalLinks)).limit(10),
    completedRuns(projectId),
  ]);
  const sourceDomains = new Set(links.map((link) => link.sourceDomain));
  const targetPages = new Set(links.map((link) => link.targetUrl));
  const counts = <T extends string>(values: T[], keys: readonly T[]) => keys.map((key) => ({
    [key === "high" || key === "low" || key === "medium" || key === "unscored" ? "level" : key === "unverified" || key === "active" || key === "missing" || key === "unavailable" ? "status" : "status"]: key,
    count: values.filter((value) => value === key).length,
  })) as Array<Record<string, T | number>>;
  const anchors = new Map<string, number>();
  const targets = new Map<string, { links: number; domains: Set<string>; broken: number; status: number | null }>();
  for (const link of links) {
    const anchor = (link.observedAnchor ?? link.providerAnchor ?? "").trim();
    if (anchor) anchors.set(anchor, (anchors.get(anchor) ?? 0) + link.linkCount);
    const target = targets.get(link.targetUrl) ?? { links: 0, domains: new Set<string>(), broken: 0, status: link.targetStatus };
    target.links += link.linkCount;
    target.domains.add(link.sourceDomain);
    if (link.targetStatus && link.targetStatus >= 400) target.broken += 1;
    if (target.status === null && link.targetStatus !== null) target.status = link.targetStatus;
    targets.set(link.targetUrl, target);
  }
  const comparable = runs.length >= 2;
  const latestStarted = runs[0]?.startedAt ?? runs[0]?.createdAt ?? null;
  const newLinks = comparable && latestStarted ? links.filter((link) => link.firstSeenAt >= latestStarted).length : null;
  const lostLinks = comparable ? links.filter((link) => link.auditStatus === "missing").length : null;
  return {
    project: summary,
    totals: {
      links: links.length,
      sourceDomains: sourceDomains.size,
      targetPages: targetPages.size,
      active: links.filter((link) => link.auditStatus === "active").length,
      missing: links.filter((link) => link.auditStatus === "missing").length,
      unavailable: links.filter((link) => link.auditStatus === "unavailable").length,
      unverified: links.filter((link) => link.auditStatus === "unverified").length,
      pending: links.filter((link) => link.reviewStatus === "pending").length,
      highRisk: links.filter((link) => link.riskLevel === "high").length,
      mediumRisk: links.filter((link) => link.riskLevel === "medium").length,
      reviewed: links.filter((link) => link.reviewStatus !== "pending").length,
      follow: links.filter((link) => link.isFollow === true).length,
      nofollow: links.filter((link) => link.isNofollow === true).length,
      sponsored: links.filter((link) => link.isSponsored === true).length,
      ugc: links.filter((link) => link.isUgc === true).length,
    },
    riskDistribution: counts(links.map((link) => link.riskLevel), ["high", "medium", "low", "unscored"] as const) as AuditOverview["riskDistribution"],
    auditDistribution: counts(links.map((link) => link.auditStatus), ["active", "missing", "unavailable", "unverified"] as const) as AuditOverview["auditDistribution"],
    reviewDistribution: counts(links.map((link) => link.reviewStatus), ["pending", "safe", "watch", "remove", "disavow", "ignore"] as const) as AuditOverview["reviewDistribution"],
    topDomains: rollups.map((row) => ({
      domain: row.sourceDomain,
      totalLinks: row.totalLinks,
      activeLinks: row.activeLinks,
      riskyLinks: row.riskyLinks,
      unreviewedLinks: row.unreviewedLinks,
      topAnchor: row.topAnchor,
    })),
    topAnchors: [...anchors].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([anchor, count]) => ({ anchor, count })),
    topTargets: [...targets].sort((a, b) => b[1].links - a[1].links).slice(0, 10).map(([targetUrl, value]) => ({
      targetUrl, links: value.links, sourceDomains: value.domains.size, brokenLinks: value.broken, status: value.status,
    })),
    changes: { newLinks, lostLinks, comparable },
  };
}

export async function updateBacklinkAuditReviews(auth: AuthContext, projectId: string, input: {
  linkIds: string[]; decision: AuditReviewStatus; note?: string | null;
}) {
  await getBacklinkAuditProject(auth, projectId);
  const links = await db.select().from(backlinkAuditLinks).where(and(
    eq(backlinkAuditLinks.projectId, projectId), inArray(backlinkAuditLinks.id, input.linkIds),
  ));
  if (links.length !== new Set(input.linkIds).size) throw new ApiError("NOT_FOUND", "선택한 백링크 중 찾을 수 없는 항목이 있습니다.");
  const reviewedAt = new Date();
  for (const link of links) {
    await db.update(backlinkAuditLinks).set({ reviewStatus: input.decision, updatedAt: reviewedAt })
      .where(eq(backlinkAuditLinks.id, link.id));
    await db.insert(backlinkAuditReviews).values({
      id: newId("bav"), workspaceId: auth.workspaceId, projectId, linkId: link.id,
      decision: input.decision, note: input.note ?? null, reviewedBy: auth.userId, reviewedAt,
    });
    if (input.decision === "remove") {
      await db.insert(backlinkRemovalRequests).values({
        id: newId("brr"), workspaceId: auth.workspaceId, projectId, linkId: link.id,
        status: "pending", note: input.note ?? null, createdBy: auth.userId, createdAt: reviewedAt, updatedAt: reviewedAt,
      }).onConflictDoUpdate({
        target: [backlinkRemovalRequests.projectId, backlinkRemovalRequests.linkId],
        set: { note: input.note ?? null, updatedAt: reviewedAt },
      });
    }
    if (input.decision === "disavow") {
      await db.insert(backlinkDisavowEntries).values({
        id: newId("bde"), workspaceId: auth.workspaceId, projectId, linkId: link.id,
        kind: "url", value: link.sourceUrl, reason: input.note ?? null, createdBy: auth.userId, createdAt: reviewedAt,
      }).onConflictDoNothing();
    }
  }
  await rebuildDomainRollups(auth, projectId);
  return { updated: links.length, decision: input.decision };
}

export async function listBacklinkRemovalRequests(auth: AuthContext, projectId: string) {
  await getBacklinkAuditProject(auth, projectId);
  const rows = await db.select({ request: backlinkRemovalRequests, link: backlinkAuditLinks })
    .from(backlinkRemovalRequests)
    .innerJoin(backlinkAuditLinks, eq(backlinkAuditLinks.id, backlinkRemovalRequests.linkId))
    .where(eq(backlinkRemovalRequests.projectId, projectId))
    .orderBy(desc(backlinkRemovalRequests.updatedAt));
  return rows.map(({ request, link }) => ({
    id: request.id,
    linkId: link.id,
    sourceUrl: link.sourceUrl,
    targetUrl: link.targetUrl,
    sourceDomain: link.sourceDomain,
    status: request.status,
    contact: request.contact,
    note: request.note,
    lastContactedAt: request.lastContactedAt?.toISOString() ?? null,
    followUpAt: request.followUpAt?.toISOString() ?? null,
    updatedAt: request.updatedAt.toISOString(),
  }));
}

export async function createBacklinkRemovalRequest(auth: AuthContext, projectId: string, input: {
  linkId: string; contact?: string | null; note?: string | null;
}) {
  await getBacklinkAuditProject(auth, projectId);
  const [link] = await db.select().from(backlinkAuditLinks).where(and(
    eq(backlinkAuditLinks.id, input.linkId), eq(backlinkAuditLinks.projectId, projectId),
  )).limit(1);
  if (!link) throw new ApiError("NOT_FOUND", "백링크를 찾을 수 없습니다.");
  const now = new Date();
  const [row] = await db.insert(backlinkRemovalRequests).values({
    id: newId("brr"), workspaceId: auth.workspaceId, projectId, linkId: link.id,
    status: "pending", contact: input.contact ?? null, note: input.note ?? null,
    createdBy: auth.userId, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [backlinkRemovalRequests.projectId, backlinkRemovalRequests.linkId],
    set: { contact: input.contact ?? null, note: input.note ?? null, updatedAt: now },
  }).returning();
  await db.update(backlinkAuditLinks).set({ reviewStatus: "remove", updatedAt: now }).where(eq(backlinkAuditLinks.id, link.id));
  return { id: row.id, status: row.status };
}

export async function updateBacklinkRemovalRequest(auth: AuthContext, projectId: string, input: {
  id: string; status: "pending" | "contacted" | "removed" | "failed";
  contact?: string | null; note?: string | null; followUpAt?: string | null;
}) {
  await getBacklinkAuditProject(auth, projectId);
  const [current] = await db.select().from(backlinkRemovalRequests).where(and(
    eq(backlinkRemovalRequests.id, input.id), eq(backlinkRemovalRequests.projectId, projectId),
  )).limit(1);
  if (!current) throw new ApiError("NOT_FOUND", "삭제 요청을 찾을 수 없습니다.");
  const now = new Date();
  const [row] = await db.update(backlinkRemovalRequests).set({
    status: input.status,
    contact: input.contact === undefined ? current.contact : input.contact,
    note: input.note === undefined ? current.note : input.note,
    followUpAt: input.followUpAt === undefined ? current.followUpAt : input.followUpAt ? new Date(input.followUpAt) : null,
    lastContactedAt: input.status === "contacted" ? now : current.lastContactedAt,
    updatedAt: now,
  }).where(eq(backlinkRemovalRequests.id, current.id)).returning();
  if (input.status === "removed") {
    await db.update(backlinkAuditLinks).set({ reviewStatus: "safe", updatedAt: now }).where(eq(backlinkAuditLinks.id, current.linkId));
  }
  return { id: row.id, status: row.status, updatedAt: row.updatedAt.toISOString() };
}
