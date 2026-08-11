CREATE TYPE "public"."aio_presence" AS ENUM('present', 'absent', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sending', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'leased', 'succeeded', 'retryable', 'dead');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('collecting', 'snapshot_ready', 'rendering', 'delivered', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('reserved', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('invited', 'account_created', 'billing_authorized', 'charge_pending', 'active', 'past_due', 'cancel_at_period_end', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."tracked_query_type" AS ENUM('rank', 'aio');--> statement-breakpoint
CREATE TABLE "aio_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aio_citations_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "aio_citations_observation_position_uq" UNIQUE("workspace_id","observation_id","position"),
	CONSTRAINT "aio_citations_position_ck" CHECK ("aio_citations"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "aio_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tracked_query_id" uuid NOT NULL,
	"query_type" "tracked_query_type" DEFAULT 'aio' NOT NULL,
	"provider_call_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"presence" "aio_presence" NOT NULL,
	"answer_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aio_observations_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "aio_observations_query_time_uq" UNIQUE("workspace_id","tracked_query_id","observed_at"),
	CONSTRAINT "aio_observations_query_type_ck" CHECK ("aio_observations"."query_type" = 'aio')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"toss_customer_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "billing_customers_workspace_uq" UNIQUE("workspace_id"),
	CONSTRAINT "billing_customers_toss_key_uq" UNIQUE("toss_customer_key")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "deliveries_idempotency_uq" UNIQUE("workspace_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "gsc_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"label" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"scope" text DEFAULT 'https://www.googleapis.com/auth/webmasters.readonly' NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_connections_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "gsc_connections_workspace_label_uq" UNIQUE("workspace_id","label")
);
--> statement-breakpoint
CREATE TABLE "gsc_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"data_date" date NOT NULL,
	"dimension_hash" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"ctr" double precision NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_observations_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "gsc_observations_dimension_uq" UNIQUE("workspace_id","binding_id","data_date","dimension_hash"),
	CONSTRAINT "gsc_observations_metrics_ck" CHECK ("gsc_observations"."clicks" >= 0 and "gsc_observations"."impressions" >= 0 and "gsc_observations"."ctr" between 0 and 1 and "gsc_observations"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gsc_property_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"property_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_property_bindings_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "gsc_property_bindings_workspace_site_id_uq" UNIQUE("workspace_id","site_id","id"),
	CONSTRAINT "gsc_property_bindings_site_uq" UNIQUE("workspace_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"workspace_name" text NOT NULL,
	"workspace_slug" text NOT NULL,
	"role" "membership_role" DEFAULT 'owner' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"accepted_workspace_id" uuid,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "invites_expiry_window_ck" CHECK ("invites"."expires_at" > "invites"."created_at" and "invites"."expires_at" <= "invites"."created_at" + interval '7 days'),
	CONSTRAINT "invites_token_hash_ck" CHECK ("invites"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invites_owner_role_ck" CHECK ("invites"."role" = 'owner'),
	CONSTRAINT "invites_intent_text_ck" CHECK (btrim("invites"."email") <> '' and btrim("invites"."workspace_name") <> '' and btrim("invites"."workspace_slug") <> ''),
	CONSTRAINT "invites_provisioning_state_ck" CHECK ((("invites"."accepted_at" is null and "invites"."superseded_at" is null and "invites"."accepted_workspace_id" is null and "invites"."accepted_by_user_id" is null) or ("invites"."accepted_at" is not null and "invites"."superseded_at" is null and "invites"."accepted_workspace_id" is not null and "invites"."accepted_by_user_id" is not null) or ("invites"."accepted_at" is null and "invites"."superseded_at" is not null and "invites"."accepted_workspace_id" is null and "invites"."accepted_by_user_id" is null))),
	CONSTRAINT "invites_acceptance_time_ck" CHECK ("invites"."accepted_at" is null or ("invites"."accepted_at" >= "invites"."created_at" and "invites"."accepted_at" <= "invites"."expires_at")),
	CONSTRAINT "invites_superseded_time_ck" CHECK ("invites"."superseded_at" is null or "invites"."superseded_at" >= "invites"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_token" uuid,
	"lease_generation" bigint DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "jobs_idempotency_uq" UNIQUE("workspace_id","type","idempotency_key"),
	CONSTRAINT "jobs_attempts_ck" CHECK ("jobs"."attempts" >= 0 and "jobs"."max_attempts" > 0),
	CONSTRAINT "jobs_lease_ck" CHECK (("jobs"."status" <> 'leased') or ("jobs"."lease_owner" is not null and "jobs"."lease_token" is not null and "jobs"."lease_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "memberships_workspace_user_uq" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "memberships_workspace_user_role_uq" UNIQUE("workspace_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "naver_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tracked_query_id" uuid NOT NULL,
	"query_type" "tracked_query_type" DEFAULT 'rank' NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"monthly_pc_search_volume" integer,
	"monthly_mobile_search_volume" integer,
	"blog_result_count" bigint,
	"trend" jsonb,
	"demographics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "naver_observations_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "naver_observations_query_time_uq" UNIQUE("workspace_id","tracked_query_id","observed_at"),
	CONSTRAINT "naver_observations_volume_ck" CHECK (coalesce("naver_observations"."monthly_pc_search_volume", 0) >= 0 and coalesce("naver_observations"."monthly_mobile_search_volume", 0) >= 0 and coalesce("naver_observations"."blog_result_count", 0) >= 0),
	CONSTRAINT "naver_observations_query_type_ck" CHECK ("naver_observations"."query_type" = 'rank')
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"provider" text NOT NULL,
	"connection_label" text NOT NULL,
	"return_path" text DEFAULT '/app/settings' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_state_hash_uq" UNIQUE("state_hash"),
	CONSTRAINT "oauth_states_workspace_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_token" uuid,
	"lease_generation" bigint DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "outbox_idempotency_uq" UNIQUE("workspace_id","topic","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"billing_customer_id" uuid NOT NULL,
	"billing_key_encrypted" text NOT NULL,
	"card_brand" text,
	"card_last4" text,
	"active" boolean DEFAULT true NOT NULL,
	"replaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "payment_methods_last4_ck" CHECK ("payment_methods"."card_last4" is null or "payment_methods"."card_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"toss_payment_key" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_krw" integer DEFAULT 49000 NOT NULL,
	"billing_period_start" timestamp with time zone NOT NULL,
	"billing_period_end" timestamp with time zone NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "payments_order_id_uq" UNIQUE("order_id"),
	CONSTRAINT "payments_idempotency_uq" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "payments_period_attempt_uq" UNIQUE("workspace_id","subscription_id","billing_period_start","attempt"),
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount_krw" = 49000),
	CONSTRAINT "payments_period_ck" CHECK ("payments"."billing_period_end" > "payments"."billing_period_start"),
	CONSTRAINT "payments_attempt_ck" CHECK ("payments"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"cost_units" numeric(14, 4) DEFAULT '0' NOT NULL,
	"response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "provider_calls_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "provider_calls_idempotency_uq" UNIQUE("workspace_id","provider","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	CONSTRAINT "provider_events_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "provider_events_dedupe_uq" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "rank_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"tracked_query_id" uuid NOT NULL,
	"query_type" "tracked_query_type" DEFAULT 'rank' NOT NULL,
	"provider_call_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"position" integer,
	"result_url" text,
	"result_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_observations_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "rank_observations_query_time_uq" UNIQUE("workspace_id","tracked_query_id","observed_at"),
	CONSTRAINT "rank_observations_position_ck" CHECK ("rank_observations"."position" is null or ("rank_observations"."position" between 1 and 100)),
	CONSTRAINT "rank_observations_query_type_ck" CHECK ("rank_observations"."query_type" = 'rank')
);
--> statement-breakpoint
CREATE TABLE "report_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"checksum_sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_assets_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "report_assets_storage_key_uq" UNIQUE("storage_key"),
	CONSTRAINT "report_assets_size_ck" CHECK ("report_assets"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"key" text NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"unavailable_reason" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "report_sections_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "report_sections_report_key_uq" UNIQUE("workspace_id","report_id","key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_workspace_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"billing_customer_id" uuid NOT NULL,
	"payment_method_id" uuid,
	"status" "subscription_status" DEFAULT 'invited' NOT NULL,
	"amount_krw" integer DEFAULT 49000 NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "subscriptions_workspace_uq" UNIQUE("workspace_id"),
	CONSTRAINT "subscriptions_amount_ck" CHECK ("subscriptions"."amount_krw" = 49000),
	CONSTRAINT "subscriptions_period_ck" CHECK ("subscriptions"."current_period_end" is null or "subscriptions"."current_period_start" is not null and "subscriptions"."current_period_end" > "subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "tracked_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"type" "tracked_query_type" NOT NULL,
	"query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_queries_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "tracked_queries_workspace_site_id_type_uq" UNIQUE("workspace_id","site_id","id","type"),
	CONSTRAINT "tracked_queries_site_type_query_uq" UNIQUE("workspace_id","site_id","type","normalized_query")
);
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"resource" text NOT NULL,
	"units" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'reserved' NOT NULL,
	"idempotency_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_reservations_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "usage_reservations_idempotency_uq" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "usage_reservations_units_ck" CHECK ("usage_reservations"."units" > 0),
	CONSTRAINT "usage_reservations_period_ck" CHECK ("usage_reservations"."period_end" > "usage_reservations"."period_start")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"email_verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"status" "report_status" DEFAULT 'collecting' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"comparison_start" date NOT NULL,
	"comparison_end" date NOT NULL,
	"snapshot" jsonb,
	"brand_name" text NOT NULL,
	"logo_url" text,
	"accent_color" text NOT NULL,
	"snapshot_ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_reports_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "weekly_reports_site_period_uq" UNIQUE("workspace_id","site_id","period_start","period_end"),
	CONSTRAINT "weekly_reports_period_ck" CHECK ("weekly_reports"."period_end" >= "weekly_reports"."period_start" and "weekly_reports"."comparison_end" >= "weekly_reports"."comparison_start")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"accent_color" text DEFAULT '#2563EB' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_uq" UNIQUE("slug"),
	CONSTRAINT "workspaces_accent_color_ck" CHECK ("workspaces"."accent_color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "aio_citations" ADD CONSTRAINT "aio_citations_observation_fk" FOREIGN KEY ("workspace_id","observation_id") REFERENCES "public"."aio_observations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aio_observations" ADD CONSTRAINT "aio_observations_query_fk" FOREIGN KEY ("workspace_id","site_id","tracked_query_id","query_type") REFERENCES "public"."tracked_queries"("workspace_id","site_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aio_observations" ADD CONSTRAINT "aio_observations_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_membership_fk" FOREIGN KEY ("workspace_id","actor_user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "public"."weekly_reports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_observations" ADD CONSTRAINT "gsc_observations_binding_fk" FOREIGN KEY ("workspace_id","site_id","binding_id") REFERENCES "public"."gsc_property_bindings"("workspace_id","site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_property_bindings" ADD CONSTRAINT "gsc_property_bindings_site_fk" FOREIGN KEY ("workspace_id","site_id") REFERENCES "public"."sites"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_property_bindings" ADD CONSTRAINT "gsc_property_bindings_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."gsc_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_owner_membership_fk" FOREIGN KEY ("accepted_workspace_id","accepted_by_user_id","role") REFERENCES "public"."memberships"("workspace_id","user_id","role") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_observations" ADD CONSTRAINT "naver_observations_query_fk" FOREIGN KEY ("workspace_id","site_id","tracked_query_id","query_type") REFERENCES "public"."tracked_queries"("workspace_id","site_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_fk" FOREIGN KEY ("workspace_id","billing_customer_id") REFERENCES "public"."billing_customers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_fk" FOREIGN KEY ("workspace_id","subscription_id") REFERENCES "public"."subscriptions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_observations" ADD CONSTRAINT "rank_observations_query_fk" FOREIGN KEY ("workspace_id","site_id","tracked_query_id","query_type") REFERENCES "public"."tracked_queries"("workspace_id","site_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_observations" ADD CONSTRAINT "rank_observations_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_assets" ADD CONSTRAINT "report_assets_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "public"."weekly_reports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "public"."weekly_reports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_fk" FOREIGN KEY ("workspace_id","billing_customer_id") REFERENCES "public"."billing_customers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_method_fk" FOREIGN KEY ("workspace_id","payment_method_id") REFERENCES "public"."payment_methods"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD CONSTRAINT "tracked_queries_site_fk" FOREIGN KEY ("workspace_id","site_id") REFERENCES "public"."sites"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_site_fk" FOREIGN KEY ("workspace_id","site_id") REFERENCES "public"."sites"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aio_observations_site_time_idx" ON "aio_observations" USING btree ("workspace_id","site_id","observed_at");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "gsc_observations_site_date_idx" ON "gsc_observations" USING btree ("workspace_id","site_id","data_date");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_pending_email_uq" ON "invites" USING btree (lower("email")) WHERE "invites"."accepted_at" is null and "invites"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_pending_workspace_slug_uq" ON "invites" USING btree (lower("workspace_slug")) WHERE "invites"."accepted_at" is null and "invites"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "invites_accepted_membership_idx" ON "invites" USING btree ("accepted_workspace_id","accepted_by_user_id") WHERE "invites"."accepted_at" is not null;--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","available_at","priority");--> statement-breakpoint
CREATE INDEX "jobs_expired_lease_idx" ON "jobs" USING btree ("lease_expires_at") WHERE "jobs"."status" = 'leased';--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_states_expiry_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_claim_idx" ON "outbox" USING btree ("published_at","available_at");--> statement-breakpoint
CREATE INDEX "outbox_expired_lease_idx" ON "outbox" USING btree ("lease_expires_at") WHERE "outbox"."published_at" is null;--> statement-breakpoint
CREATE INDEX "password_resets_user_expiry_idx" ON "password_resets" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_active_customer_uq" ON "payment_methods" USING btree ("workspace_id","billing_customer_id") WHERE "payment_methods"."active";--> statement-breakpoint
CREATE INDEX "provider_calls_workspace_started_idx" ON "provider_calls" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "provider_events_pending_idx" ON "provider_events" USING btree ("provider","received_at") WHERE "provider_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "rank_observations_site_time_idx" ON "rank_observations" USING btree ("workspace_id","site_id","observed_at");--> statement-breakpoint
CREATE INDEX "sessions_user_expiry_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_workspace_domain_lower_uq" ON "sites" USING btree ("workspace_id",lower("domain"));--> statement-breakpoint
CREATE INDEX "sites_workspace_active_idx" ON "sites" USING btree ("workspace_id","active");--> statement-breakpoint
CREATE INDEX "tracked_queries_active_idx" ON "tracked_queries" USING btree ("workspace_id","site_id","type","active");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint

-- @TASK P1-D2 - Hashed pre-tenant authentication throttles
-- @SPEC docs/planning/06-tasks.md#phase-1--postgresql-기반과-물리적-축소
CREATE TABLE "auth_action_throttles" (
	"action" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_action_throttles_action_key_uq" UNIQUE("action","key_hash"),
	CONSTRAINT "auth_action_throttles_action_ck" CHECK ("auth_action_throttles"."action" in ('login', 'forgot_password')),
	CONSTRAINT "auth_action_throttles_key_hash_ck" CHECK ("auth_action_throttles"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_action_throttles_attempt_count_ck" CHECK ("auth_action_throttles"."attempt_count" >= 0)
);--> statement-breakpoint

-- @TASK P1-D1-T1 - Concurrency-safe beta entitlements
-- @SPEC docs/planning/06-tasks.md#p1-d1-t1--postgresql-16-핵심-스키마와-암호화-기반
CREATE FUNCTION enforce_workspace_site_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT NEW.active THEN RETURN NEW; END IF;
  PERFORM 1 FROM workspaces WHERE id = NEW.workspace_id FOR UPDATE;
  IF (SELECT count(*) FROM sites WHERE workspace_id = NEW.workspace_id AND active AND id <> NEW.id) >= 3 THEN
    RAISE EXCEPTION 'site limit exceeded: workspace may have at most 3 active sites' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER sites_enforce_limit BEFORE INSERT OR UPDATE OF workspace_id, active ON sites
FOR EACH ROW EXECUTE FUNCTION enforce_workspace_site_limit();--> statement-breakpoint

CREATE FUNCTION enforce_tracked_query_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT NEW.active THEN RETURN NEW; END IF;
  PERFORM 1 FROM sites WHERE workspace_id = NEW.workspace_id AND id = NEW.site_id FOR UPDATE;
  IF (SELECT count(*) FROM tracked_queries WHERE workspace_id = NEW.workspace_id AND site_id = NEW.site_id AND type = NEW.type AND active AND id <> NEW.id) >= 20 THEN
    RAISE EXCEPTION 'tracked query limit exceeded: site may have at most 20 active % queries', NEW.type USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER tracked_queries_enforce_limit BEFORE INSERT OR UPDATE OF workspace_id, site_id, type, active ON tracked_queries
FOR EACH ROW EXECUTE FUNCTION enforce_tracked_query_limit();--> statement-breakpoint

-- @TASK P1-D3 - Web/auth/operator/worker role boundary and tenant RLS
-- semforge_* runtime roles are NOLOGIN privilege groups. Infrastructure must provision
-- distinct LOGIN INHERIT members and grant exactly one runtime group to each account.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_web') THEN CREATE ROLE semforge_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_auth') THEN CREATE ROLE semforge_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_operator') THEN CREATE ROLE semforge_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_worker') THEN CREATE ROLE semforge_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO semforge_web, semforge_auth, semforge_operator, semforge_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspaces, memberships, sites, tracked_queries,
  gsc_connections, oauth_states, gsc_property_bindings,
  billing_customers, payment_methods, subscriptions
TO semforge_web;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_events, provider_calls, usage_reservations, jobs, outbox TO semforge_web;--> statement-breakpoint
GRANT SELECT ON rank_observations, aio_observations, aio_citations, naver_observations,
  gsc_observations, weekly_reports, report_sections, report_assets, deliveries,
  payments, provider_events TO semforge_web;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users TO semforge_auth;--> statement-breakpoint
GRANT SELECT ON invites TO semforge_auth;--> statement-breakpoint
GRANT UPDATE (accepted_at, accepted_workspace_id, accepted_by_user_id) ON invites TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON password_resets TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_action_throttles TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT ON workspaces, memberships TO semforge_auth;--> statement-breakpoint
GRANT SELECT ON invites TO semforge_operator;--> statement-breakpoint
GRANT INSERT (email, token_hash, workspace_name, workspace_slug, expires_at) ON invites TO semforge_operator;--> statement-breakpoint
GRANT UPDATE (superseded_at) ON invites TO semforge_operator;--> statement-breakpoint
GRANT SELECT ON workspaces, memberships, sites, tracked_queries, gsc_connections,
  gsc_property_bindings, billing_customers, payment_methods, subscriptions TO semforge_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_calls, usage_reservations, jobs, outbox,
  rank_observations, aio_observations, aio_citations, naver_observations, gsc_observations,
  weekly_reports, report_sections, report_assets, deliveries, payments, provider_events
TO semforge_worker;--> statement-breakpoint

ALTER TABLE gsc_connections ADD CONSTRAINT gsc_connections_encrypted_tokens_ck
  CHECK (access_token_encrypted ~ '^enc:v[0-9]+:' AND refresh_token_encrypted ~ '^enc:v[0-9]+:');--> statement-breakpoint
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_encrypted_billing_key_ck
  CHECK (billing_key_encrypted ~ '^enc:v[0-9]+:');--> statement-breakpoint

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspaces_tenant_isolation ON workspaces
  TO semforge_web
  USING (id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY workspaces_auth_select ON workspaces FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY workspaces_auth_insert ON workspaces FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY workspaces_worker_read ON workspaces FOR SELECT TO semforge_worker
  USING (true);--> statement-breakpoint
DO $$
DECLARE tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'memberships', 'audit_events', 'sites', 'tracked_queries',
    'gsc_connections', 'oauth_states', 'gsc_property_bindings',
    'provider_calls', 'usage_reservations', 'jobs', 'outbox',
    'rank_observations', 'aio_observations', 'aio_citations',
    'naver_observations', 'gsc_observations',
    'weekly_reports', 'report_sections', 'report_assets', 'deliveries',
    'billing_customers', 'payment_methods', 'subscriptions', 'payments', 'provider_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO semforge_web USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      tenant_table || '_tenant_isolation', tenant_table
    );
  END LOOP;
END
$$;--> statement-breakpoint
CREATE POLICY memberships_auth_select ON memberships FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY memberships_auth_insert ON memberships FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY users_auth_select ON users FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY users_auth_insert ON users FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY users_auth_update ON users FOR UPDATE TO semforge_auth USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invites FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY invites_auth_select ON invites FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY invites_auth_update ON invites FOR UPDATE TO semforge_auth
  USING (accepted_at is null AND superseded_at is null AND expires_at >= now())
  WITH CHECK (accepted_at is not null AND superseded_at is null AND accepted_workspace_id is not null AND accepted_by_user_id is not null);--> statement-breakpoint
CREATE POLICY invites_operator_select ON invites FOR SELECT TO semforge_operator USING (true);--> statement-breakpoint
CREATE POLICY invites_operator_insert ON invites FOR INSERT TO semforge_operator
  WITH CHECK (accepted_at is null AND superseded_at is null AND accepted_workspace_id is null AND accepted_by_user_id is null AND role = 'owner');--> statement-breakpoint
CREATE POLICY invites_operator_supersede ON invites FOR UPDATE TO semforge_operator
  USING (accepted_at is null AND superseded_at is null AND expires_at < now())
  WITH CHECK (accepted_at is null AND superseded_at is not null AND accepted_workspace_id is null AND accepted_by_user_id is null);--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY sessions_auth_select ON sessions FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY sessions_auth_insert ON sessions FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY sessions_auth_update ON sessions FOR UPDATE TO semforge_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY sessions_auth_delete ON sessions FOR DELETE TO semforge_auth USING (true);--> statement-breakpoint
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY password_resets_auth_select ON password_resets FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY password_resets_auth_insert ON password_resets FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY password_resets_auth_update ON password_resets FOR UPDATE TO semforge_auth USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE auth_action_throttles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE auth_action_throttles FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY auth_action_throttles_auth_select ON auth_action_throttles FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY auth_action_throttles_auth_insert ON auth_action_throttles FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY auth_action_throttles_auth_update ON auth_action_throttles FOR UPDATE TO semforge_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY auth_action_throttles_auth_delete ON auth_action_throttles FOR DELETE TO semforge_auth USING (true);--> statement-breakpoint
DO $$
DECLARE worker_table text;
BEGIN
  FOREACH worker_table IN ARRAY ARRAY[
    'memberships', 'sites', 'tracked_queries', 'gsc_connections', 'gsc_property_bindings',
    'provider_calls', 'usage_reservations', 'jobs', 'outbox',
    'rank_observations', 'aio_observations', 'aio_citations', 'naver_observations', 'gsc_observations',
    'weekly_reports', 'report_sections', 'report_assets', 'deliveries',
    'billing_customers', 'payment_methods', 'subscriptions', 'payments', 'provider_events'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I TO semforge_worker USING (true) WITH CHECK (true)',
      worker_table || '_worker_access', worker_table);
  END LOOP;
END
$$;
