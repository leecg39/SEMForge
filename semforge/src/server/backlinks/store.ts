import { createHash } from "node:crypto";
import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  backlinkListCaches,
  backlinkReportCaches,
  type BacklinkListCache,
  type BacklinkReportCache,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  BACKLINK_CACHE_RETENTION_MS,
  BACKLINK_CACHE_TTL_MS,
  BACKLINK_PROVIDER,
  BACKLINK_REFRESH_LEASE_MS,
  type BacklinkDataset,
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
): Promise<BacklinkReportCache | undefined> {
  const [row] = await db
    .select()
    .from(backlinkReportCaches)
    .where(
      and(
        eq(backlinkReportCaches.workspaceId, workspaceId),
        eq(backlinkReportCaches.target, target),
        eq(backlinkReportCaches.scope, scope),
        eq(backlinkReportCaches.provider, BACKLINK_PROVIDER),
      ),
    )
    .limit(1);
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
  mode: "if-stale" | "force";
  now?: Date;
}): Promise<RefreshLease> {
  const now = input.now ?? new Date();
  const current = await findBacklinkReportCache(input.workspaceId, input.target, input.scope);
  if (current && input.mode === "if-stale" && isFreshReport(current, now)) {
    return { kind: "fresh", row: current };
  }
  if (
    current?.status === "refreshing" &&
    current.refreshLeaseUntil &&
    current.refreshLeaseUntil > now
  ) {
    return { kind: "busy", row: current };
  }

  const leaseUntil = new Date(now.getTime() + BACKLINK_REFRESH_LEASE_MS);
  if (current) {
    const [claimed] = await db
      .update(backlinkReportCaches)
      .set({
        status: "refreshing",
        refreshLeaseUntil: leaseUntil,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(backlinkReportCaches.id, current.id),
          or(
            ne(backlinkReportCaches.status, "refreshing"),
            isNull(backlinkReportCaches.refreshLeaseUntil),
            lt(backlinkReportCaches.refreshLeaseUntil, now),
          ),
        ),
      )
      .returning();
    if (!claimed) {
      return {
        kind: "busy",
        row: (await findBacklinkReportCache(input.workspaceId, input.target, input.scope)) ?? current,
      };
    }
    return { kind: "acquired", row: claimed };
  }

  try {
    const [created] = await db
      .insert(backlinkReportCaches)
      .values({
        id: newId("blr"),
        workspaceId: input.workspaceId,
        target: input.target,
        scope: input.scope,
        provider: BACKLINK_PROVIDER,
        status: "refreshing",
        refreshLeaseUntil: leaseUntil,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { kind: "acquired", row: created };
  } catch (error) {
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) {
      throw error;
    }
    const raced = await findBacklinkReportCache(input.workspaceId, input.target, input.scope);
    if (!raced) throw error;
    return { kind: "busy", row: raced };
  }
}

export async function saveBacklinkReportSuccess(input: {
  id: string;
  effectiveTarget: string;
  overviewPayload: string;
  historyPayload: string;
  scoreProfilePayload: string;
  requestIdsPayload: string;
  fetchedAt?: Date;
}): Promise<BacklinkReportCache> {
  const fetchedAt = input.fetchedAt ?? new Date();
  const [row] = await db
    .update(backlinkReportCaches)
    .set({
      status: "ready",
      effectiveTarget: input.effectiveTarget,
      overviewPayload: input.overviewPayload,
      historyPayload: input.historyPayload,
      scoreProfilePayload: input.scoreProfilePayload,
      requestIdsPayload: input.requestIdsPayload,
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + BACKLINK_CACHE_TTL_MS),
      refreshLeaseUntil: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: fetchedAt,
    })
    .where(eq(backlinkReportCaches.id, input.id))
    .returning();
  await db.delete(backlinkListCaches).where(eq(backlinkListCaches.reportId, input.id));
  return row;
}

export async function saveBacklinkReportFailure(
  id: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(backlinkReportCaches)
    .set({
      status: "failed",
      refreshLeaseUntil: null,
      lastErrorCode: errorCode.slice(0, 80),
      lastErrorMessage: errorMessage.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(backlinkReportCaches.id, id));
}

export function backlinkQueryHash(serializedQuery: string): string {
  return createHash("sha256").update(serializedQuery).digest("hex");
}

export async function findFreshBacklinkListCache(
  reportId: string,
  queryHash: string,
  now = new Date(),
): Promise<BacklinkListCache | undefined> {
  const [row] = await db
    .select()
    .from(backlinkListCaches)
    .where(
      and(
        eq(backlinkListCaches.reportId, reportId),
        eq(backlinkListCaches.queryHash, queryHash),
      ),
    )
    .limit(1);
  return row?.expiresAt && row.expiresAt > now ? row : undefined;
}

export async function saveBacklinkListCache(input: {
  reportId: string;
  dataset: BacklinkDataset;
  queryHash: string;
  queryPayload: string;
  rowsPayload: string;
  total: number;
  requestId: string | null;
  fetchedAt?: Date;
}): Promise<BacklinkListCache> {
  const fetchedAt = input.fetchedAt ?? new Date();
  const expiresAt = new Date(fetchedAt.getTime() + BACKLINK_CACHE_TTL_MS);
  const [row] = await db
    .insert(backlinkListCaches)
    .values({
      id: newId("bll"),
      ...input,
      fetchedAt,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [backlinkListCaches.reportId, backlinkListCaches.queryHash],
      set: {
        queryPayload: input.queryPayload,
        rowsPayload: input.rowsPayload,
        total: input.total,
        requestId: input.requestId,
        fetchedAt,
        expiresAt,
      },
    })
    .returning();
  return row;
}

/** API 약관의 1개월 캐시 상한보다 오래된 행을 작은 배치로 정리한다. */
export async function cleanupExpiredBacklinkCaches(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - BACKLINK_CACHE_RETENTION_MS);
  await db.delete(backlinkListCaches).where(lt(backlinkListCaches.fetchedAt, cutoff));
  await db.delete(backlinkReportCaches).where(lt(backlinkReportCaches.updatedAt, cutoff));
}

