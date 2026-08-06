import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { folders } from "./domain";
import { workspaces } from "./platform";

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

export const marketingConnections = sqliteTable(
  "marketing_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gsc", "ga4", "google_ads", "meta_ads", "hubspot"] }).notNull(),
    airbyteWorkspaceId: text("airbyte_workspace_id"),
    airbyteSourceId: text("airbyte_source_id"),
    airbyteDestinationId: text("airbyte_destination_id"),
    airbyteConnectionId: text("airbyte_connection_id"),
    rawNamespace: text("raw_namespace"),
    status: text("status", { enum: ["pending", "active", "syncing", "error", "disconnected"] }).notNull().default("pending"),
    lastAttemptedAt: timestampMs("last_attempted_at"),
    lastSucceededAt: timestampMs("last_succeeded_at"),
    nextSyncAt: timestampMs("next_sync_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestampMs("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
    disconnectedAt: timestampMs("disconnected_at"),
  },
  (t) => [
    index("marketing_connections_workspace_status_idx").on(t.workspaceId, t.status),
    uniqueIndex("marketing_connections_airbyte_connection_unique").on(t.airbyteConnectionId),
  ],
);

export const marketingPropertyBindings = sqliteTable(
  "marketing_property_bindings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull().references(() => marketingConnections.id, { onDelete: "cascade" }),
    propertyType: text("property_type", { enum: ["gsc_site", "ga4_property", "google_ads_account", "meta_ads_account", "hubspot_portal"] }).notNull(),
    externalPropertyId: text("external_property_id").notNull(),
    displayName: text("display_name"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: timestampMs("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    deletedAt: timestampMs("deleted_at"),
  },
  (t) => [
    uniqueIndex("marketing_property_bindings_active_unique").on(t.workspaceId, t.folderId, t.propertyType, t.externalPropertyId).where(sql`deleted_at IS NULL`),
    index("marketing_property_bindings_folder_idx").on(t.workspaceId, t.folderId, t.deletedAt),
  ],
);

export const marketingOauthStates = sqliteTable(
  "marketing_oauth_states",
  {
    id: text("id").primaryKey(),
    stateHash: text("state_hash").notNull(),
    provider: text("provider", { enum: ["google", "meta", "hubspot"] }).notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
    returnTo: text("return_to").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    usedAt: timestampMs("used_at"),
    createdAt: timestampMs("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("marketing_oauth_states_hash_unique").on(t.stateHash),
    index("marketing_oauth_states_expiry_idx").on(t.expiresAt, t.usedAt),
  ],
);

export const marketingSyncRuns = sqliteTable(
  "marketing_sync_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull().references(() => marketingConnections.id, { onDelete: "cascade" }),
    airbyteJobId: text("airbyte_job_id").notNull(),
    status: text("status", { enum: ["pending", "running", "succeeded", "failed", "cancelled"] }).notNull().default("pending"),
    rowCount: integer("row_count"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestampMs("started_at"),
    completedAt: timestampMs("completed_at"),
    createdAt: timestampMs("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("marketing_sync_runs_job_unique").on(t.airbyteJobId),
    index("marketing_sync_runs_connection_idx").on(t.connectionId, t.createdAt),
    index("marketing_sync_runs_retention_idx").on(t.completedAt),
  ],
);

export const marketingReportSnapshots = sqliteTable(
  "marketing_report_snapshots",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
    reportType: text("report_type", { enum: ["ga4", "gsc", "monthly_seo", "marketing_overview", "attribution"] }).notNull(),
    rangeFrom: text("range_from").notNull(),
    rangeTo: text("range_to").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: text("payload").notNull(),
    provenance: text("provenance").notNull(),
    assetPath: text("asset_path"),
    createdAt: timestampMs("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    createdBy: text("created_by"),
  },
  (t) => [index("marketing_report_snapshots_folder_idx").on(t.workspaceId, t.folderId, t.createdAt)],
);

/** SEMForge 초안/콘텐츠와 외부 공급자 엔터티를 명시적으로 연결한다. */
export const marketingEntityBindings = sqliteTable(
  "marketing_entity_bindings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gsc", "ga4", "google_ads", "meta_ads", "hubspot"] }).notNull(),
    localEntityType: text("local_entity_type", { enum: ["content_article", "advertising_campaign"] }).notNull(),
    localEntityId: text("local_entity_id").notNull(),
    externalEntityType: text("external_entity_type").notNull(),
    externalEntityId: text("external_entity_id").notNull(),
    createdAt: timestampMs("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    deletedAt: timestampMs("deleted_at"),
  },
  (t) => [
    uniqueIndex("marketing_entity_bindings_active_unique").on(t.workspaceId, t.provider, t.localEntityType, t.localEntityId, t.externalEntityType, t.externalEntityId).where(sql`deleted_at IS NULL`),
    index("marketing_entity_bindings_folder_idx").on(t.workspaceId, t.folderId, t.deletedAt),
  ],
);

export type MarketingConnectionRow = typeof marketingConnections.$inferSelect;
export type MarketingPropertyBindingRow = typeof marketingPropertyBindings.$inferSelect;
export type MarketingSyncRunRow = typeof marketingSyncRuns.$inferSelect;
export type MarketingReportSnapshotRow = typeof marketingReportSnapshots.$inferSelect;
