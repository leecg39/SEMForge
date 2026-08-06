import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  folders,
  marketingConnections,
  marketingOauthStates,
  marketingPropertyBindings,
  marketingReportSnapshots,
  marketingSyncRuns,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { newId, newToken } from "@/lib/ids";
import type { MarketingProvider } from "./contracts";
import type { MarketingControlPort, StoredMarketingConnection } from "./ports";

function toStored(row: typeof marketingConnections.$inferSelect): StoredMarketingConnection {
  return {
    id: row.id, workspaceId: row.workspaceId, provider: row.provider, status: row.status,
    airbyteSourceId: row.airbyteSourceId, airbyteConnectionId: row.airbyteConnectionId, rawNamespace: row.rawNamespace,
    lastAttemptedAt: row.lastAttemptedAt,
    lastSucceededAt: row.lastSucceededAt, errorCode: row.errorCode,
  };
}

export class SqliteMarketingControlAdapter implements MarketingControlPort {
  async assertFolder(workspaceId: string, folderId: string): Promise<void> {
    const [row] = await db.select({ id: folders.id }).from(folders).where(and(
      eq(folders.id, folderId), eq(folders.workspaceId, workspaceId), isNull(folders.deletedAt),
    )).limit(1);
    if (!row) throw new ApiError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }

  async listConnections(workspaceId: string, folderId: string): Promise<StoredMarketingConnection[]> {
    const bindings = await db.select({ connectionId: marketingPropertyBindings.connectionId })
      .from(marketingPropertyBindings).where(and(
        eq(marketingPropertyBindings.workspaceId, workspaceId),
        eq(marketingPropertyBindings.folderId, folderId),
        isNull(marketingPropertyBindings.deletedAt),
      ));
    if (bindings.length === 0) return [];
    const ids = [...new Set(bindings.map((row) => row.connectionId))];
    const rows = await db.select().from(marketingConnections).where(and(
      eq(marketingConnections.workspaceId, workspaceId), inArray(marketingConnections.id, ids),
    ));
    return rows.map(toStored);
  }

  async getConnection(workspaceId: string, connectionId: string): Promise<StoredMarketingConnection | null> {
    const [row] = await db.select().from(marketingConnections).where(and(
      eq(marketingConnections.id, connectionId), eq(marketingConnections.workspaceId, workspaceId),
    )).limit(1);
    return row ? toStored(row) : null;
  }

  async createSyncRun(input: { workspaceId: string; connectionId: string; airbyteJobId: string }): Promise<void> {
    const inserted = await db.insert(marketingSyncRuns).values({
      id: newId("msr"), workspaceId: input.workspaceId, connectionId: input.connectionId,
      airbyteJobId: input.airbyteJobId, status: "pending",
    }).onConflictDoNothing();
    if (Number(inserted.changes ?? 0) === 0) return;
    await db.update(marketingConnections).set({
      status: "syncing", lastAttemptedAt: new Date(), updatedAt: new Date(), errorCode: null, errorMessage: null,
    }).where(and(eq(marketingConnections.id, input.connectionId), eq(marketingConnections.workspaceId, input.workspaceId)));
  }

  async disconnect(workspaceId: string, connectionId: string): Promise<void> {
    const now = new Date();
    db.transaction((tx) => {
      tx.update(marketingPropertyBindings).set({ deletedAt: now }).where(and(
        eq(marketingPropertyBindings.workspaceId, workspaceId), eq(marketingPropertyBindings.connectionId, connectionId),
        isNull(marketingPropertyBindings.deletedAt),
      )).run();
      tx.update(marketingConnections).set({
        status: "disconnected", disconnectedAt: now, updatedAt: now,
        airbyteConnectionId: null, airbyteSourceId: null, airbyteWorkspaceId: null,
        airbyteDestinationId: null, rawNamespace: null,
      }).where(and(eq(marketingConnections.workspaceId, workspaceId), eq(marketingConnections.id, connectionId))).run();
    });
  }
}

export async function findAirbyteWorkspace(workspaceId: string): Promise<{ workspaceId: string; destinationId: string | null } | null> {
  const [row] = await db.select({
    workspaceId: marketingConnections.airbyteWorkspaceId,
    destinationId: marketingConnections.airbyteDestinationId,
  }).from(marketingConnections).where(and(
    eq(marketingConnections.workspaceId, workspaceId),
    isNull(marketingConnections.disconnectedAt),
  )).limit(1);
  return row?.workspaceId ? { workspaceId: row.workspaceId, destinationId: row.destinationId } : null;
}

export async function saveProvisionedConnection(input: {
  workspaceId: string;
  folderId: string;
  provider: MarketingProvider;
  airbyteWorkspaceId: string;
  airbyteSourceId: string;
  airbyteDestinationId: string;
  airbyteConnectionId: string;
  rawNamespace: string;
  externalPropertyId?: string;
  displayName?: string;
}): Promise<string> {
  const id = newId("mkt");
  db.transaction((tx) => {
    tx.insert(marketingConnections).values({
      id, workspaceId: input.workspaceId, provider: input.provider,
      airbyteWorkspaceId: input.airbyteWorkspaceId, airbyteSourceId: input.airbyteSourceId,
      airbyteDestinationId: input.airbyteDestinationId, airbyteConnectionId: input.airbyteConnectionId,
      rawNamespace: input.rawNamespace, status: "active", nextSyncAt: new Date(Date.now() + 60 * 60 * 1000),
    }).run();
    const propertyType = input.provider === "gsc" ? "gsc_site"
      : input.provider === "ga4" ? "ga4_property"
        : input.provider === "google_ads" ? "google_ads_account"
          : input.provider === "meta_ads" ? "meta_ads_account" : "hubspot_portal";
    tx.insert(marketingPropertyBindings).values({
      id: newId("mpb"), workspaceId: input.workspaceId, folderId: input.folderId,
      connectionId: id, propertyType, externalPropertyId: input.externalPropertyId ?? "pending-selection",
      displayName: input.displayName ?? null,
    }).run();
  });
  return id;
}

export async function createPendingMarketingConnection(input: {
  workspaceId: string;
  folderId: string;
  provider: MarketingProvider;
  airbyteWorkspaceId: string;
  airbyteDestinationId: string;
  rawNamespace: string;
  externalPropertyId: string;
}): Promise<string> {
  const id = newId("mkt");
  const propertyType = input.provider === "gsc" ? "gsc_site"
    : input.provider === "ga4" ? "ga4_property"
      : input.provider === "google_ads" ? "google_ads_account"
        : input.provider === "meta_ads" ? "meta_ads_account" : "hubspot_portal";
  db.transaction((tx) => {
    tx.insert(marketingConnections).values({
      id, workspaceId: input.workspaceId, provider: input.provider,
      airbyteWorkspaceId: input.airbyteWorkspaceId, airbyteDestinationId: input.airbyteDestinationId,
      rawNamespace: input.rawNamespace, status: "pending",
    }).run();
    tx.insert(marketingPropertyBindings).values({
      id: newId("mpb"), workspaceId: input.workspaceId, folderId: input.folderId,
      connectionId: id, propertyType, externalPropertyId: input.externalPropertyId,
    }).run();
  });
  return id;
}

export async function getMarketingConnectionRow(workspaceId: string, id: string) {
  const [row] = await db.select().from(marketingConnections).where(and(
    eq(marketingConnections.workspaceId, workspaceId), eq(marketingConnections.id, id),
  )).limit(1);
  return row ?? null;
}

export async function getMarketingConnectionBinding(workspaceId: string, connectionId: string) {
  const [row] = await db.select().from(marketingPropertyBindings).where(and(
    eq(marketingPropertyBindings.workspaceId, workspaceId),
    eq(marketingPropertyBindings.connectionId, connectionId),
    isNull(marketingPropertyBindings.deletedAt),
  )).limit(1);
  return row ?? null;
}

export async function completePendingMarketingConnection(input: {
  workspaceId: string; id: string; sourceId: string; connectionId: string;
}): Promise<void> {
  await db.update(marketingConnections).set({
    airbyteSourceId: input.sourceId, airbyteConnectionId: input.connectionId,
    status: "active", nextSyncAt: new Date(Date.now() + 60 * 60 * 1000), updatedAt: new Date(),
  }).where(and(eq(marketingConnections.workspaceId, input.workspaceId), eq(marketingConnections.id, input.id)));
}

export async function failPendingMarketingConnection(workspaceId: string, id: string, code: string): Promise<void> {
  await db.update(marketingConnections).set({
    status: "error", errorCode: code, errorMessage: "외부 데이터 공급자 연결에 실패했습니다.", updatedAt: new Date(),
  }).where(and(eq(marketingConnections.workspaceId, workspaceId), eq(marketingConnections.id, id)));
}

function stateHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createMarketingOauthState(input: {
  provider: "google" | "meta" | "hubspot";
  workspaceId: string;
  folderId: string;
  returnTo: string;
  now?: Date;
}): Promise<string> {
  const raw = newToken();
  const now = input.now ?? new Date();
  await db.insert(marketingOauthStates).values({
    id: newId("mos"), stateHash: stateHash(raw), provider: input.provider,
    workspaceId: input.workspaceId, folderId: input.folderId, returnTo: input.returnTo,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  });
  return raw;
}

export async function consumeMarketingOauthState(raw: string, workspaceId: string, now = new Date()) {
  const [row] = await db.select().from(marketingOauthStates).where(and(
    eq(marketingOauthStates.stateHash, stateHash(raw)), eq(marketingOauthStates.workspaceId, workspaceId),
    isNull(marketingOauthStates.usedAt),
  )).limit(1);
  if (!row || row.expiresAt.getTime() < now.getTime()) throw new ApiError("UNAUTHENTICATED", "연결 요청이 만료되었거나 이미 사용되었습니다.");
  await db.update(marketingOauthStates).set({ usedAt: now }).where(eq(marketingOauthStates.id, row.id));
  return row;
}

export async function saveMarketingReportSnapshot(input: {
  workspaceId: string; folderId: string; reportType: "ga4" | "gsc" | "monthly_seo" | "marketing_overview" | "attribution";
  rangeFrom: string; rangeTo: string; payload: unknown; provenance: unknown; createdBy: string;
}): Promise<string> {
  const id = newId("mrs");
  await db.insert(marketingReportSnapshots).values({
    id, workspaceId: input.workspaceId, folderId: input.folderId, reportType: input.reportType,
    rangeFrom: input.rangeFrom, rangeTo: input.rangeTo, schemaVersion: 1,
    payload: JSON.stringify(input.payload), provenance: JSON.stringify(input.provenance), createdBy: input.createdBy,
  });
  return id;
}

export async function getMarketingReportSnapshot(workspaceId: string, id: string) {
  const [row] = await db.select().from(marketingReportSnapshots).where(and(
    eq(marketingReportSnapshots.workspaceId, workspaceId), eq(marketingReportSnapshots.id, id),
  )).limit(1);
  return row ?? null;
}

export async function attachMarketingReportAsset(workspaceId: string, id: string, assetPath: string): Promise<void> {
  await db.update(marketingReportSnapshots).set({ assetPath }).where(and(
    eq(marketingReportSnapshots.workspaceId, workspaceId), eq(marketingReportSnapshots.id, id),
  ));
}

export async function listOpenMarketingSyncRuns(limit = 25) {
  return db.select({ run: marketingSyncRuns, connection: marketingConnections, binding: marketingPropertyBindings })
    .from(marketingSyncRuns).innerJoin(marketingConnections, eq(marketingConnections.id, marketingSyncRuns.connectionId))
    .innerJoin(marketingPropertyBindings, and(
      eq(marketingPropertyBindings.connectionId, marketingConnections.id),
      eq(marketingPropertyBindings.workspaceId, marketingConnections.workspaceId),
      isNull(marketingPropertyBindings.deletedAt),
    ))
    .where(and(
      or(eq(marketingSyncRuns.status, "pending"), eq(marketingSyncRuns.status, "running")),
      isNull(marketingConnections.disconnectedAt),
    ))
    .limit(limit);
}

export async function listMarketingConnectionsForJobDiscovery(limit = 25) {
  return db.select().from(marketingConnections).where(and(
    isNull(marketingConnections.disconnectedAt),
    isNotNull(marketingConnections.airbyteConnectionId),
  )).limit(limit);
}

export async function updateMarketingSyncRun(input: {
  id: string; connectionId: string; status: "running" | "succeeded" | "failed" | "cancelled";
  rowCount?: number | null; errorCode?: string | null; now?: Date;
}) {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    tx.update(marketingSyncRuns).set({
      status: input.status, rowCount: input.rowCount ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorCode ? "외부 데이터 동기화에 실패했습니다." : null,
      startedAt: input.status === "running" ? now : undefined,
      completedAt: ["succeeded", "failed", "cancelled"].includes(input.status) ? now : null,
    }).where(eq(marketingSyncRuns.id, input.id)).run();
    tx.update(marketingConnections).set({
      status: input.status === "running" ? "syncing" : input.status === "succeeded" ? "active" : "error",
      lastAttemptedAt: now,
      lastSucceededAt: input.status === "succeeded" ? now : undefined,
      nextSyncAt: input.status === "succeeded" ? new Date(now.getTime() + 60 * 60 * 1000) : undefined,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorCode ? "외부 데이터 동기화에 실패했습니다." : null,
      updatedAt: now,
    }).where(eq(marketingConnections.id, input.connectionId)).run();
  });
}

export async function purgeMarketingControlData(now = new Date()) {
  const syncCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oauthCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const sync = await db.delete(marketingSyncRuns).where(and(lt(marketingSyncRuns.completedAt, syncCutoff)));
  const oauth = await db.delete(marketingOauthStates).where(lt(marketingOauthStates.expiresAt, oauthCutoff));
  return { sync: Number(sync.changes ?? 0), oauth: Number(oauth.changes ?? 0) };
}

export const marketingControl = new SqliteMarketingControlAdapter();

export async function listMarketingFolders(workspaceId: string) {
  return db.select({ id: folders.id, name: folders.name, domain: folders.domain })
    .from(folders).where(and(eq(folders.workspaceId, workspaceId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.name));
}
