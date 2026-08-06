import { createHash } from "node:crypto";
import { and, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  backlinkImportedLinks,
  backlinkImportStaging,
  backlinkListCaches,
  backlinkReportCaches,
  backlinkSnapshots,
  type BacklinkImportStage,
  type BacklinkListCache,
  type BacklinkReportCache,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId } from "@/lib/ids";
import {
  BACKLINK_CACHE_RETENTION_MS,
  BACKLINK_CACHE_TTL_MS,
  BACKLINK_COMMON_CRAWL_PROVIDER,
  BACKLINK_IMPORT_TTL_MS,
  BACKLINK_REFRESH_LEASE_MS,
  type BacklinkDataset,
  type BacklinkInboundLinkRow,
  type BacklinkProvider,
  type BacklinkScope,
} from "@/server/backlinks/contracts";

export type RefreshLease =
  | { kind: "fresh"; row: BacklinkReportCache }
  | { kind: "busy"; row: BacklinkReportCache }
  | { kind: "acquired"; row: BacklinkReportCache };

export async function findBacklinkReportCache(
  workspaceId: string,
  target: string,
  scope: BacklinkScope,
  provider?: BacklinkProvider,
): Promise<BacklinkReportCache | undefined> {
  const filters = [
    eq(backlinkReportCaches.workspaceId, workspaceId),
    eq(backlinkReportCaches.target, target),
    eq(backlinkReportCaches.scope, scope),
    provider
      ? eq(backlinkReportCaches.provider, provider)
      : or(
        eq(backlinkReportCaches.provider, "bing-webmaster"),
        eq(backlinkReportCaches.provider, "bing-csv"),
        eq(backlinkReportCaches.provider, BACKLINK_COMMON_CRAWL_PROVIDER),
      )!,
  ];
  const [row] = await db.select().from(backlinkReportCaches)
    .where(and(...filters)).orderBy(desc(backlinkReportCaches.updatedAt)).limit(1);
  return row;
}

function hasReportPayload(row: BacklinkReportCache): boolean {
  return Boolean(row.overviewPayload && row.historyPayload && row.scoreProfilePayload && row.fetchedAt);
}

export function isFreshReport(row: BacklinkReportCache, now = new Date()): boolean {
  return row.status === "ready" && hasReportPayload(row) && Boolean(row.expiresAt && row.expiresAt > now);
}

export async function acquireBacklinkRefreshLease(input: {
  workspaceId: string;
  target: string;
  scope: BacklinkScope;
  provider: BacklinkProvider;
  mode: "if-stale" | "force";
  now?: Date;
}): Promise<RefreshLease> {
  const now = input.now ?? new Date();
  const current = await findBacklinkReportCache(input.workspaceId, input.target, input.scope, input.provider);
  if (current && input.mode === "if-stale" && isFreshReport(current, now)) return { kind: "fresh", row: current };
  if (current?.status === "refreshing" && current.refreshLeaseUntil && current.refreshLeaseUntil > now) {
    return { kind: "busy", row: current };
  }
  const leaseUntil = new Date(now.getTime() + BACKLINK_REFRESH_LEASE_MS);
  if (current) {
    const [claimed] = await db.update(backlinkReportCaches).set({
      status: "refreshing", refreshLeaseUntil: leaseUntil, lastErrorCode: null, lastErrorMessage: null, updatedAt: now,
    }).where(and(
      eq(backlinkReportCaches.id, current.id),
      or(ne(backlinkReportCaches.status, "refreshing"), isNull(backlinkReportCaches.refreshLeaseUntil), lt(backlinkReportCaches.refreshLeaseUntil, now)),
    )).returning();
    if (!claimed) return { kind: "busy", row: (await findBacklinkReportCache(input.workspaceId, input.target, input.scope, input.provider)) ?? current };
    return { kind: "acquired", row: claimed };
  }
  try {
    const [created] = await db.insert(backlinkReportCaches).values({
      id: newId("blr"), workspaceId: input.workspaceId, target: input.target, scope: input.scope,
      provider: input.provider, status: "refreshing", refreshLeaseUntil: leaseUntil, createdAt: now, updatedAt: now,
    }).returning();
    return { kind: "acquired", row: created };
  } catch (error) {
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error;
    const raced = await findBacklinkReportCache(input.workspaceId, input.target, input.scope, input.provider);
    if (!raced) throw error;
    return { kind: "busy", row: raced };
  }
}

export async function saveBacklinkReportSuccess(input: {
  id: string; effectiveTarget: string; overviewPayload: string; historyPayload: string;
  scoreProfilePayload: string; requestIdsPayload?: string; fetchedAt?: Date; ttlMs?: number;
}): Promise<BacklinkReportCache> {
  const fetchedAt = input.fetchedAt ?? new Date();
  const [row] = await db.update(backlinkReportCaches).set({
    status: "ready", effectiveTarget: input.effectiveTarget, overviewPayload: input.overviewPayload,
    historyPayload: input.historyPayload, scoreProfilePayload: input.scoreProfilePayload,
    requestIdsPayload: input.requestIdsPayload ?? "[]", fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + (input.ttlMs ?? BACKLINK_CACHE_TTL_MS)), refreshLeaseUntil: null,
    lastErrorCode: null, lastErrorMessage: null, updatedAt: fetchedAt,
  }).where(eq(backlinkReportCaches.id, input.id)).returning();
  await db.delete(backlinkListCaches).where(eq(backlinkListCaches.reportId, input.id));
  return row;
}

export async function saveBacklinkReportFailure(id: string, code: string, message: string): Promise<void> {
  await db.update(backlinkReportCaches).set({
    status: "failed", refreshLeaseUntil: null, lastErrorCode: code.slice(0, 80),
    lastErrorMessage: message.slice(0, 500), updatedAt: new Date(),
  }).where(eq(backlinkReportCaches.id, id));
}

export function backlinkQueryHash(serialized: string): string {
  return createHash("sha256").update(serialized).digest("hex");
}

export async function findFreshBacklinkListCache(reportId: string, queryHash: string, now = new Date()): Promise<BacklinkListCache | undefined> {
  const [row] = await db.select().from(backlinkListCaches)
    .where(and(eq(backlinkListCaches.reportId, reportId), eq(backlinkListCaches.queryHash, queryHash))).limit(1);
  return row?.expiresAt && row.expiresAt > now ? row : undefined;
}

export async function saveBacklinkListCache(input: {
  reportId: string; dataset: BacklinkDataset; queryHash: string; queryPayload: string;
  rowsPayload: string; total: number; requestId: string | null; fetchedAt?: Date;
}): Promise<BacklinkListCache> {
  const fetchedAt = input.fetchedAt ?? new Date();
  const expiresAt = new Date(fetchedAt.getTime() + BACKLINK_CACHE_TTL_MS);
  const [row] = await db.insert(backlinkListCaches).values({ id: newId("bll"), ...input, fetchedAt, expiresAt })
    .onConflictDoUpdate({ target: [backlinkListCaches.reportId, backlinkListCaches.queryHash], set: {
      queryPayload: input.queryPayload, rowsPayload: input.rowsPayload, total: input.total,
      requestId: input.requestId, fetchedAt, expiresAt,
    }}).returning();
  return row;
}

export async function saveBacklinkSnapshot(input: {
  workspaceId: string; siteUrl: string; scope: BacklinkScope; targetUrl: string | null;
  provider: BacklinkProvider; totalInboundLinks: number | null; linkedPages: number | null; capturedAt?: Date;
}): Promise<void> {
  const capturedAt = input.capturedAt ?? new Date();
  const snapshotDate = capturedAt.toISOString().slice(0, 10);
  const targetUrl = input.targetUrl ?? "";
  await db.insert(backlinkSnapshots).values({ id: newId("bls"), ...input, targetUrl, snapshotDate, capturedAt })
    .onConflictDoUpdate({ target: [backlinkSnapshots.workspaceId, backlinkSnapshots.siteUrl, backlinkSnapshots.scope,
      backlinkSnapshots.targetUrl, backlinkSnapshots.provider, backlinkSnapshots.snapshotDate], set: {
        totalInboundLinks: input.totalInboundLinks, linkedPages: input.linkedPages, capturedAt,
      }});
}

export async function listBacklinkSnapshots(input: {
  workspaceId: string; siteUrl: string; scope: BacklinkScope; targetUrl: string | null; provider: BacklinkProvider;
}) {
  return db.select().from(backlinkSnapshots).where(and(
    eq(backlinkSnapshots.workspaceId, input.workspaceId), eq(backlinkSnapshots.siteUrl, input.siteUrl),
    eq(backlinkSnapshots.scope, input.scope), eq(backlinkSnapshots.targetUrl, input.targetUrl ?? ""),
    eq(backlinkSnapshots.provider, input.provider),
  )).orderBy(backlinkSnapshots.snapshotDate);
}

export async function saveBacklinkImportStage(input: {
  workspaceId: string; fileName: string; fileSha256: string; rawPayload: string;
  headersPayload: string; detectedMappingPayload: string; rowCount: number; now?: Date;
}): Promise<BacklinkImportStage> {
  const now = input.now ?? new Date();
  const [row] = await db.insert(backlinkImportStaging).values({
    id: newId("bli"), ...input, expiresAt: new Date(now.getTime() + BACKLINK_IMPORT_TTL_MS), createdAt: now,
  }).returning();
  return row;
}

export async function getBacklinkImportStage(workspaceId: string, id: string, now = new Date()): Promise<BacklinkImportStage> {
  const [row] = await db.select().from(backlinkImportStaging)
    .where(and(eq(backlinkImportStaging.id, id), eq(backlinkImportStaging.workspaceId, workspaceId))).limit(1);
  if (!row || row.expiresAt <= now) throw new ApiError("NOT_FOUND", "CSV 미리보기가 만료되었습니다. 파일을 다시 선택해 주세요.");
  return row;
}

export async function deleteBacklinkImportStage(id: string): Promise<void> {
  await db.delete(backlinkImportStaging).where(eq(backlinkImportStaging.id, id));
}

export async function replaceImportedBacklinks(reportId: string, rows: BacklinkInboundLinkRow[]): Promise<void> {
  db.transaction((tx) => {
    tx.delete(backlinkImportedLinks).where(eq(backlinkImportedLinks.reportId, reportId)).run();
    for (let offset = 0; offset < rows.length; offset += 250) {
      tx.insert(backlinkImportedLinks).values(rows.slice(offset, offset + 250).map((row) => ({
        id: newId("bil"), reportId, sourceUrl: row.sourceUrl, targetUrl: row.targetUrl,
        sourceDomain: row.sourceDomain, anchor: row.anchor, linkCount: row.linkCount,
      }))).run();
    }
  });
}

export async function listImportedBacklinks(reportId: string): Promise<BacklinkInboundLinkRow[]> {
  const rows = await db.select().from(backlinkImportedLinks).where(eq(backlinkImportedLinks.reportId, reportId));
  return rows.map((row) => ({ kind: "inbound_links", sourceUrl: row.sourceUrl, targetUrl: row.targetUrl,
    sourceDomain: row.sourceDomain, anchor: row.anchor, linkCount: row.linkCount }));
}

/** 30일 보존 상한과 30분 미리보기 TTL을 함께 정리한다. */
export async function cleanupExpiredBacklinkCaches(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - BACKLINK_CACHE_RETENTION_MS);
  await db.delete(backlinkImportStaging).where(lt(backlinkImportStaging.expiresAt, now));
  await db.delete(backlinkListCaches).where(lt(backlinkListCaches.fetchedAt, cutoff));
  await db.delete(backlinkReportCaches).where(lt(backlinkReportCaches.updatedAt, cutoff));
}
