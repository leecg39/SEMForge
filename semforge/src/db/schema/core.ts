// @TASK P1-D1-T1 - Canonical PostgreSQL 16 paid-beta schema
// @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "admin", "member"]);
export const trackedQueryTypeEnum = pgEnum("tracked_query_type", ["rank", "aio"]);
export const aioPresenceEnum = pgEnum("aio_presence", ["present", "absent", "unknown"]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "leased",
  "succeeded",
  "retryable",
  "dead",
]);
export const reportStatusEnum = pgEnum("report_status", [
  "collecting",
  "snapshot_ready",
  "rendering",
  "delivered",
  "partial",
  "failed",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "invited",
  "account_created",
  "billing_authorized",
  "charge_pending",
  "active",
  "past_due",
  "cancel_at_period_end",
  "canceled",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "queued",
  "sending",
  "delivered",
  "failed",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "paid",
  "failed",
  "canceled",
  "refunded",
]);
export const reservationStatusEnum = pgEnum("reservation_status", [
  "reserved",
  "consumed",
  "released",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${table.email})`)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    accentColor: text("accent_color").notNull().default("#2563EB"),
    ...timestamps,
  },
  (table) => [
    unique("workspaces_slug_uq").on(table.slug),
    check("workspaces_accent_color_ck", sql`${table.accentColor} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId], name: "memberships_pk" }),
    unique("memberships_workspace_user_uq").on(table.workspaceId, table.userId),
    unique("memberships_workspace_user_role_uq").on(
      table.workspaceId,
      table.userId,
      table.role,
    ),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("sessions_token_hash_uq").on(table.tokenHash),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "sessions_membership_fk",
    }).onDelete("cascade"),
    index("sessions_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    workspaceName: text("workspace_name").notNull(),
    workspaceSlug: text("workspace_slug").notNull(),
    role: membershipRoleEnum("role").notNull().default("owner"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    acceptedWorkspaceId: uuid("accepted_workspace_id"),
    acceptedByUserId: uuid("accepted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("invites_token_hash_uq").on(table.tokenHash),
    check(
      "invites_expiry_window_ck",
      sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + interval '7 days'`,
    ),
    check("invites_token_hash_ck", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("invites_owner_role_ck", sql`${table.role} = 'owner'`),
    check(
      "invites_intent_text_ck",
      sql`btrim(${table.email}) <> '' and btrim(${table.workspaceName}) <> '' and btrim(${table.workspaceSlug}) <> ''`,
    ),
    check(
      "invites_provisioning_state_ck",
      sql`(
        (${table.acceptedAt} is null and ${table.supersededAt} is null and ${table.acceptedWorkspaceId} is null and ${table.acceptedByUserId} is null)
        or
        (${table.acceptedAt} is not null and ${table.supersededAt} is null and ${table.acceptedWorkspaceId} is not null and ${table.acceptedByUserId} is not null)
        or
        (${table.acceptedAt} is null and ${table.supersededAt} is not null and ${table.acceptedWorkspaceId} is null and ${table.acceptedByUserId} is null)
      )`,
    ),
    check(
      "invites_acceptance_time_ck",
      sql`${table.acceptedAt} is null or (${table.acceptedAt} >= ${table.createdAt} and ${table.acceptedAt} <= ${table.expiresAt})`,
    ),
    check(
      "invites_superseded_time_ck",
      sql`${table.supersededAt} is null or ${table.supersededAt} >= ${table.expiresAt}`,
    ),
    foreignKey({
      columns: [table.acceptedWorkspaceId, table.acceptedByUserId, table.role],
      foreignColumns: [memberships.workspaceId, memberships.userId, memberships.role],
      name: "invites_accepted_owner_membership_fk",
    }).onDelete("restrict"),
    uniqueIndex("invites_pending_email_uq")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.acceptedAt} is null and ${table.supersededAt} is null`),
    uniqueIndex("invites_pending_workspace_slug_uq")
      .on(sql`lower(${table.workspaceSlug})`)
      .where(sql`${table.acceptedAt} is null and ${table.supersededAt} is null`),
    index("invites_accepted_membership_idx")
      .on(table.acceptedWorkspaceId, table.acceptedByUserId)
      .where(sql`${table.acceptedAt} is not null`),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("password_resets_token_hash_uq").on(table.tokenHash),
    index("password_resets_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

// @TASK P1-D2 - Hashed login/password-reset throttle state
// @SPEC docs/planning/06-tasks.md#phase-1--postgresql-기반과-물리적-축소
export const authActionThrottles = pgTable(
  "auth_action_throttles",
  {
    action: text("action").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("auth_action_throttles_action_key_uq").on(table.action, table.keyHash),
    check(
      "auth_action_throttles_action_ck",
      sql`${table.action} in ('login', 'forgot_password')`,
    ),
    check("auth_action_throttles_key_hash_ck", sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check("auth_action_throttles_attempt_count_ck", sql`${table.attemptCount} >= 0`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.actorUserId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "audit_events_actor_membership_fk",
    }).onDelete("restrict"),
    index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    timezone: text("timezone").notNull().default("Asia/Seoul"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("sites_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("sites_workspace_domain_lower_uq").on(table.workspaceId, sql`lower(${table.domain})`),
    index("sites_workspace_active_idx").on(table.workspaceId, table.active),
  ],
);

export const trackedQueries = pgTable(
  "tracked_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    type: trackedQueryTypeEnum("type").notNull(),
    query: text("query").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique("tracked_queries_workspace_id_uq").on(table.workspaceId, table.id),
    unique("tracked_queries_workspace_site_id_type_uq").on(
      table.workspaceId,
      table.siteId,
      table.id,
      table.type,
    ),
    unique("tracked_queries_site_type_query_uq").on(
      table.workspaceId,
      table.siteId,
      table.type,
      table.normalizedQuery,
    ),
    foreignKey({
      columns: [table.workspaceId, table.siteId],
      foreignColumns: [sites.workspaceId, sites.id],
      name: "tracked_queries_site_fk",
    }).onDelete("cascade"),
    index("tracked_queries_active_idx").on(table.workspaceId, table.siteId, table.type, table.active),
  ],
);

export const gscConnections = pgTable(
  "gsc_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    scope: text("scope").notNull().default("https://www.googleapis.com/auth/webmasters.readonly"),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("gsc_connections_workspace_id_uq").on(table.workspaceId, table.id),
    unique("gsc_connections_workspace_label_uq").on(table.workspaceId, table.label),
  ],
);

export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    stateHash: text("state_hash").notNull(),
    provider: text("provider").notNull(),
    connectionLabel: text("connection_label").notNull(),
    returnPath: text("return_path").notNull().default("/app/settings"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("oauth_states_state_hash_uq").on(table.stateHash),
    unique("oauth_states_workspace_id_uq").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
      name: "oauth_states_membership_fk",
    }).onDelete("cascade"),
    index("oauth_states_expiry_idx").on(table.expiresAt),
  ],
);

export const gscPropertyBindings = pgTable(
  "gsc_property_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    propertyUri: text("property_uri").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("gsc_property_bindings_workspace_id_uq").on(table.workspaceId, table.id),
    unique("gsc_property_bindings_workspace_site_id_uq").on(
      table.workspaceId,
      table.siteId,
      table.id,
    ),
    unique("gsc_property_bindings_site_uq").on(table.workspaceId, table.siteId),
    foreignKey({
      columns: [table.workspaceId, table.siteId],
      foreignColumns: [sites.workspaceId, sites.id],
      name: "gsc_property_bindings_site_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.connectionId],
      foreignColumns: [gscConnections.workspaceId, gscConnections.id],
      name: "gsc_property_bindings_connection_fk",
    }).onDelete("cascade"),
  ],
);

export const providerCalls = pgTable(
  "provider_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull().default("started"),
    costUnits: numeric("cost_units", { precision: 14, scale: 4 }).notNull().default("0"),
    responseMetadata: jsonb("response_metadata").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("provider_calls_workspace_id_uq").on(table.workspaceId, table.id),
    unique("provider_calls_idempotency_uq").on(table.workspaceId, table.provider, table.idempotencyKey),
    index("provider_calls_workspace_started_idx").on(table.workspaceId, table.startedAt),
  ],
);

export const usageReservations = pgTable(
  "usage_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    resource: text("resource").notNull(),
    units: integer("units").notNull(),
    status: reservationStatusEnum("status").notNull().default("reserved"),
    idempotencyKey: text("idempotency_key").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("usage_reservations_workspace_id_uq").on(table.workspaceId, table.id),
    unique("usage_reservations_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
    check("usage_reservations_units_ck", sql`${table.units} > 0`),
    check("usage_reservations_period_ck", sql`${table.periodEnd} > ${table.periodStart}`),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    priority: integer("priority").notNull().default(100),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseToken: uuid("lease_token"),
    leaseGeneration: bigint("lease_generation", { mode: "number" }).notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    unique("jobs_workspace_id_uq").on(table.workspaceId, table.id),
    unique("jobs_idempotency_uq").on(table.workspaceId, table.type, table.idempotencyKey),
    index("jobs_claim_idx").on(table.status, table.availableAt, table.priority),
    index("jobs_expired_lease_idx").on(table.leaseExpiresAt).where(sql`${table.status} = 'leased'`),
    check("jobs_attempts_ck", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
    check(
      "jobs_lease_ck",
      sql`(${table.status} <> 'leased') or (${table.leaseOwner} is not null and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
  ],
);

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseToken: uuid("lease_token"),
    leaseGeneration: bigint("lease_generation", { mode: "number" }).notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(10),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("outbox_workspace_id_uq").on(table.workspaceId, table.id),
    unique("outbox_idempotency_uq").on(table.workspaceId, table.topic, table.idempotencyKey),
    index("outbox_claim_idx").on(table.publishedAt, table.availableAt),
    index("outbox_expired_lease_idx").on(table.leaseExpiresAt).where(sql`${table.publishedAt} is null`),
  ],
);

export const rankObservations = pgTable(
  "rank_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    trackedQueryId: uuid("tracked_query_id").notNull(),
    queryType: trackedQueryTypeEnum("query_type").notNull().default("rank"),
    providerCallId: uuid("provider_call_id"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    position: integer("position"),
    resultUrl: text("result_url"),
    resultTitle: text("result_title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rank_observations_workspace_id_uq").on(table.workspaceId, table.id),
    unique("rank_observations_query_time_uq").on(table.workspaceId, table.trackedQueryId, table.observedAt),
    foreignKey({ columns: [table.workspaceId, table.siteId, table.trackedQueryId, table.queryType], foreignColumns: [trackedQueries.workspaceId, trackedQueries.siteId, trackedQueries.id, trackedQueries.type], name: "rank_observations_query_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.workspaceId, table.providerCallId], foreignColumns: [providerCalls.workspaceId, providerCalls.id], name: "rank_observations_provider_call_fk" }).onDelete("restrict"),
    check("rank_observations_position_ck", sql`${table.position} is null or (${table.position} between 1 and 100)`),
    check("rank_observations_query_type_ck", sql`${table.queryType} = 'rank'`),
    index("rank_observations_site_time_idx").on(table.workspaceId, table.siteId, table.observedAt),
  ],
);

export const aioObservations = pgTable(
  "aio_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    trackedQueryId: uuid("tracked_query_id").notNull(),
    queryType: trackedQueryTypeEnum("query_type").notNull().default("aio"),
    providerCallId: uuid("provider_call_id"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    presence: aioPresenceEnum("presence").notNull(),
    answerText: text("answer_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aio_observations_workspace_id_uq").on(table.workspaceId, table.id),
    unique("aio_observations_query_time_uq").on(table.workspaceId, table.trackedQueryId, table.observedAt),
    foreignKey({ columns: [table.workspaceId, table.siteId, table.trackedQueryId, table.queryType], foreignColumns: [trackedQueries.workspaceId, trackedQueries.siteId, trackedQueries.id, trackedQueries.type], name: "aio_observations_query_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.workspaceId, table.providerCallId], foreignColumns: [providerCalls.workspaceId, providerCalls.id], name: "aio_observations_provider_call_fk" }).onDelete("restrict"),
    index("aio_observations_site_time_idx").on(table.workspaceId, table.siteId, table.observedAt),
    check("aio_observations_query_type_ck", sql`${table.queryType} = 'aio'`),
  ],
);

export const aioCitations = pgTable(
  "aio_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    observationId: uuid("observation_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aio_citations_workspace_id_uq").on(table.workspaceId, table.id),
    unique("aio_citations_observation_position_uq").on(table.workspaceId, table.observationId, table.position),
    foreignKey({ columns: [table.workspaceId, table.observationId], foreignColumns: [aioObservations.workspaceId, aioObservations.id], name: "aio_citations_observation_fk" }).onDelete("cascade"),
    check("aio_citations_position_ck", sql`${table.position} > 0`),
  ],
);

export const naverObservations = pgTable(
  "naver_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    trackedQueryId: uuid("tracked_query_id").notNull(),
    queryType: trackedQueryTypeEnum("query_type").notNull().default("rank"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    monthlyPcSearchVolume: integer("monthly_pc_search_volume"),
    monthlyMobileSearchVolume: integer("monthly_mobile_search_volume"),
    blogResultCount: bigint("blog_result_count", { mode: "number" }),
    trend: jsonb("trend").$type<unknown[]>(),
    demographics: jsonb("demographics").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("naver_observations_workspace_id_uq").on(table.workspaceId, table.id),
    unique("naver_observations_query_time_uq").on(table.workspaceId, table.trackedQueryId, table.observedAt),
    foreignKey({ columns: [table.workspaceId, table.siteId, table.trackedQueryId, table.queryType], foreignColumns: [trackedQueries.workspaceId, trackedQueries.siteId, trackedQueries.id, trackedQueries.type], name: "naver_observations_query_fk" }).onDelete("cascade"),
    check("naver_observations_volume_ck", sql`coalesce(${table.monthlyPcSearchVolume}, 0) >= 0 and coalesce(${table.monthlyMobileSearchVolume}, 0) >= 0 and coalesce(${table.blogResultCount}, 0) >= 0`),
    check("naver_observations_query_type_ck", sql`${table.queryType} = 'rank'`),
  ],
);

export const gscObservations = pgTable(
  "gsc_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    bindingId: uuid("binding_id").notNull(),
    dataDate: date("data_date", { mode: "string" }).notNull(),
    dimensionHash: text("dimension_hash").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: doublePrecision("ctr").notNull(),
    position: doublePrecision("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("gsc_observations_workspace_id_uq").on(table.workspaceId, table.id),
    unique("gsc_observations_dimension_uq").on(table.workspaceId, table.bindingId, table.dataDate, table.dimensionHash),
    foreignKey({ columns: [table.workspaceId, table.siteId, table.bindingId], foreignColumns: [gscPropertyBindings.workspaceId, gscPropertyBindings.siteId, gscPropertyBindings.id], name: "gsc_observations_binding_fk" }).onDelete("cascade"),
    check("gsc_observations_metrics_ck", sql`${table.clicks} >= 0 and ${table.impressions} >= 0 and ${table.ctr} between 0 and 1 and ${table.position} >= 0`),
    index("gsc_observations_site_date_idx").on(table.workspaceId, table.siteId, table.dataDate),
  ],
);

export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    siteId: uuid("site_id").notNull(),
    status: reportStatusEnum("status").notNull().default("collecting"),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    comparisonStart: date("comparison_start", { mode: "string" }).notNull(),
    comparisonEnd: date("comparison_end", { mode: "string" }).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    brandName: text("brand_name").notNull(),
    logoUrl: text("logo_url"),
    accentColor: text("accent_color").notNull(),
    snapshotReadyAt: timestamp("snapshot_ready_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("weekly_reports_workspace_id_uq").on(table.workspaceId, table.id),
    unique("weekly_reports_site_period_uq").on(table.workspaceId, table.siteId, table.periodStart, table.periodEnd),
    foreignKey({ columns: [table.workspaceId, table.siteId], foreignColumns: [sites.workspaceId, sites.id], name: "weekly_reports_site_fk" }).onDelete("cascade"),
    check("weekly_reports_period_ck", sql`${table.periodEnd} >= ${table.periodStart} and ${table.comparisonEnd} >= ${table.comparisonStart}`),
  ],
);

export const reportSections = pgTable(
  "report_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    reportId: uuid("report_id").notNull(),
    key: text("key").notNull(),
    available: boolean("available").notNull().default(true),
    unavailableReason: text("unavailable_reason"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("report_sections_workspace_id_uq").on(table.workspaceId, table.id),
    unique("report_sections_report_key_uq").on(table.workspaceId, table.reportId, table.key),
    foreignKey({ columns: [table.workspaceId, table.reportId], foreignColumns: [weeklyReports.workspaceId, weeklyReports.id], name: "report_sections_report_fk" }).onDelete("cascade"),
  ],
);

export const reportAssets = pgTable(
  "report_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    reportId: uuid("report_id").notNull(),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("report_assets_workspace_id_uq").on(table.workspaceId, table.id),
    unique("report_assets_storage_key_uq").on(table.storageKey),
    foreignKey({ columns: [table.workspaceId, table.reportId], foreignColumns: [weeklyReports.workspaceId, weeklyReports.id], name: "report_assets_report_fk" }).onDelete("cascade"),
    check("report_assets_size_ck", sql`${table.sizeBytes} >= 0`),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    reportId: uuid("report_id").notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    status: deliveryStatusEnum("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("deliveries_workspace_id_uq").on(table.workspaceId, table.id),
    unique("deliveries_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
    foreignKey({ columns: [table.workspaceId, table.reportId], foreignColumns: [weeklyReports.workspaceId, weeklyReports.id], name: "deliveries_report_fk" }).onDelete("cascade"),
  ],
);

export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tossCustomerKey: text("toss_customer_key").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("billing_customers_workspace_id_uq").on(table.workspaceId, table.id),
    unique("billing_customers_workspace_uq").on(table.workspaceId),
    unique("billing_customers_toss_key_uq").on(table.tossCustomerKey),
  ],
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    billingCustomerId: uuid("billing_customer_id").notNull(),
    billingKeyEncrypted: text("billing_key_encrypted").notNull(),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    active: boolean("active").notNull().default(true),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("payment_methods_workspace_id_uq").on(table.workspaceId, table.id),
    foreignKey({ columns: [table.workspaceId, table.billingCustomerId], foreignColumns: [billingCustomers.workspaceId, billingCustomers.id], name: "payment_methods_customer_fk" }).onDelete("cascade"),
    uniqueIndex("payment_methods_active_customer_uq").on(table.workspaceId, table.billingCustomerId).where(sql`${table.active}`),
    check("payment_methods_last4_ck", sql`${table.cardLast4} is null or ${table.cardLast4} ~ '^[0-9]{4}$'`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    billingCustomerId: uuid("billing_customer_id").notNull(),
    paymentMethodId: uuid("payment_method_id"),
    status: subscriptionStatusEnum("status").notNull().default("invited"),
    amountKrw: integer("amount_krw").notNull().default(49_000),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("subscriptions_workspace_id_uq").on(table.workspaceId, table.id),
    unique("subscriptions_workspace_uq").on(table.workspaceId),
    foreignKey({ columns: [table.workspaceId, table.billingCustomerId], foreignColumns: [billingCustomers.workspaceId, billingCustomers.id], name: "subscriptions_customer_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.workspaceId, table.paymentMethodId], foreignColumns: [paymentMethods.workspaceId, paymentMethods.id], name: "subscriptions_payment_method_fk" }).onDelete("restrict"),
    check("subscriptions_amount_ck", sql`${table.amountKrw} = 49000`),
    check("subscriptions_period_ck", sql`${table.currentPeriodEnd} is null or ${table.currentPeriodStart} is not null and ${table.currentPeriodEnd} > ${table.currentPeriodStart}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    orderId: text("order_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    tossPaymentKey: text("toss_payment_key"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountKrw: integer("amount_krw").notNull().default(49_000),
    billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }).notNull(),
    billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }).notNull(),
    attempt: integer("attempt").notNull().default(1),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("payments_workspace_id_uq").on(table.workspaceId, table.id),
    unique("payments_order_id_uq").on(table.orderId),
    unique("payments_idempotency_uq").on(table.workspaceId, table.idempotencyKey),
    unique("payments_period_attempt_uq").on(table.workspaceId, table.subscriptionId, table.billingPeriodStart, table.attempt),
    foreignKey({ columns: [table.workspaceId, table.subscriptionId], foreignColumns: [subscriptions.workspaceId, subscriptions.id], name: "payments_subscription_fk" }).onDelete("cascade"),
    check("payments_amount_ck", sql`${table.amountKrw} = 49000`),
    check("payments_period_ck", sql`${table.billingPeriodEnd} > ${table.billingPeriodStart}`),
    check("payments_attempt_ck", sql`${table.attempt} > 0`),
  ],
);

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
  },
  (table) => [
    unique("provider_events_workspace_id_uq").on(table.workspaceId, table.id),
    unique("provider_events_dedupe_uq").on(table.provider, table.providerEventId),
    index("provider_events_pending_idx").on(table.provider, table.receivedAt).where(sql`${table.processedAt} is null`),
  ],
);

export const preTenantTables = [
  users,
  sessions,
  invites,
  passwordResets,
  authActionThrottles,
] as const;

export const tenantTables = [
  memberships,
  auditEvents,
  sites,
  trackedQueries,
  gscConnections,
  oauthStates,
  gscPropertyBindings,
  providerCalls,
  usageReservations,
  jobs,
  outbox,
  rankObservations,
  aioObservations,
  aioCitations,
  naverObservations,
  gscObservations,
  weeklyReports,
  reportSections,
  reportAssets,
  deliveries,
  billingCustomers,
  paymentMethods,
  subscriptions,
  payments,
  providerEvents,
] as const;
