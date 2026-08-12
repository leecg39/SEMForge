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
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"terms_version" text NOT NULL,
	"terms_sha256" text NOT NULL,
	"privacy_version" text NOT NULL,
	"privacy_sha256" text NOT NULL,
	"presented_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_acceptances_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "legal_acceptances_workspace_user_uq" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "legal_acceptances_terms_sha_ck" CHECK ("legal_acceptances"."terms_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legal_acceptances_privacy_sha_ck" CHECK ("legal_acceptances"."privacy_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legal_acceptances_time_ck" CHECK ("legal_acceptances"."accepted_at" >= "legal_acceptances"."presented_at")
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"operator_id" text NOT NULL,
	"subject_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_requests_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "privacy_requests_request_id_uq" UNIQUE("workspace_id","request_id"),
	CONSTRAINT "privacy_requests_type_ck" CHECK ("privacy_requests"."type" in ('export', 'correction', 'erasure', 'workspace_deletion')),
	CONSTRAINT "privacy_requests_status_ck" CHECK ("privacy_requests"."status" in ('queued', 'running', 'completed', 'failed')),
	CONSTRAINT "privacy_requests_subject_scope_ck" CHECK ((("privacy_requests"."type" in ('export', 'correction', 'erasure') and "privacy_requests"."subject_user_id" is not null) or ("privacy_requests"."type" = 'workspace_deletion' and "privacy_requests"."subject_user_id" is null)))
);
--> statement-breakpoint
-- @TASK P1-FINAL-PRIVACY - Durable tenant privacy fence state
-- @SPEC final_privacy_fence#workspace-privacy-controls
CREATE TABLE "workspace_privacy_controls" (
	"workspace_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"deletion_request_id" uuid,
	"blocked_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_privacy_controls_pk" PRIMARY KEY("workspace_id"),
	CONSTRAINT "workspace_privacy_controls_state_ck" CHECK ("workspace_privacy_controls"."state" in ('active', 'blocking', 'erased')),
	CONSTRAINT "workspace_privacy_controls_generation_ck" CHECK ("workspace_privacy_controls"."generation" >= 0),
	CONSTRAINT "workspace_privacy_controls_transition_ck" CHECK ((
        ("workspace_privacy_controls"."state" = 'active' and "workspace_privacy_controls"."deletion_request_id" is null and "workspace_privacy_controls"."blocked_at" is null and "workspace_privacy_controls"."erased_at" is null)
        or ("workspace_privacy_controls"."state" = 'blocking' and "workspace_privacy_controls"."deletion_request_id" is not null and "workspace_privacy_controls"."blocked_at" is not null and "workspace_privacy_controls"."erased_at" is null)
        or ("workspace_privacy_controls"."state" = 'erased' and "workspace_privacy_controls"."deletion_request_id" is not null and "workspace_privacy_controls"."blocked_at" is not null and "workspace_privacy_controls"."erased_at" is not null and "workspace_privacy_controls"."erased_at" >= "workspace_privacy_controls"."blocked_at")
      ))
);
--> statement-breakpoint
CREATE TABLE "privacy_request_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_request_steps_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "privacy_request_steps_key_uq" UNIQUE("workspace_id","request_id","step_key"),
	CONSTRAINT "privacy_request_steps_status_ck" CHECK ("privacy_request_steps"."status" in ('pending', 'succeeded', 'failed', 'skipped')),
	CONSTRAINT "privacy_request_steps_attempts_ck" CHECK ("privacy_request_steps"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "privacy_billing_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"customer_key_hash" text NOT NULL,
	"legal_hold" boolean DEFAULT true NOT NULL,
	"retained_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_billing_tombstones_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "privacy_billing_tombstones_request_uq" UNIQUE("workspace_id","request_id"),
	CONSTRAINT "privacy_billing_tombstones_hash_ck" CHECK ("privacy_billing_tombstones"."customer_key_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "backup_deletion_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"marker_key" text NOT NULL,
	"runbook_ref" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_deletion_markers_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "backup_deletion_markers_request_marker_uq" UNIQUE("workspace_id","request_id","marker_key")
);
--> statement-breakpoint
-- @TASK P5-PRIVACY - Durable tenant-scoped email suppression after erasure
-- @SPEC docs/ops/privacy-erasure-runbook.md
CREATE TABLE "email_suppressions" (
	"workspace_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_pk" PRIMARY KEY("workspace_id","recipient_hash"),
	CONSTRAINT "email_suppressions_hash_ck" CHECK ("email_suppressions"."recipient_hash" ~ '^[0-9a-f]{64}$')
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
	"provider_call_id" uuid NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
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
	"release_target" text DEFAULT 'paid-production' NOT NULL,
	"role" "membership_role" DEFAULT 'owner' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"accepted_workspace_id" uuid,
	"accepted_by_user_id" uuid,
	"accepted_erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "invites_expiry_window_ck" CHECK ("invites"."expires_at" > "invites"."created_at" and "invites"."expires_at" <= "invites"."created_at" + interval '7 days'),
	CONSTRAINT "invites_token_hash_ck" CHECK ("invites"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invites_owner_role_ck" CHECK ("invites"."role" = 'owner'),
	CONSTRAINT "invites_release_target_ck" CHECK ("invites"."release_target" in ('sandbox', 'staging', 'paid-production')),
	CONSTRAINT "invites_intent_text_ck" CHECK (btrim("invites"."email") <> '' and btrim("invites"."workspace_name") <> '' and btrim("invites"."workspace_slug") <> ''),
	CONSTRAINT "invites_provisioning_state_ck" CHECK ((("invites"."accepted_at" is null and "invites"."superseded_at" is null and "invites"."accepted_workspace_id" is null and "invites"."accepted_by_user_id" is null and "invites"."accepted_erased_at" is null) or ("invites"."accepted_at" is not null and "invites"."superseded_at" is null and "invites"."accepted_workspace_id" is not null and "invites"."accepted_by_user_id" is not null and "invites"."accepted_erased_at" is null) or ("invites"."accepted_at" is not null and "invites"."superseded_at" is null and "invites"."accepted_workspace_id" is not null and "invites"."accepted_by_user_id" is null and "invites"."accepted_erased_at" is not null and "invites"."accepted_erased_at" >= "invites"."accepted_at") or ("invites"."accepted_at" is null and "invites"."superseded_at" is not null and "invites"."accepted_workspace_id" is null and "invites"."accepted_by_user_id" is null and "invites"."accepted_erased_at" is null))),
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
	"request_hash" text DEFAULT '' NOT NULL,
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
	"collected_at" timestamp with time zone NOT NULL,
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
CREATE TABLE "naver_observation_sources" (
	"workspace_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"provider_call_id" uuid,
	"collected_at" timestamp with time zone,
	"error_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "naver_observation_sources_workspace_observation_source_uq" UNIQUE("workspace_id","observation_id","source"),
	CONSTRAINT "naver_observation_sources_source_ck" CHECK ("naver_observation_sources"."source" in ('search_ads_monthly_volume', 'datalab_trend', 'datalab_gender', 'datalab_age', 'search_api_blog_total')),
	CONSTRAINT "naver_observation_sources_status_ck" CHECK ("naver_observation_sources"."status" in ('succeeded', 'unavailable', 'retryable', 'failed'))
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
	"request_hash" text DEFAULT '' NOT NULL,
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
-- @TASK P5-S1-T1 - Queue storage accepts only encrypted or terminal password-reset payloads.
CREATE FUNCTION valid_password_reset_payload(candidate jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN jsonb_typeof(candidate) <> 'object' THEN false ELSE COALESCE(
    jsonb_typeof(candidate->'resetId') = 'string'
    AND candidate->>'resetId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND CASE candidate->>'kind'
      WHEN 'password_reset' THEN
        (SELECT count(*) = 4 FROM jsonb_object_keys(candidate))
        AND candidate ?& ARRAY['kind', 'resetId', 'encryptedDelivery', 'expiresAt']
        AND jsonb_typeof(candidate->'encryptedDelivery') = 'string'
        AND candidate->>'encryptedDelivery' ~ '^enc:v1:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:([A-Za-z0-9_-]{4})*([A-Za-z0-9_-]{2}|[A-Za-z0-9_-]{3}|[A-Za-z0-9_-]{4})$'
        AND length(candidate->>'encryptedDelivery') <= 8192
        AND jsonb_typeof(candidate->'expiresAt') = 'string'
        AND candidate->>'expiresAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
      WHEN 'password_reset_scrubbed' THEN
        jsonb_typeof(candidate->'state') = 'string'
        AND candidate->>'state' IN ('delivered', 'rejected', 'expired', 'invalid', 'retry_exhausted')
        AND jsonb_typeof(candidate->'scrubbedAt') = 'string'
        AND candidate->>'scrubbedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        AND CASE WHEN candidate->>'state' = 'delivered' THEN
          (SELECT count(*) = 5 FROM jsonb_object_keys(candidate))
          AND candidate ?& ARRAY['kind', 'resetId', 'state', 'scrubbedAt', 'providerMessageId']
          AND jsonb_typeof(candidate->'providerMessageId') = 'string'
          AND length(btrim(candidate->>'providerMessageId')) BETWEEN 1 AND 200
        ELSE
          (SELECT count(*) = 4 FROM jsonb_object_keys(candidate))
          AND candidate ?& ARRAY['kind', 'resetId', 'state', 'scrubbedAt']
        END
      ELSE false
    END,
    false
  ) END;
$$;--> statement-breakpoint
ALTER TABLE outbox ADD CONSTRAINT outbox_password_reset_payload_ck
  CHECK (
    topic <> 'email.password_reset'
    OR (
      valid_password_reset_payload(payload)
      AND idempotency_key = 'password-reset:' || (payload->>'resetId')
    )
  );--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_password_reset_payload_ck
  CHECK (
    type <> 'email.password_reset'
    OR (
      valid_password_reset_payload(payload)
      AND idempotency_key = 'outbox:email.password_reset:password-reset:' || (payload->>'resetId')
    )
  );--> statement-breakpoint
-- @TASK P3-P1-FIX - Canonical job/outbox idempotency request hashes
CREATE FUNCTION set_job_request_hash() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.request_hash := encode(sha256(convert_to(
    NEW.type || chr(31) || NEW.payload::text || chr(31) ||
    NEW.max_attempts::text || chr(31) || NEW.priority::text,
    'UTF8'
  )), 'hex');
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER jobs_request_hash BEFORE INSERT OR UPDATE
ON jobs FOR EACH ROW EXECUTE FUNCTION set_job_request_hash();--> statement-breakpoint
CREATE FUNCTION set_outbox_request_hash() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.request_hash := encode(sha256(convert_to(
    NEW.topic || chr(31) || NEW.payload::text || chr(31) || NEW.max_attempts::text,
    'UTF8'
  )), 'hex');
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER outbox_request_hash BEFORE INSERT OR UPDATE
ON outbox FOR EACH ROW EXECUTE FUNCTION set_outbox_request_hash();--> statement-breakpoint
-- A terminal queue transition is the final crash-safe cleanup boundary. Handler-level
-- scrubbing records the precise state; this trigger is the last-attempt fallback.
CREATE FUNCTION scrub_dead_password_reset_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  scrubbed_payload jsonb;
BEGIN
  IF NEW.type = 'email.password_reset'
     AND NEW.status = 'dead'
     AND OLD.status IS DISTINCT FROM 'dead'
     AND OLD.payload->>'kind' = 'password_reset' THEN
    scrubbed_payload := jsonb_build_object(
      'kind', 'password_reset_scrubbed',
      'resetId', OLD.payload->>'resetId',
      'state', 'retry_exhausted',
      'scrubbedAt', to_jsonb(NEW.updated_at)
    );

    UPDATE outbox
       SET payload = scrubbed_payload
     WHERE workspace_id = NEW.workspace_id
       AND topic = 'email.password_reset'
       AND idempotency_key = 'password-reset:' || (OLD.payload->>'resetId')
       AND payload->>'kind' = 'password_reset'
       AND payload->>'resetId' = OLD.payload->>'resetId';

    NEW.payload := scrubbed_payload;
    NEW.request_hash := encode(sha256(convert_to(
      NEW.type || chr(31) || NEW.payload::text || chr(31) ||
      NEW.max_attempts::text || chr(31) || NEW.priority::text,
      'UTF8'
    )), 'hex');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER jobs_scrub_dead_password_reset BEFORE UPDATE OF status ON jobs
FOR EACH ROW EXECUTE FUNCTION scrub_dead_password_reset_job();--> statement-breakpoint
CREATE FUNCTION scrub_dead_password_reset_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.topic = 'email.password_reset'
     AND NEW.published_at IS NULL
     AND NEW.attempts >= NEW.max_attempts
     AND OLD.lease_owner IS NOT NULL
     AND NEW.lease_owner IS NULL
     AND NEW.lease_token IS NULL
     AND NEW.lease_expires_at IS NULL
     AND OLD.payload->>'kind' = 'password_reset' THEN
    NEW.payload := jsonb_build_object(
      'kind', 'password_reset_scrubbed',
      'resetId', OLD.payload->>'resetId',
      'state', 'retry_exhausted',
      'scrubbedAt', to_jsonb(NEW.available_at)
    );
    NEW.request_hash := encode(sha256(convert_to(
      NEW.topic || chr(31) || NEW.payload::text || chr(31) || NEW.max_attempts::text,
      'UTF8'
    )), 'hex');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER outbox_scrub_dead_password_reset
BEFORE UPDATE OF lease_owner, lease_token, lease_expires_at ON outbox
FOR EACH ROW EXECUTE FUNCTION scrub_dead_password_reset_outbox();--> statement-breakpoint
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
	"billing_key_fingerprint" text NOT NULL,
	"card_brand" text,
	"card_last4" text,
	"active" boolean DEFAULT true NOT NULL,
	"replaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "payment_methods_fingerprint_uq" UNIQUE("billing_key_fingerprint"),
	CONSTRAINT "payment_methods_fingerprint_ck" CHECK ("payment_methods"."billing_key_fingerprint" ~ '^[0-9a-f]{64}$'),
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
	CONSTRAINT "provider_calls_idempotency_uq" UNIQUE("workspace_id","provider","idempotency_key"),
	CONSTRAINT "provider_calls_status_ck" CHECK ("provider_calls"."status" in ('started', 'in_doubt', 'retryable', 'succeeded', 'failed'))
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
CREATE TABLE "billing_ledger_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entity_id" text NOT NULL,
	"actor_user_id" uuid,
	"request_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_krw" integer,
	"order_id" text,
	"payment_status" "payment_status",
	"provider_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_ledger_events_workspace_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "billing_ledger_events_amount_ck" CHECK ("billing_ledger_events"."amount_krw" is null or "billing_ledger_events"."amount_krw" = 49000),
	CONSTRAINT "billing_ledger_events_type_ck" CHECK ("billing_ledger_events"."type" in (
      'payment_method.authorized',
      'charge.requested',
      'charge.succeeded',
      'charge.failed',
      'charge.canceled',
      'payment.refunded',
      'subscription.cancel_scheduled',
      'subscription.canceled'
    ))
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
	CONSTRAINT "report_sections_report_key_uq" UNIQUE("workspace_id","report_id","key"),
	CONSTRAINT "report_sections_key_ck" CHECK ("report_sections"."key" in ('rank', 'aio', 'naver', 'gsc')),
	CONSTRAINT "report_sections_availability_ck" CHECK (("report_sections"."available" and "report_sections"."unavailable_reason" is null) or (not "report_sections"."available" and "report_sections"."unavailable_reason" is not null))
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
	"provider_call_id" uuid NOT NULL,
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
	CONSTRAINT "usage_reservations_provider_call_uq" UNIQUE("workspace_id","provider_call_id"),
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
	CONSTRAINT "weekly_reports_period_ck" CHECK ("weekly_reports"."period_end" >= "weekly_reports"."period_start" and "weekly_reports"."comparison_end" >= "weekly_reports"."comparison_start"),
	CONSTRAINT "weekly_reports_snapshot_state_ck" CHECK ("weekly_reports"."status" in ('collecting', 'failed') or ("weekly_reports"."snapshot" is not null and "weekly_reports"."snapshot_ready_at" is not null))
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
CREATE FUNCTION initialize_workspace_privacy_control() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO workspace_privacy_controls (workspace_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER workspaces_initialize_privacy_control
AFTER INSERT ON workspaces
FOR EACH ROW EXECUTE FUNCTION initialize_workspace_privacy_control();--> statement-breakpoint
INSERT INTO workspace_privacy_controls (workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;--> statement-breakpoint
ALTER TABLE "aio_citations" ADD CONSTRAINT "aio_citations_observation_fk" FOREIGN KEY ("workspace_id","observation_id") REFERENCES "public"."aio_observations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aio_observations" ADD CONSTRAINT "aio_observations_query_fk" FOREIGN KEY ("workspace_id","site_id","tracked_query_id","query_type") REFERENCES "public"."tracked_queries"("workspace_id","site_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aio_observations" ADD CONSTRAINT "aio_observations_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_membership_fk" FOREIGN KEY ("workspace_id","actor_user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_subject_user_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_privacy_controls" ADD CONSTRAINT "workspace_privacy_controls_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_privacy_controls" ADD CONSTRAINT "workspace_privacy_controls_deletion_request_fk" FOREIGN KEY ("workspace_id","deletion_request_id") REFERENCES "public"."privacy_requests"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request_steps" ADD CONSTRAINT "privacy_request_steps_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "public"."privacy_requests"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_billing_tombstones" ADD CONSTRAINT "privacy_billing_tombstones_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "public"."privacy_requests"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_deletion_markers" ADD CONSTRAINT "backup_deletion_markers_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "public"."privacy_requests"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_request_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "public"."privacy_requests"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "public"."weekly_reports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_observations" ADD CONSTRAINT "gsc_observations_binding_fk" FOREIGN KEY ("workspace_id","site_id","binding_id") REFERENCES "public"."gsc_property_bindings"("workspace_id","site_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_observations" ADD CONSTRAINT "gsc_observations_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_property_bindings" ADD CONSTRAINT "gsc_property_bindings_site_fk" FOREIGN KEY ("workspace_id","site_id") REFERENCES "public"."sites"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_property_bindings" ADD CONSTRAINT "gsc_property_bindings_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."gsc_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_owner_membership_fk" FOREIGN KEY ("accepted_workspace_id","accepted_by_user_id","role") REFERENCES "public"."memberships"("workspace_id","user_id","role") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_observations" ADD CONSTRAINT "naver_observations_query_fk" FOREIGN KEY ("workspace_id","site_id","tracked_query_id","query_type") REFERENCES "public"."tracked_queries"("workspace_id","site_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_observation_sources" ADD CONSTRAINT "naver_observation_sources_observation_fk" FOREIGN KEY ("workspace_id","observation_id") REFERENCES "public"."naver_observations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naver_observation_sources" ADD CONSTRAINT "naver_observation_sources_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_fk" FOREIGN KEY ("workspace_id","billing_customer_id") REFERENCES "public"."billing_customers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_fk" FOREIGN KEY ("workspace_id","subscription_id") REFERENCES "public"."subscriptions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_ledger_events" ADD CONSTRAINT "billing_ledger_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_observations" ADD CONSTRAINT "rank_observations_query_fk" FOREIGN KEY ("workspace_id","site_id","tracked_query_id","query_type") REFERENCES "public"."tracked_queries"("workspace_id","site_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_observations" ADD CONSTRAINT "rank_observations_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_assets" ADD CONSTRAINT "report_assets_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "public"."weekly_reports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_fk" FOREIGN KEY ("workspace_id","report_id") REFERENCES "public"."weekly_reports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_fk" FOREIGN KEY ("workspace_id","billing_customer_id") REFERENCES "public"."billing_customers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_method_fk" FOREIGN KEY ("workspace_id","payment_method_id") REFERENCES "public"."payment_methods"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD CONSTRAINT "tracked_queries_site_fk" FOREIGN KEY ("workspace_id","site_id") REFERENCES "public"."sites"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_provider_call_fk" FOREIGN KEY ("workspace_id","provider_call_id") REFERENCES "public"."provider_calls"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "billing_ledger_events_workspace_time_idx" ON "billing_ledger_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
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

-- @TASK P3-R1-T1 - Database-enforced immutable weekly report snapshots
-- @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
CREATE FUNCTION protect_weekly_report_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.privacy_erasure_request_id', true) ~ '^[0-9a-fA-F-]{36}$'
    AND current_setting('app.privacy_erasure_procedure', true) = 'privacy_erase_workspace'
  THEN
    RETURN OLD;
  END IF;

  IF OLD.status = 'delivered' OR OLD.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'delivered report cannot be mutated' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.snapshot_ready_at IS NOT NULL THEN
    RAISE EXCEPTION 'immutable report snapshot cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.snapshot_ready_at IS NOT NULL AND (
    NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR
    NEW.site_id IS DISTINCT FROM OLD.site_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.comparison_start IS DISTINCT FROM OLD.comparison_start OR
    NEW.comparison_end IS DISTINCT FROM OLD.comparison_end OR
    NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
    NEW.brand_name IS DISTINCT FROM OLD.brand_name OR
    NEW.logo_url IS DISTINCT FROM OLD.logo_url OR
    NEW.accent_color IS DISTINCT FROM OLD.accent_color OR
    NEW.snapshot_ready_at IS DISTINCT FROM OLD.snapshot_ready_at
  ) THEN
    RAISE EXCEPTION 'immutable report snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER weekly_reports_protect_snapshot
BEFORE UPDATE OR DELETE ON weekly_reports
FOR EACH ROW EXECUTE FUNCTION protect_weekly_report_snapshot();--> statement-breakpoint

CREATE FUNCTION protect_report_sections() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  target_workspace_id uuid;
  target_report_id uuid;
  parent_ready_at timestamptz;
BEGIN
  target_workspace_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  target_report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
  SELECT snapshot_ready_at INTO parent_ready_at
    FROM weekly_reports
   WHERE workspace_id = target_workspace_id AND id = target_report_id;
  IF TG_OP = 'DELETE'
    AND current_setting('app.privacy_erasure_request_id', true) ~ '^[0-9a-fA-F-]{36}$'
    AND current_setting('app.privacy_erasure_procedure', true) = 'privacy_erase_workspace'
  THEN
    RETURN OLD;
  END IF;
  IF parent_ready_at IS NOT NULL THEN
    RAISE EXCEPTION 'immutable report sections cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER report_sections_protect_snapshot
BEFORE INSERT OR UPDATE OR DELETE ON report_sections
FOR EACH ROW EXECUTE FUNCTION protect_report_sections();--> statement-breakpoint

-- @TASK P1-FINAL-PRIVACY - Operator approval is the only request creation boundary
-- @SPEC final_privacy_roles#open-request
CREATE FUNCTION privacy_open_request(
  p_workspace_id uuid,
  p_request_id text,
  p_type text,
  p_operator_id text,
  p_requested_at timestamptz,
  p_subject_user_id uuid
) RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing privacy_requests%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_requested_at IS NULL
     OR p_request_id IS NULL OR btrim(p_request_id) = '' OR length(p_request_id) > 200
     OR p_operator_id IS NULL OR btrim(p_operator_id) = '' OR length(p_operator_id) > 200
  THEN
    RAISE EXCEPTION 'privacy request identifiers are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_type NOT IN ('export', 'correction', 'erasure', 'workspace_deletion') THEN
    RAISE EXCEPTION 'privacy request type is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = p_workspace_id) THEN
    RAISE EXCEPTION 'privacy request workspace does not exist' USING ERRCODE = '23503';
  END IF;
  IF p_type IN ('export', 'correction', 'erasure') THEN
    IF p_subject_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM memberships
       WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id
    ) THEN
      RAISE EXCEPTION 'privacy request subject does not belong to workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_type = 'workspace_deletion' THEN
    IF p_subject_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'workspace deletion request must not include a subject' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'privacy request type is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT request.* INTO existing
    FROM privacy_requests request
   WHERE request.workspace_id = p_workspace_id
     AND request.request_id = p_request_id
   FOR UPDATE;
  IF FOUND THEN
    IF existing.type <> p_type OR existing.operator_id <> p_operator_id
       OR existing.subject_user_id IS DISTINCT FROM p_subject_user_id
    THEN
      RAISE EXCEPTION 'privacy request duplicate identity mismatch' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT existing.id, existing.status;
    RETURN;
  END IF;

  RETURN QUERY
    INSERT INTO privacy_requests
      (workspace_id, request_id, type, status, operator_id, subject_user_id, requested_at)
    VALUES
      (p_workspace_id, p_request_id, p_type, 'queued', p_operator_id, p_subject_user_id, p_requested_at)
    RETURNING privacy_requests.id, privacy_requests.status;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_open_request(
  p_workspace_id uuid,
  p_request_id text,
  p_type text,
  p_operator_id text,
  p_requested_at timestamptz
) RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM privacy_open_request(
    p_workspace_id, p_request_id, p_type, p_operator_id, p_requested_at, NULL::uuid
  );
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_claim_request(
  p_workspace_id uuid,
  p_request_id text,
  p_type text,
  p_operator_id text,
  p_claimed_at timestamptz,
  p_subject_user_id uuid
) RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE claimed privacy_requests%ROWTYPE;
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_request_id IS NULL OR btrim(p_request_id) = ''
     OR p_operator_id IS NULL OR btrim(p_operator_id) = ''
     OR p_claimed_at IS NULL
     OR p_type NOT IN ('export', 'correction', 'erasure', 'workspace_deletion')
  THEN
    RAISE EXCEPTION 'privacy claim input is invalid' USING ERRCODE = '42501';
  END IF;
  IF p_type IN ('export', 'correction', 'erasure') AND p_subject_user_id IS NULL THEN
    RAISE EXCEPTION 'privacy claim requires an exact subject' USING ERRCODE = '42501';
  END IF;
  IF p_type = 'workspace_deletion' AND p_subject_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'workspace deletion claim must not include a subject' USING ERRCODE = '42501';
  END IF;
  SELECT request.* INTO claimed FROM privacy_requests request
   WHERE request.workspace_id = p_workspace_id AND request.request_id = p_request_id
     AND request.type = p_type AND request.operator_id = p_operator_id
     AND request.subject_user_id IS NOT DISTINCT FROM p_subject_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy claim requires exact approved request' USING ERRCODE = '42501';
  END IF;
  IF claimed.status IN ('queued', 'failed') THEN
    UPDATE privacy_requests SET status = 'running', completed_at = NULL WHERE privacy_requests.id = claimed.id;
    claimed.status := 'running';
  ELSIF claimed.status NOT IN ('running', 'completed') THEN
    RAISE EXCEPTION 'privacy request cannot be claimed' USING ERRCODE = '55000';
  END IF;
  RETURN QUERY SELECT claimed.id, claimed.status;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_claim_request(
  p_workspace_id uuid,
  p_request_id text,
  p_type text,
  p_operator_id text,
  p_claimed_at timestamptz
) RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY SELECT * FROM privacy_claim_request(
    p_workspace_id, p_request_id, p_type, p_operator_id, p_claimed_at, NULL::uuid
  );
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_succeeded_request_steps(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text
) RETURNS TABLE(step_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM privacy_requests request
        WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id
          AND request.operator_id = p_operator_id AND request.status IN ('running', 'completed')
     )
  THEN
    RAISE EXCEPTION 'privacy step listing requires exact approved request' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT step.step_key FROM privacy_request_steps step
   WHERE step.workspace_id = p_workspace_id AND step.request_id = p_request_id
     AND step.status = 'succeeded' ORDER BY step.step_key;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_export_workspace(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text, p_subject_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM privacy_requests request
        WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id
          AND request.operator_id = p_operator_id AND request.type = 'export'
          AND request.subject_user_id = p_subject_user_id
          AND request.status IN ('running', 'completed')
     )
  THEN
    RAISE EXCEPTION 'privacy export requires exact running request' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'request', jsonb_build_object(
      'id', p_request_id::text,
      'external_id', request.request_id,
      'type', request.type,
      'subject_user_id', request.subject_user_id::text
    ),
    'workspace', jsonb_build_object('id', p_workspace_id::text),
    'subject', to_jsonb(subject),
    'legalAcceptances', coalesce((SELECT jsonb_agg(to_jsonb(legal)) FROM (
      SELECT terms_version, terms_sha256, privacy_version, privacy_sha256, presented_at, accepted_at
        FROM legal_acceptances WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id
    ) legal), '[]'::jsonb),
    'sessions', coalesce((SELECT jsonb_agg(to_jsonb(session_row) ORDER BY session_row.created_at) FROM (
      SELECT id::text, created_at, expires_at, revoked_at,
             CASE WHEN revoked_at IS NULL AND expires_at > now() THEN 'active' ELSE 'inactive' END AS status
        FROM sessions
       WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id
    ) session_row), '[]'::jsonb)
  ) INTO result
  FROM privacy_requests request
  JOIN (
    SELECT users.id::text, users.email, users.display_name, memberships.role
      FROM memberships JOIN users ON users.id = memberships.user_id
     WHERE memberships.workspace_id = p_workspace_id
       AND memberships.user_id = p_subject_user_id
  ) subject ON true
  WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id;
  IF result IS NULL THEN RAISE EXCEPTION 'privacy workspace not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO audit_events
    (workspace_id, action, entity_type, entity_id, request_id, metadata)
  SELECT p_workspace_id, 'privacy.export.read', 'privacy_request', p_request_id::text,
         request.request_id,
         jsonb_build_object(
           'categories', jsonb_build_array('workspace_membership', 'subject_profile', 'legal_acceptances', 'sessions'),
           'subjectCount', 1,
           'legalAcceptanceCount', jsonb_array_length(result->'legalAcceptances'),
           'sessionCount', jsonb_array_length(result->'sessions')
         )
    FROM privacy_requests request
   WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id;
  RETURN result;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_export_workspace(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE request_subject uuid;
BEGIN
  SELECT subject_user_id INTO request_subject
    FROM privacy_requests
   WHERE workspace_id = p_workspace_id AND id = p_request_id
     AND operator_id = p_operator_id AND type = 'export';
  IF request_subject IS NULL THEN
    RAISE EXCEPTION 'privacy export requires exact subject' USING ERRCODE = '42501';
  END IF;
  RETURN privacy_export_workspace(p_workspace_id, p_request_id, p_operator_id, request_subject);
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_correct_workspace(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text,
  p_display_name text, p_workspace_name text, p_changed_at timestamptz, p_subject_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_changed_at IS NULL OR p_workspace_name IS NOT NULL OR p_display_name IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM privacy_requests request
        WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id
          AND request.operator_id = p_operator_id AND request.type = 'correction'
          AND request.subject_user_id = p_subject_user_id
          AND request.status = 'running'
     )
  THEN
    RAISE EXCEPTION 'privacy correction requires exact running request' USING ERRCODE = '42501';
  END IF;
  IF p_display_name IS NOT NULL THEN
    UPDATE users SET display_name = p_display_name, updated_at = p_changed_at
     WHERE id = p_subject_user_id
       AND EXISTS (
         SELECT 1 FROM memberships
          WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id
       );
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_correct_workspace(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text,
  p_display_name text, p_workspace_name text, p_changed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE request_subject uuid;
BEGIN
  SELECT subject_user_id INTO request_subject
    FROM privacy_requests
   WHERE workspace_id = p_workspace_id AND id = p_request_id
     AND operator_id = p_operator_id AND type = 'correction';
  IF request_subject IS NULL THEN
    RAISE EXCEPTION 'privacy correction requires exact subject' USING ERRCODE = '42501';
  END IF;
  PERFORM privacy_correct_workspace(
    p_workspace_id, p_request_id, p_operator_id, p_display_name, p_workspace_name, p_changed_at, request_subject
  );
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_deletion_targets(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM privacy_requests request
        WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id
          AND request.operator_id = p_operator_id AND request.type = 'workspace_deletion'
          AND request.subject_user_id IS NULL AND request.status = 'running'
     )
  THEN
    RAISE EXCEPTION 'privacy deletion targets require exact running request' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'gscConnections', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id::text, 'refreshTokenEncrypted', refresh_token_encrypted) ORDER BY id)
      FROM gsc_connections WHERE workspace_id = p_workspace_id AND disconnected_at IS NULL), '[]'::jsonb),
    'storageKeys', coalesce((SELECT jsonb_agg(storage_key ORDER BY storage_key)
      FROM report_assets WHERE workspace_id = p_workspace_id), '[]'::jsonb),
    'recipients', coalesce((SELECT jsonb_agg(recipient ORDER BY recipient) FROM (
      SELECT DISTINCT deliveries.recipient FROM deliveries
       WHERE deliveries.workspace_id = p_workspace_id AND deliveries.recipient !~ '^erased:'
      UNION
      SELECT users.email FROM memberships JOIN users ON users.id = memberships.user_id
       WHERE memberships.workspace_id = p_workspace_id AND users.disabled_at IS NULL
         AND users.email !~ '^erased\\+'
    ) targets WHERE btrim(recipient) <> ''), '[]'::jsonb)
  ) INTO result;
  INSERT INTO audit_events
    (workspace_id, action, entity_type, entity_id, request_id, metadata)
  SELECT p_workspace_id, 'privacy.deletion_targets.read', 'privacy_request', p_request_id::text,
         request.request_id,
         jsonb_build_object(
           'categories', jsonb_build_array('gsc_refresh_tokens', 'report_storage_keys', 'delivery_recipients'),
           'gscConnectionCount', jsonb_array_length(result->'gscConnections'),
           'storageKeyCount', jsonb_array_length(result->'storageKeys'),
           'recipientCount', jsonb_array_length(result->'recipients')
         )
    FROM privacy_requests request
   WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id;
  RETURN result;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_erasure_subject(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text, p_subject_user_id uuid
) RETURNS TABLE(email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner_count integer;
DECLARE subject_role text;
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM privacy_requests request
        WHERE request.workspace_id = p_workspace_id AND request.id = p_request_id
          AND request.operator_id = p_operator_id AND request.type = 'erasure'
          AND request.subject_user_id = p_subject_user_id AND request.status = 'running'
     )
  THEN
    RAISE EXCEPTION 'privacy erasure requires exact running request and subject' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(privacy_workspace_lock_key(p_workspace_id));
  PERFORM 1 FROM workspaces WHERE id = p_workspace_id FOR UPDATE;
  PERFORM 1
    FROM memberships
   WHERE workspace_id = p_workspace_id
   ORDER BY user_id
   FOR UPDATE;
  SELECT memberships.role, users.email INTO subject_role, email
    FROM memberships JOIN users ON users.id = memberships.user_id
   WHERE memberships.workspace_id = p_workspace_id AND memberships.user_id = p_subject_user_id
     AND users.disabled_at IS NULL
   FOR UPDATE;
  IF email IS NULL THEN
    RAISE EXCEPTION 'privacy erasure subject does not belong to workspace' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::int INTO owner_count
    FROM memberships
   WHERE workspace_id = p_workspace_id AND role = 'owner';
  IF subject_role = 'owner' AND owner_count <= 1 THEN
    RAISE EXCEPTION 'privacy erasure requires ownership transfer or workspace_deletion' USING ERRCODE = '42501';
  END IF;
  RETURN NEXT;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_erase_subject(
  p_workspace_id uuid, p_request_id uuid, p_operator_id text, p_subject_user_id uuid, p_erased_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE subject_email text;
DECLARE remaining_memberships integer;
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_erased_at IS NULL
  THEN
    RAISE EXCEPTION 'privacy subject erasure input is invalid' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO subject_email
    FROM privacy_erasure_subject(p_workspace_id, p_request_id, p_operator_id, p_subject_user_id);
  IF subject_email IS NULL THEN
    RAISE EXCEPTION 'privacy subject erasure requires exact subject' USING ERRCODE = '42501';
  END IF;

  UPDATE deliveries
     SET recipient = 'erased:' || encode(sha256(recipient::bytea), 'hex'),
         last_error = NULL
   WHERE workspace_id = p_workspace_id
     AND lower(recipient) = lower(subject_email)
     AND recipient !~ '^erased:';
  DELETE FROM sessions WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id;
  DELETE FROM oauth_states WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id;
  DELETE FROM legal_acceptances WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id;
  UPDATE audit_events
     SET actor_user_id = NULL,
         metadata = metadata || jsonb_build_object('subjectPrivacyErased', true, 'requestId', p_request_id::text)
   WHERE workspace_id = p_workspace_id AND actor_user_id = p_subject_user_id;
  UPDATE invites
     SET email = 'erased:' || encode(sha256((id::text || p_request_id::text || ':invite')::bytea), 'hex'),
         accepted_by_user_id = NULL,
         accepted_erased_at = greatest(p_erased_at, accepted_at)
   WHERE accepted_workspace_id = p_workspace_id
     AND accepted_by_user_id = p_subject_user_id
     AND accepted_at IS NOT NULL
     AND accepted_erased_at IS NULL;
  DELETE FROM memberships WHERE workspace_id = p_workspace_id AND user_id = p_subject_user_id;
  SELECT count(*)::int INTO remaining_memberships FROM memberships WHERE user_id = p_subject_user_id;
  IF remaining_memberships = 0 THEN
    DELETE FROM password_resets WHERE user_id = p_subject_user_id;
    UPDATE users
       SET email = 'erased+' || encode(sha256((id::text || p_request_id::text)::bytea), 'hex') || '@privacy.semforge.invalid',
           display_name = NULL,
           disabled_at = coalesce(disabled_at, p_erased_at),
           updated_at = p_erased_at
     WHERE id = p_subject_user_id;
  END IF;
END;
$$;--> statement-breakpoint


-- @TASK P1-FINAL-PRIVACY - Stable advisory lock namespace for one workspace erasure
-- @SPEC final_privacy_fence#workspace-privacy-lock
CREATE FUNCTION privacy_workspace_lock_key(p_workspace_id uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT ('x' || substr(md5(p_workspace_id::text), 1, 16))::bit(64)::bigint
$$;--> statement-breakpoint

-- @TASK P1-FINAL-PRIVACY - Recipient-scoped email send/erasure race fence
-- @SPEC final_privacy_fence#recipient-email-lock
CREATE FUNCTION privacy_recipient_email_lock_key(
  p_workspace_id uuid,
  p_recipient_hash text
) RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
BEGIN
  IF p_recipient_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'privacy recipient email lock input is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN ('x' || substr(encode(sha256((p_workspace_id::text || ':' || p_recipient_hash)::bytea), 'hex'), 1, 16))::bit(64)::bigint;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_lock_recipient_email_shared(
  p_workspace_id uuid,
  p_recipient_hash text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_recipient_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'privacy recipient email lock input is invalid' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(
    privacy_recipient_email_lock_key(p_workspace_id, p_recipient_hash)
  );
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_lock_recipient_email_exclusive(
  p_workspace_id uuid,
  p_recipient_hash text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_recipient_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'privacy recipient email lock input is invalid' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(
    privacy_recipient_email_lock_key(p_workspace_id, p_recipient_hash)
  );
END;
$$;--> statement-breakpoint

-- @TASK P1-FINAL-PRIVACY - Fixed-predicate retention executor
-- @SPEC final_privacy_roles#retention-executor
CREATE FUNCTION privacy_retention_count(p_target text, p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE matched integer;
BEGIN
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'retention cutoff is required' USING ERRCODE = '22023';
  END IF;
  CASE p_target
    WHEN 'sessions' THEN SELECT count(*)::int INTO matched FROM sessions WHERE expires_at < p_cutoff OR revoked_at < p_cutoff;
    WHEN 'invites' THEN SELECT count(*)::int INTO matched FROM invites WHERE coalesce(accepted_at, superseded_at, expires_at) < p_cutoff;
    WHEN 'password_resets' THEN SELECT count(*)::int INTO matched FROM password_resets WHERE coalesce(used_at, expires_at) < p_cutoff;
    WHEN 'oauth_states' THEN SELECT count(*)::int INTO matched FROM oauth_states WHERE coalesce(consumed_at, expires_at) < p_cutoff;
    WHEN 'outbox' THEN SELECT count(*)::int INTO matched FROM outbox WHERE published_at IS NOT NULL AND published_at < p_cutoff;
    WHEN 'jobs' THEN SELECT count(*)::int INTO matched FROM jobs WHERE status IN ('succeeded', 'dead') AND updated_at < p_cutoff;
    WHEN 'provider_calls.raw_metadata' THEN SELECT count(*)::int INTO matched FROM provider_calls WHERE completed_at < p_cutoff AND response_metadata ? 'rawResponse';
    WHEN 'deliveries.recipient' THEN SELECT count(*)::int INTO matched FROM deliveries WHERE created_at < p_cutoff AND recipient !~ '^erased:';
    ELSE RAISE EXCEPTION 'retention target is not allowed' USING ERRCODE = '42501';
  END CASE;
  RETURN matched;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_retention_apply(p_target text, p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE changed integer;
BEGIN
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'retention cutoff is required' USING ERRCODE = '22023';
  END IF;
  CASE p_target
    WHEN 'sessions' THEN DELETE FROM sessions WHERE expires_at < p_cutoff OR revoked_at < p_cutoff;
    WHEN 'invites' THEN DELETE FROM invites WHERE coalesce(accepted_at, superseded_at, expires_at) < p_cutoff;
    WHEN 'password_resets' THEN DELETE FROM password_resets WHERE coalesce(used_at, expires_at) < p_cutoff;
    WHEN 'oauth_states' THEN DELETE FROM oauth_states WHERE coalesce(consumed_at, expires_at) < p_cutoff;
    WHEN 'outbox' THEN DELETE FROM outbox WHERE published_at IS NOT NULL AND published_at < p_cutoff;
    WHEN 'jobs' THEN DELETE FROM jobs WHERE status IN ('succeeded', 'dead') AND updated_at < p_cutoff;
    WHEN 'provider_calls.raw_metadata' THEN UPDATE provider_calls SET response_metadata = response_metadata - 'rawResponse' WHERE completed_at < p_cutoff AND response_metadata ? 'rawResponse';
    WHEN 'deliveries.recipient' THEN UPDATE deliveries SET recipient = 'erased:' || encode(sha256(recipient::bytea), 'hex') WHERE created_at < p_cutoff AND recipient !~ '^erased:';
    ELSE RAISE EXCEPTION 'retention target is not allowed' USING ERRCODE = '42501';
  END CASE;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_retention_storage_workspaces()
RETURNS TABLE(workspace_id uuid, storage_prefix text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM backup_deletion_markers marker
     WHERE marker.marker_key = 'backup-erasure-required'
       AND (
         marker.metadata->>'storagePrefix' <> 'reports/' || marker.workspace_id::text || '/'
         OR jsonb_typeof(marker.metadata->'storageKeyHashes') <> 'array'
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(marker.metadata->'storageKeyHashes') value
           WHERE value #>> '{}' !~ '^[0-9a-f]{64}$')
       )
  ) THEN
    RAISE EXCEPTION 'privacy retention storage marker is invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT DISTINCT marker.workspace_id, marker.metadata->>'storagePrefix'
      FROM backup_deletion_markers marker
     WHERE marker.marker_key = 'backup-erasure-required'
     ORDER BY marker.workspace_id;
END;
$$;--> statement-breakpoint

-- @TASK P1-FINAL-PRIVACY - Approved request-scoped workflow bookkeeping
-- @SPEC final_privacy_roles#privacy-request-functions
CREATE FUNCTION privacy_record_request_step(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text,
  p_step_key text,
  p_status text,
  p_last_error text,
  p_metadata jsonb,
  p_completed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_step_key IS NULL OR btrim(p_step_key) = '' OR length(p_step_key) > 300
     OR p_status NOT IN ('succeeded', 'failed', 'skipped') OR p_completed_at IS NULL
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object'
  THEN
    RAISE EXCEPTION 'privacy request step input is invalid' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM privacy_requests
   WHERE workspace_id = p_workspace_id AND id = p_request_id
     AND operator_id = p_operator_id AND status IN ('running', 'failed')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy request step requires matching approved request' USING ERRCODE = '42501';
  END IF;
  INSERT INTO privacy_request_steps
    (workspace_id, request_id, step_key, status, last_error, metadata, completed_at)
  VALUES
    (p_workspace_id, p_request_id, p_step_key, p_status, p_last_error, p_metadata, p_completed_at)
  ON CONFLICT (workspace_id, request_id, step_key) DO UPDATE
    SET status = excluded.status,
        attempts = privacy_request_steps.attempts + 1,
        last_error = excluded.last_error,
        metadata = excluded.metadata,
        completed_at = excluded.completed_at;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_finish_request(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text,
  p_status text,
  p_completed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_status <> 'completed' OR p_completed_at IS NULL
  THEN
    RAISE EXCEPTION 'privacy request completion input is invalid' USING ERRCODE = '42501';
  END IF;
  UPDATE privacy_requests
     SET status = p_status, completed_at = p_completed_at
   WHERE workspace_id = p_workspace_id AND id = p_request_id
     AND operator_id = p_operator_id
     AND (status = 'running' OR (status = 'completed' AND completed_at IS NOT NULL));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy completion requires matching approved request' USING ERRCODE = '42501';
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_fail_request(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text,
  p_failed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_failed_at IS NULL
  THEN
    RAISE EXCEPTION 'privacy request failure input is invalid' USING ERRCODE = '42501';
  END IF;
  UPDATE privacy_requests SET status = 'failed', completed_at = p_failed_at
   WHERE workspace_id = p_workspace_id AND id = p_request_id
     AND operator_id = p_operator_id AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy failure requires exact running request' USING ERRCODE = '42501';
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_set_request_storage_manifest(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text,
  p_manifest jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_manifest IS NULL OR jsonb_typeof(p_manifest) <> 'object'
     OR NOT (p_manifest ?& ARRAY['storageKeyHashes', 'storagePrefix'])
     OR p_manifest - 'storageKeyHashes' - 'storagePrefix' <> '{}'::jsonb
     OR jsonb_typeof(p_manifest->'storageKeyHashes') <> 'array'
     OR p_manifest->>'storagePrefix' <> 'reports/' || p_workspace_id::text || '/'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_manifest->'storageKeyHashes') value
        WHERE jsonb_typeof(value) <> 'string' OR value #>> '{}' !~ '^[0-9a-f]{64}$'
     )
  THEN
    RAISE EXCEPTION 'privacy storage manifest is invalid' USING ERRCODE = '42501';
  END IF;
  UPDATE privacy_requests
     SET metadata = metadata || p_manifest
   WHERE workspace_id = p_workspace_id AND id = p_request_id
     AND operator_id = p_operator_id AND type = 'workspace_deletion' AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy storage manifest requires matching running deletion request'
      USING ERRCODE = '42501';
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION privacy_add_email_suppression(
  p_workspace_id uuid,
  p_request_id uuid,
  p_recipient_hash text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid
     OR p_recipient_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'privacy email suppression input is invalid' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM privacy_requests
   WHERE privacy_requests.workspace_id = p_workspace_id AND privacy_requests.id = p_request_id
     AND privacy_requests.status = 'running'
     AND (
       (privacy_requests.type = 'workspace_deletion' AND privacy_requests.subject_user_id IS NULL)
       OR (
         privacy_requests.type = 'erasure'
         AND EXISTS (
           SELECT 1
             FROM memberships
             JOIN users ON users.id = memberships.user_id
            WHERE memberships.workspace_id = privacy_requests.workspace_id
              AND memberships.user_id = privacy_requests.subject_user_id
              AND users.disabled_at IS NULL
              AND encode(sha256(lower(btrim(users.email))::bytea), 'hex') = p_recipient_hash
         )
       )
     )
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy email suppression requires matching running deletion or erasure request'
      USING ERRCODE = '42501';
  END IF;
  PERFORM privacy_lock_recipient_email_exclusive(p_workspace_id, p_recipient_hash);
  INSERT INTO email_suppressions (workspace_id, recipient_hash, request_id)
  VALUES (p_workspace_id, p_recipient_hash, p_request_id)
  ON CONFLICT (workspace_id, recipient_hash) DO NOTHING;
END;
$$;--> statement-breakpoint

-- @TASK P1-FINAL-PRIVACY - Validate one running deletion before blocking writes
-- @SPEC final_privacy_fence#block-workspace
CREATE FUNCTION privacy_block_workspace(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text,
  p_blocked_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed_controls integer := 0;
BEGIN
  IF p_workspace_id IS NULL OR p_request_id IS NULL OR p_blocked_at IS NULL
     OR p_operator_id IS NULL OR btrim(p_operator_id) = ''
  THEN
    RAISE EXCEPTION 'privacy block identifiers are required' USING ERRCODE = '22023';
  END IF;
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid THEN
    RAISE EXCEPTION 'privacy block workspace does not match tenant context' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM privacy_requests
   WHERE workspace_id = p_workspace_id
     AND id = p_request_id
     AND type = 'workspace_deletion'
     AND status = 'running'
     AND operator_id = p_operator_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy block requires a matching running deletion request'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO workspace_privacy_controls
    (workspace_id, state, deletion_request_id, blocked_at, erased_at)
  VALUES
    (p_workspace_id, 'blocking', p_request_id, p_blocked_at, NULL)
  ON CONFLICT (workspace_id) DO UPDATE
    SET state = 'blocking',
        deletion_request_id = excluded.deletion_request_id,
        blocked_at = CASE
          WHEN workspace_privacy_controls.state = 'blocking'
            THEN workspace_privacy_controls.blocked_at
          ELSE excluded.blocked_at
        END,
        erased_at = NULL,
        generation = workspace_privacy_controls.generation + 1,
        updated_at = p_blocked_at
    WHERE workspace_privacy_controls.state = 'active'
       OR (
         workspace_privacy_controls.state = 'blocking'
         AND workspace_privacy_controls.deletion_request_id = excluded.deletion_request_id
       );
  GET DIAGNOSTICS changed_controls = ROW_COUNT;
  IF changed_controls <> 1 THEN
    RAISE EXCEPTION 'workspace privacy control cannot transition to blocking'
      USING ERRCODE = '55000';
  END IF;
  RETURN 'blocking';
END;
$$;--> statement-breakpoint

-- @TASK P1-FINAL-PRIVACY - Mark only the validated blocked deletion as erased
-- @SPEC final_privacy_fence#mark-workspace-erased
CREATE FUNCTION privacy_mark_workspace_erased(
  p_workspace_id uuid,
  p_request_id uuid,
  p_operator_id text,
  p_erased_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_blocked_at timestamptz;
BEGIN
  IF p_workspace_id IS NULL OR p_request_id IS NULL OR p_erased_at IS NULL
     OR p_operator_id IS NULL OR btrim(p_operator_id) = ''
  THEN
    RAISE EXCEPTION 'privacy erased identifiers are required' USING ERRCODE = '22023';
  END IF;
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid THEN
    RAISE EXCEPTION 'privacy erased workspace does not match tenant context' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
    FROM privacy_requests
   WHERE workspace_id = p_workspace_id
     AND id = p_request_id
     AND type = 'workspace_deletion'
     AND status = 'running'
     AND operator_id = p_operator_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy erased transition requires a matching running deletion request'
      USING ERRCODE = '42501';
  END IF;

  SELECT blocked_at
    INTO current_blocked_at
    FROM workspace_privacy_controls
   WHERE workspace_id = p_workspace_id
     AND deletion_request_id = p_request_id
     AND state IN ('blocking', 'erased')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace privacy control is not blocked by this deletion request'
      USING ERRCODE = '55000';
  END IF;
  IF p_erased_at < current_blocked_at THEN
    RAISE EXCEPTION 'privacy erased timestamp precedes blocked timestamp'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM privacy_request_steps
     WHERE workspace_id = p_workspace_id AND request_id = p_request_id
       AND step_key = 'local.erasure' AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'privacy erased transition requires completed local erasure'
      USING ERRCODE = '55000';
  END IF;

  UPDATE workspace_privacy_controls
     SET state = 'erased',
         erased_at = coalesce(erased_at, p_erased_at),
         generation = CASE WHEN state = 'blocking' THEN generation + 1 ELSE generation END,
         updated_at = CASE WHEN state = 'blocking' THEN p_erased_at ELSE updated_at END
   WHERE workspace_id = p_workspace_id
     AND deletion_request_id = p_request_id;
  RETURN 'erased';
END;
$$;--> statement-breakpoint

-- @TASK P5-PRIVACY - Auditable privacy erasure procedure for immutable reports
CREATE FUNCTION privacy_erase_workspace(p_workspace_id uuid, p_request_id uuid, p_operator_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  customer_hash text;
  storage_manifest jsonb;
BEGIN
  IF p_workspace_id IS DISTINCT FROM nullif(current_setting('app.workspace_id', true), '')::uuid THEN
    RAISE EXCEPTION 'privacy erasure workspace does not match tenant context'
      USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
           'storagePrefix', metadata->>'storagePrefix',
           'storageKeyHashes', coalesce(metadata->'storageKeyHashes', '[]'::jsonb)
         )
    INTO storage_manifest
    FROM privacy_requests
   WHERE workspace_id = p_workspace_id
     AND id = p_request_id
     AND type = 'workspace_deletion'
     AND status = 'running'
     AND operator_id = p_operator_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy erasure requires a matching running deletion request'
      USING ERRCODE = '42501';
  END IF;
  IF storage_manifest->>'storagePrefix' <> 'reports/' || p_workspace_id::text || '/'
     OR jsonb_typeof(storage_manifest->'storageKeyHashes') <> 'array'
  THEN
    RAISE EXCEPTION 'privacy erasure storage manifest is invalid'
      USING ERRCODE = '22023';
  END IF;
  PERFORM 1
    FROM workspace_privacy_controls
   WHERE workspace_id = p_workspace_id
     AND deletion_request_id = p_request_id
     AND state = 'blocking'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy erasure requires the matching workspace privacy block'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.privacy_erasure_request_id', p_request_id::text, true);
  PERFORM set_config('app.privacy_erasure_procedure', 'privacy_erase_workspace', true);

  SELECT encode(sha256(coalesce(string_agg(toss_customer_key, ',' order by toss_customer_key), '')::bytea), 'hex')
    INTO customer_hash
    FROM billing_customers
   WHERE workspace_id = p_workspace_id;

  INSERT INTO privacy_billing_tombstones
    (workspace_id, request_id, customer_key_hash, legal_hold, retained_reason)
  VALUES
    (p_workspace_id, p_request_id, coalesce(customer_hash, repeat('0', 64)), true,
     'billing ledger retained for legal, tax, dispute, refund, and chargeback handling')
  ON CONFLICT (workspace_id, request_id) DO NOTHING;

  UPDATE billing_ledger_events
     SET entity_id = encode(sha256(entity_id::bytea), 'hex'),
         order_id = CASE WHEN order_id IS NULL THEN NULL ELSE encode(sha256(order_id::bytea), 'hex') END,
         metadata = jsonb_build_object('privacyErased', true, 'requestId', p_request_id::text)
   WHERE workspace_id = p_workspace_id;

  UPDATE audit_events
     SET actor_user_id = NULL,
         entity_id = CASE
           WHEN entity_id IS NULL THEN NULL
           ELSE encode(sha256(entity_id::bytea), 'hex')
         END,
         metadata = jsonb_build_object('privacyErased', true, 'requestId', p_request_id::text)
   WHERE workspace_id = p_workspace_id;

  UPDATE billing_customers
     SET toss_customer_key = 'erased:' || encode(sha256(toss_customer_key::bytea), 'hex'),
         updated_at = now()
   WHERE workspace_id = p_workspace_id;

  UPDATE payment_methods
     SET billing_key_encrypted = 'enc:v1:erased',
         billing_key_fingerprint = encode(sha256((billing_key_fingerprint || p_request_id::text)::bytea), 'hex'),
         card_brand = NULL,
         card_last4 = NULL,
         active = false,
         replaced_at = coalesce(replaced_at, now()),
         updated_at = now()
   WHERE workspace_id = p_workspace_id;

  UPDATE payments
     SET order_id = 'erased:' || encode(sha256(order_id::bytea), 'hex'),
         toss_payment_key = CASE WHEN toss_payment_key IS NULL THEN NULL
           ELSE 'erased:' || encode(sha256(toss_payment_key::bytea), 'hex') END,
         failure_message = NULL,
         updated_at = now()
   WHERE workspace_id = p_workspace_id;

  UPDATE provider_events
     SET provider_event_id = 'erased:' || encode(sha256(provider_event_id::bytea), 'hex'),
         payload = jsonb_build_object('privacyErased', true, 'requestId', p_request_id::text),
         processing_error = NULL
   WHERE workspace_id = p_workspace_id;

  UPDATE subscriptions
     SET status = CASE WHEN status = 'canceled' THEN status ELSE 'canceled'::subscription_status END,
         payment_method_id = NULL,
         grace_ends_at = NULL,
         canceled_at = coalesce(canceled_at, now()),
         updated_at = now()
   WHERE workspace_id = p_workspace_id;

  UPDATE deliveries
     SET recipient = 'erased:' || encode(sha256(recipient::bytea), 'hex'),
         last_error = NULL
   WHERE workspace_id = p_workspace_id;

  DELETE FROM report_sections WHERE workspace_id = p_workspace_id;
  DELETE FROM report_assets WHERE workspace_id = p_workspace_id;
  DELETE FROM weekly_reports WHERE workspace_id = p_workspace_id;
  DELETE FROM gsc_property_bindings WHERE workspace_id = p_workspace_id;
  DELETE FROM gsc_connections WHERE workspace_id = p_workspace_id;
  DELETE FROM oauth_states WHERE workspace_id = p_workspace_id;
  DELETE FROM rank_observations WHERE workspace_id = p_workspace_id;
  DELETE FROM aio_citations WHERE workspace_id = p_workspace_id;
  DELETE FROM aio_observations WHERE workspace_id = p_workspace_id;
  DELETE FROM naver_observation_sources WHERE workspace_id = p_workspace_id;
  DELETE FROM naver_observations WHERE workspace_id = p_workspace_id;
  DELETE FROM gsc_observations WHERE workspace_id = p_workspace_id;
  DELETE FROM usage_reservations WHERE workspace_id = p_workspace_id;
  DELETE FROM provider_calls WHERE workspace_id = p_workspace_id;
  DELETE FROM tracked_queries WHERE workspace_id = p_workspace_id;
  DELETE FROM sites WHERE workspace_id = p_workspace_id;
  DELETE FROM outbox WHERE workspace_id = p_workspace_id;
  DELETE FROM jobs WHERE workspace_id = p_workspace_id;
  DELETE FROM invites WHERE accepted_workspace_id = p_workspace_id;
  DELETE FROM legal_acceptances WHERE workspace_id = p_workspace_id;
  DELETE FROM sessions WHERE workspace_id = p_workspace_id;
  DELETE FROM password_resets
   WHERE user_id IN (
     SELECT target_membership.user_id
       FROM memberships target_membership
      WHERE target_membership.workspace_id = p_workspace_id
        AND NOT EXISTS (
          SELECT 1
            FROM memberships other_membership
           WHERE other_membership.user_id = target_membership.user_id
             AND other_membership.workspace_id <> p_workspace_id
        )
   );
  UPDATE users
     SET email = 'erased+' || encode(sha256((users.id::text || p_request_id::text)::bytea), 'hex') || '@privacy.semforge.invalid',
         display_name = NULL,
         disabled_at = coalesce(disabled_at, now()),
         updated_at = now()
   WHERE id IN (
     SELECT target_membership.user_id
       FROM memberships target_membership
      WHERE target_membership.workspace_id = p_workspace_id
        AND NOT EXISTS (
          SELECT 1
            FROM memberships other_membership
           WHERE other_membership.user_id = target_membership.user_id
             AND other_membership.workspace_id <> p_workspace_id
        )
   );
  DELETE FROM memberships WHERE workspace_id = p_workspace_id;
  UPDATE workspaces
     SET name = 'erased:' || encode(sha256((id::text || p_request_id::text || ':name')::bytea), 'hex'),
         slug = 'erased-' || left(encode(sha256((id::text || p_request_id::text || ':slug')::bytea), 'hex'), 32),
         logo_url = NULL,
         accent_color = '#667085',
         updated_at = now()
   WHERE id = p_workspace_id;
  INSERT INTO backup_deletion_markers
    (workspace_id, request_id, marker_key, runbook_ref, metadata)
  VALUES
    (p_workspace_id, p_request_id, 'backup-erasure-required',
     'docs/ops/privacy-erasure-runbook.md',
     jsonb_build_object(
       'operatorId', p_operator_id,
       'createdAt', now(),
       'storagePrefix', storage_manifest->>'storagePrefix',
       'storageKeyHashes', storage_manifest->'storageKeyHashes'
     ))
  ON CONFLICT (workspace_id, request_id, marker_key) DO NOTHING;
END;
$$;--> statement-breakpoint

-- @TASK P1-D3 - Web/auth/operator/worker role boundary and tenant RLS
-- semforge_* runtime roles are NOLOGIN privilege groups. Infrastructure must provision
-- distinct LOGIN INHERIT members and grant exactly one runtime group to each account.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_web') THEN CREATE ROLE semforge_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_auth') THEN CREATE ROLE semforge_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_operator') THEN CREATE ROLE semforge_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_dispatcher') THEN CREATE ROLE semforge_dispatcher NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_scheduler') THEN CREATE ROLE semforge_scheduler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_worker') THEN CREATE ROLE semforge_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_billing') THEN CREATE ROLE semforge_billing NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_billing_tenant') THEN CREATE ROLE semforge_billing_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_privacy') THEN CREATE ROLE semforge_privacy NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_retention') THEN CREATE ROLE semforge_retention NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_privacy_owner') THEN CREATE ROLE semforge_privacy_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_retention_owner') THEN CREATE ROLE semforge_retention_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'semforge_secret_scrubber') THEN CREATE ROLE semforge_secret_scrubber NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF;
END
$$;--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO semforge_web, semforge_auth, semforge_operator, semforge_dispatcher, semforge_scheduler, semforge_worker, semforge_billing, semforge_billing_tenant, semforge_privacy, semforge_retention;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO semforge_secret_scrubber;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO semforge_privacy_owner, semforge_retention_owner;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspaces, memberships, sites, tracked_queries,
  gsc_connections, oauth_states, gsc_property_bindings
TO semforge_web;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_events, provider_calls, usage_reservations, jobs, outbox TO semforge_web;--> statement-breakpoint
GRANT SELECT ON rank_observations, aio_observations, aio_citations, naver_observations,
  naver_observation_sources, gsc_observations, weekly_reports, report_sections, report_assets, deliveries,
  payments, provider_events, billing_ledger_events, legal_acceptances TO semforge_web;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users TO semforge_auth;--> statement-breakpoint
GRANT SELECT ON invites TO semforge_auth;--> statement-breakpoint
GRANT UPDATE (accepted_at, accepted_workspace_id, accepted_by_user_id) ON invites TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON password_resets TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_action_throttles TO semforge_auth;--> statement-breakpoint
GRANT SELECT, INSERT ON workspaces, memberships TO semforge_auth;--> statement-breakpoint
GRANT INSERT ON billing_customers, subscriptions TO semforge_auth;--> statement-breakpoint
GRANT INSERT ON legal_acceptances TO semforge_auth;--> statement-breakpoint
GRANT INSERT (workspace_id, topic, payload, idempotency_key, available_at, created_at) ON outbox TO semforge_auth;--> statement-breakpoint
GRANT SELECT ON invites TO semforge_operator;--> statement-breakpoint
GRANT INSERT (email, token_hash, workspace_name, workspace_slug, release_target, expires_at) ON invites TO semforge_operator;--> statement-breakpoint
GRANT UPDATE (superseded_at) ON invites TO semforge_operator;--> statement-breakpoint
GRANT SELECT ON jobs TO semforge_dispatcher;--> statement-breakpoint
GRANT INSERT (workspace_id, type, payload, idempotency_key, priority, available_at, max_attempts)
  ON jobs TO semforge_dispatcher;--> statement-breakpoint
GRANT UPDATE (status, available_at, lease_owner, lease_token, lease_generation,
  lease_expires_at, attempts, last_error, updated_at) ON jobs TO semforge_dispatcher;--> statement-breakpoint
GRANT SELECT ON outbox TO semforge_dispatcher;--> statement-breakpoint
GRANT UPDATE (available_at, lease_owner, lease_token, lease_generation,
  lease_expires_at, attempts, published_at, last_error) ON outbox TO semforge_dispatcher;--> statement-breakpoint
GRANT INSERT ON audit_events TO semforge_dispatcher;--> statement-breakpoint
GRANT SELECT (workspace_id, id, type, payload) ON jobs TO semforge_secret_scrubber;--> statement-breakpoint
GRANT UPDATE (payload, updated_at) ON jobs TO semforge_secret_scrubber;--> statement-breakpoint
GRANT SELECT (workspace_id, topic, payload, idempotency_key) ON outbox TO semforge_secret_scrubber;--> statement-breakpoint
GRANT UPDATE (payload) ON outbox TO semforge_secret_scrubber;--> statement-breakpoint
GRANT SELECT ON sites, tracked_queries, gsc_property_bindings TO semforge_scheduler;--> statement-breakpoint
GRANT SELECT (workspace_id, status, current_period_end) ON subscriptions TO semforge_scheduler;--> statement-breakpoint
GRANT INSERT (workspace_id, topic, payload, idempotency_key, available_at, created_at)
  ON outbox TO semforge_scheduler;--> statement-breakpoint
GRANT SELECT (workspace_id, topic, idempotency_key) ON outbox TO semforge_scheduler;--> statement-breakpoint
GRANT SELECT ON workspaces, memberships, sites, tracked_queries, gsc_connections,
  gsc_property_bindings, billing_customers, payment_methods, subscriptions TO semforge_worker;--> statement-breakpoint
GRANT SELECT ON email_suppressions TO semforge_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_calls, usage_reservations,
  rank_observations, aio_observations, aio_citations, naver_observations, naver_observation_sources, gsc_observations,
  weekly_reports, report_sections, report_assets, deliveries, payments, provider_events
TO semforge_worker;--> statement-breakpoint
GRANT INSERT (workspace_id, topic, payload, idempotency_key)
  ON outbox TO semforge_worker;--> statement-breakpoint
GRANT INSERT ON audit_events TO semforge_worker;--> statement-breakpoint
GRANT SELECT ON billing_customers TO semforge_billing;--> statement-breakpoint
GRANT SELECT ON subscriptions, payment_methods, payments, provider_events TO semforge_billing;--> statement-breakpoint
GRANT UPDATE (payment_method_id, status, current_period_start, current_period_end, grace_ends_at, canceled_at, updated_at) ON subscriptions TO semforge_billing;--> statement-breakpoint
GRANT UPDATE (active, replaced_at, updated_at) ON payment_methods TO semforge_billing;--> statement-breakpoint
GRANT UPDATE (status, toss_payment_key, failure_code, failure_message, paid_at, updated_at) ON payments TO semforge_billing;--> statement-breakpoint
GRANT INSERT (id, workspace_id, provider, provider_event_id, event_type, payload, received_at) ON provider_events TO semforge_billing;--> statement-breakpoint
GRANT UPDATE (processed_at, processing_error) ON provider_events TO semforge_billing;--> statement-breakpoint
GRANT INSERT (id, workspace_id, type, entity_id, actor_user_id, request_id, occurred_at, amount_krw, order_id, payment_status, provider_code) ON billing_ledger_events TO semforge_billing;--> statement-breakpoint
GRANT SELECT ON billing_customers TO semforge_billing_tenant;--> statement-breakpoint
GRANT SELECT ON subscriptions, payment_methods, payments TO semforge_billing_tenant;--> statement-breakpoint
GRANT UPDATE (payment_method_id, status, current_period_start, current_period_end, grace_ends_at, canceled_at, updated_at) ON subscriptions TO semforge_billing_tenant;--> statement-breakpoint
GRANT INSERT (id, workspace_id, billing_customer_id, billing_key_encrypted, billing_key_fingerprint, card_brand, card_last4, active, replaced_at) ON payment_methods TO semforge_billing_tenant;--> statement-breakpoint
GRANT UPDATE (active, replaced_at, updated_at) ON payment_methods TO semforge_billing_tenant;--> statement-breakpoint
GRANT INSERT (id, workspace_id, subscription_id, order_id, idempotency_key, toss_payment_key, status, amount_krw, billing_period_start, billing_period_end, attempt, failure_code, failure_message, paid_at) ON payments TO semforge_billing_tenant;--> statement-breakpoint
GRANT UPDATE (status, toss_payment_key, failure_code, failure_message, paid_at, updated_at) ON payments TO semforge_billing_tenant;--> statement-breakpoint
GRANT INSERT (id, workspace_id, type, entity_id, actor_user_id, request_id, occurred_at, amount_krw, order_id, payment_status, provider_code) ON billing_ledger_events TO semforge_billing_tenant;--> statement-breakpoint
-- @TASK P1-FINAL-PRIVACY - DSAR executor can observe only its approved request state
-- @SPEC final_privacy_roles#privacy-executor
GRANT SELECT ON workspace_privacy_controls
  TO semforge_web, semforge_auth, semforge_worker, semforge_scheduler, semforge_dispatcher, semforge_billing, semforge_billing_tenant;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspaces, users, memberships, legal_acceptances, privacy_requests, privacy_request_steps,
  privacy_billing_tombstones, backup_deletion_markers, email_suppressions,
  gsc_connections, gsc_property_bindings, oauth_states, weekly_reports, report_sections, report_assets,
  deliveries, rank_observations, aio_observations, aio_citations, naver_observations,
  naver_observation_sources, gsc_observations, tracked_queries, sites, outbox, jobs, sessions,
  password_resets, invites, billing_customers, payment_methods, billing_ledger_events, audit_events,
  subscriptions, payments, provider_events, provider_calls, usage_reservations,
  workspace_privacy_controls
TO semforge_privacy_owner;--> statement-breakpoint
GRANT SELECT, UPDATE, DELETE ON sessions, invites, password_resets, oauth_states, outbox, jobs,
  provider_calls, deliveries, backup_deletion_markers TO semforge_retention_owner;--> statement-breakpoint

GRANT CREATE ON SCHEMA public TO semforge_privacy_owner, semforge_retention_owner;--> statement-breakpoint
ALTER FUNCTION initialize_workspace_privacy_control() OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_open_request(uuid, text, text, text, timestamptz, uuid) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_open_request(uuid, text, text, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_claim_request(uuid, text, text, text, timestamptz, uuid) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_claim_request(uuid, text, text, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_succeeded_request_steps(uuid, uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_export_workspace(uuid, uuid, text, uuid) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_export_workspace(uuid, uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_correct_workspace(uuid, uuid, text, text, text, timestamptz, uuid) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_correct_workspace(uuid, uuid, text, text, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_deletion_targets(uuid, uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_erasure_subject(uuid, uuid, text, uuid) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_erase_subject(uuid, uuid, text, uuid, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_workspace_lock_key(uuid) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_recipient_email_lock_key(uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_lock_recipient_email_shared(uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_lock_recipient_email_exclusive(uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_block_workspace(uuid, uuid, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_mark_workspace_erased(uuid, uuid, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_erase_workspace(uuid, uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_record_request_step(uuid, uuid, text, text, text, text, jsonb, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_finish_request(uuid, uuid, text, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_fail_request(uuid, uuid, text, timestamptz) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_set_request_storage_manifest(uuid, uuid, text, jsonb) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_add_email_suppression(uuid, uuid, text) OWNER TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION privacy_retention_count(text, timestamptz) OWNER TO semforge_retention_owner;--> statement-breakpoint
ALTER FUNCTION privacy_retention_apply(text, timestamptz) OWNER TO semforge_retention_owner;--> statement-breakpoint
ALTER FUNCTION privacy_retention_storage_workspaces() OWNER TO semforge_retention_owner;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM semforge_privacy_owner, semforge_retention_owner;--> statement-breakpoint

REVOKE ALL ON FUNCTION privacy_open_request(uuid, text, text, text, timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_open_request(uuid, text, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION initialize_workspace_privacy_control() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_claim_request(uuid, text, text, text, timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_claim_request(uuid, text, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_succeeded_request_steps(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_export_workspace(uuid, uuid, text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_export_workspace(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_correct_workspace(uuid, uuid, text, text, text, timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_correct_workspace(uuid, uuid, text, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_deletion_targets(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_erasure_subject(uuid, uuid, text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_erase_subject(uuid, uuid, text, uuid, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_workspace_lock_key(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_recipient_email_lock_key(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_lock_recipient_email_shared(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_lock_recipient_email_exclusive(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_block_workspace(uuid, uuid, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_mark_workspace_erased(uuid, uuid, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_erase_workspace(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_retention_count(text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_retention_apply(text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_retention_storage_workspaces() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_record_request_step(uuid, uuid, text, text, text, text, jsonb, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_finish_request(uuid, uuid, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_fail_request(uuid, uuid, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_set_request_storage_manifest(uuid, uuid, text, jsonb) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION privacy_add_email_suppression(uuid, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_open_request(uuid, text, text, text, timestamptz, uuid) TO semforge_operator;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_open_request(uuid, text, text, text, timestamptz) TO semforge_operator;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_claim_request(uuid, text, text, text, timestamptz, uuid) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_claim_request(uuid, text, text, text, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_succeeded_request_steps(uuid, uuid, text) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_export_workspace(uuid, uuid, text, uuid) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_export_workspace(uuid, uuid, text) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_correct_workspace(uuid, uuid, text, text, text, timestamptz, uuid) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_correct_workspace(uuid, uuid, text, text, text, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_deletion_targets(uuid, uuid, text) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_erasure_subject(uuid, uuid, text, uuid) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_erase_subject(uuid, uuid, text, uuid, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_workspace_lock_key(uuid)
  TO semforge_web, semforge_auth, semforge_worker, semforge_scheduler, semforge_dispatcher, semforge_billing, semforge_billing_tenant, semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_lock_recipient_email_shared(uuid, text)
  TO semforge_worker, semforge_dispatcher;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_lock_recipient_email_exclusive(uuid, text)
  TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_block_workspace(uuid, uuid, text, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_mark_workspace_erased(uuid, uuid, text, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_erase_workspace(uuid, uuid, text) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_record_request_step(uuid, uuid, text, text, text, text, jsonb, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_finish_request(uuid, uuid, text, text, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_fail_request(uuid, uuid, text, timestamptz) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_set_request_storage_manifest(uuid, uuid, text, jsonb) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_add_email_suppression(uuid, uuid, text) TO semforge_privacy;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_retention_count(text, timestamptz) TO semforge_retention;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_retention_apply(text, timestamptz) TO semforge_retention;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION privacy_retention_storage_workspaces() TO semforge_retention;--> statement-breakpoint
REVOKE DELETE ON weekly_reports, report_sections, report_assets, deliveries FROM semforge_worker, semforge_web, semforge_billing;--> statement-breakpoint

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
  USING (id = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
DO $$
DECLARE tenant_table text;
BEGIN
	  FOREACH tenant_table IN ARRAY ARRAY[
	    'memberships', 'audit_events', 'legal_acceptances',
	    'privacy_requests', 'privacy_request_steps', 'privacy_billing_tombstones', 'backup_deletion_markers',
	    'sites', 'tracked_queries',
	    'gsc_connections', 'oauth_states', 'gsc_property_bindings',
    'provider_calls', 'usage_reservations', 'jobs', 'outbox',
    'rank_observations', 'aio_observations', 'aio_citations',
    'naver_observations', 'naver_observation_sources', 'gsc_observations',
    'weekly_reports', 'report_sections', 'report_assets', 'deliveries',
    'billing_customers', 'payment_methods', 'subscriptions', 'payments', 'provider_events', 'billing_ledger_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    IF tenant_table NOT IN ('billing_customers', 'payment_methods', 'subscriptions') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I TO semforge_web USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
        tenant_table || '_tenant_isolation', tenant_table
      );
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
CREATE POLICY memberships_auth_select ON memberships FOR SELECT TO semforge_auth USING (true);--> statement-breakpoint
CREATE POLICY memberships_auth_insert ON memberships FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY legal_acceptances_auth_insert ON legal_acceptances FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY billing_customers_auth_insert ON billing_customers FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY subscriptions_auth_insert ON subscriptions FOR INSERT TO semforge_auth WITH CHECK (true);--> statement-breakpoint
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
CREATE POLICY outbox_auth_insert ON outbox FOR INSERT TO semforge_auth
  WITH CHECK (
    topic = 'email.password_reset'
    AND payload->>'kind' = 'password_reset'
    AND valid_password_reset_payload(payload)
    AND idempotency_key = 'password-reset:' || (payload->>'resetId')
  );--> statement-breakpoint
CREATE POLICY audit_events_worker_insert ON audit_events FOR INSERT TO semforge_worker
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY outbox_worker_insert ON outbox FOR INSERT TO semforge_worker
  WITH CHECK (
    workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    AND topic IN ('report.pdf.render', 'report.email.deliver')
  );--> statement-breakpoint
CREATE POLICY audit_events_dispatcher_insert ON audit_events FOR INSERT TO semforge_dispatcher
  WITH CHECK (true);--> statement-breakpoint
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
	    'provider_calls', 'usage_reservations',
    'rank_observations', 'aio_observations', 'aio_citations', 'naver_observations', 'naver_observation_sources', 'gsc_observations',
    'weekly_reports', 'report_sections', 'report_assets', 'deliveries',
    'billing_customers', 'payment_methods', 'subscriptions', 'payments', 'provider_events', 'billing_ledger_events'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I TO semforge_worker USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      worker_table || '_worker_access', worker_table);
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE email_suppressions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY email_suppressions_worker_select ON email_suppressions FOR SELECT TO semforge_worker
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE workspace_privacy_controls ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workspace_privacy_controls FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspace_privacy_controls_tenant_select ON workspace_privacy_controls FOR SELECT
  TO semforge_web, semforge_auth, semforge_worker, semforge_billing, semforge_billing_tenant
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY workspace_privacy_controls_pipeline_select ON workspace_privacy_controls FOR SELECT
  TO semforge_scheduler, semforge_dispatcher
  USING (true);--> statement-breakpoint
CREATE POLICY workspaces_privacy_owner_access ON workspaces TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY users_privacy_owner_access ON users TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY sessions_privacy_owner_access ON sessions TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY password_resets_privacy_owner_access ON password_resets TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY invites_privacy_owner_access ON invites TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY email_suppressions_privacy_owner_access ON email_suppressions TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY workspace_privacy_controls_owner_access ON workspace_privacy_controls TO semforge_privacy_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY sessions_retention_owner_access ON sessions TO semforge_retention_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY password_resets_retention_owner_access ON password_resets TO semforge_retention_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY invites_retention_owner_access ON invites TO semforge_retention_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint
DO $$
DECLARE owner_table text;
BEGIN
  FOREACH owner_table IN ARRAY ARRAY[
    'memberships', 'audit_events', 'legal_acceptances', 'privacy_requests', 'privacy_request_steps',
    'privacy_billing_tombstones', 'backup_deletion_markers', 'sites', 'tracked_queries',
    'gsc_connections', 'oauth_states', 'gsc_property_bindings', 'provider_calls', 'usage_reservations', 'jobs', 'outbox',
    'rank_observations', 'aio_observations', 'aio_citations', 'naver_observations',
    'naver_observation_sources', 'gsc_observations', 'weekly_reports', 'report_sections',
    'report_assets', 'deliveries', 'billing_customers', 'payment_methods', 'subscriptions', 'payments',
    'provider_events', 'billing_ledger_events'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I TO semforge_privacy_owner USING (true) WITH CHECK (true)',
      owner_table || '_privacy_owner_access', owner_table);
  END LOOP;
  FOREACH owner_table IN ARRAY ARRAY[
    'backup_deletion_markers', 'oauth_states', 'provider_calls', 'jobs', 'outbox', 'deliveries'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I TO semforge_retention_owner USING (true) WITH CHECK (true)',
      owner_table || '_retention_owner_access', owner_table);
  END LOOP;
END
$$;--> statement-breakpoint
-- @TASK P1-FINAL-PRIVACY - Missing/non-active controls fail closed for new tenant work
-- @SPEC final_privacy_fence#write-fence
CREATE FUNCTION reject_blocked_workspace_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_workspace uuid;
  privacy_state text;
BEGIN
  IF current_setting('app.privacy_erasure_procedure', true) = 'privacy_erase_workspace' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'workspaces' THEN
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    target_workspace := NEW.id;
  ELSIF TG_TABLE_NAME = 'invites' THEN
    target_workspace := NEW.accepted_workspace_id;
    IF target_workspace IS NULL THEN RETURN NEW; END IF;
  ELSE
    target_workspace := nullif(to_jsonb(NEW)->>'workspace_id', '')::uuid;
  END IF;
  SELECT state INTO privacy_state FROM workspace_privacy_controls
   WHERE workspace_id = target_workspace;
  IF TG_TABLE_NAME = 'outbox'
     AND TG_OP = 'UPDATE'
     AND privacy_state IS DISTINCT FROM 'active'
     AND to_jsonb(OLD)->>'published_at' IS NULL
     AND to_jsonb(NEW)->>'published_at' IS NOT NULL
     AND to_jsonb(NEW)->>'lease_owner' IS NULL
     AND to_jsonb(NEW)->>'lease_token' IS NULL
     AND to_jsonb(NEW)->>'lease_expires_at' IS NULL
     AND to_jsonb(NEW)->>'last_error' = 'WORKSPACE_PRIVACY_SUPPRESSED'
     AND (
       to_jsonb(NEW) - ARRAY['published_at', 'lease_owner', 'lease_token', 'lease_expires_at', 'last_error']
     ) = (
       to_jsonb(OLD) - ARRAY['published_at', 'lease_owner', 'lease_token', 'lease_expires_at', 'last_error']
     )
  THEN
    RETURN NEW;
  END IF;
  IF privacy_state IS NULL OR privacy_state = 'erased' THEN
    RAISE EXCEPTION 'workspace is unavailable by privacy control' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO semforge_privacy_owner;--> statement-breakpoint
ALTER FUNCTION reject_blocked_workspace_insert() OWNER TO semforge_privacy_owner;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM semforge_privacy_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION reject_blocked_workspace_insert() FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE fenced_table text;
BEGIN
  FOREACH fenced_table IN ARRAY ARRAY[
    'workspaces', 'invites', 'memberships', 'legal_acceptances', 'sessions', 'audit_events',
    'jobs', 'outbox', 'sites', 'tracked_queries',
    'gsc_connections', 'gsc_property_bindings', 'oauth_states', 'provider_calls', 'usage_reservations',
    'rank_observations', 'aio_observations', 'aio_citations',
    'naver_observations', 'naver_observation_sources', 'gsc_observations', 'weekly_reports',
    'report_sections', 'report_assets', 'deliveries', 'billing_customers', 'payment_methods',
    'subscriptions', 'payments', 'provider_events', 'billing_ledger_events'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION reject_blocked_workspace_insert()',
      fenced_table || '_privacy_write_fence', fenced_table
    );
  END LOOP;
END
$$;--> statement-breakpoint
CREATE POLICY jobs_dispatcher_access ON jobs TO semforge_dispatcher
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY outbox_dispatcher_access ON outbox TO semforge_dispatcher
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY jobs_password_reset_scrubber ON jobs TO semforge_secret_scrubber
  USING (type = 'email.password_reset') WITH CHECK (type = 'email.password_reset');--> statement-breakpoint
CREATE POLICY outbox_password_reset_scrubber ON outbox TO semforge_secret_scrubber
  USING (topic = 'email.password_reset') WITH CHECK (topic = 'email.password_reset');--> statement-breakpoint
-- @TASK P5-S1-T1 - Remove encrypted reset delivery from queue storage after terminal handling.
CREATE FUNCTION scrub_password_reset_delivery(
  p_workspace_id uuid,
  p_job_id uuid,
  p_reset_id uuid,
  p_state text,
  p_scrubbed_at timestamptz,
  p_provider_message_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  scrubbed_payload jsonb;
  changed_jobs integer := 0;
BEGIN
  IF p_workspace_id IS NULL OR p_job_id IS NULL OR p_reset_id IS NULL OR p_scrubbed_at IS NULL THEN
    RAISE EXCEPTION 'password reset scrub identifiers are required' USING ERRCODE = '22023';
  END IF;
  IF p_state NOT IN ('delivered', 'rejected', 'expired', 'invalid', 'retry_exhausted') THEN
    RAISE EXCEPTION 'password reset scrub state is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_state = 'delivered' AND (p_provider_message_id IS NULL OR btrim(p_provider_message_id) = '') THEN
    RAISE EXCEPTION 'delivered reset requires provider message id' USING ERRCODE = '22023';
  END IF;
  IF p_provider_message_id IS NOT NULL AND length(p_provider_message_id) > 200 THEN
    RAISE EXCEPTION 'provider message id is invalid' USING ERRCODE = '22023';
  END IF;

  scrubbed_payload := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'password_reset_scrubbed',
    'resetId', p_reset_id::text,
    'state', p_state,
    'scrubbedAt', to_jsonb(p_scrubbed_at),
    'providerMessageId', CASE WHEN p_state = 'delivered' THEN p_provider_message_id ELSE NULL END
  ));

  UPDATE jobs
     SET payload = scrubbed_payload, updated_at = p_scrubbed_at
   WHERE workspace_id = p_workspace_id
     AND id = p_job_id
     AND type = 'email.password_reset'
     AND payload->>'resetId' = p_reset_id::text
     AND (
       payload->>'kind' = 'password_reset'
       OR payload = scrubbed_payload
     );
  GET DIAGNOSTICS changed_jobs = ROW_COUNT;

  UPDATE outbox
     SET payload = scrubbed_payload
   WHERE workspace_id = p_workspace_id
     AND topic = 'email.password_reset'
     AND idempotency_key = 'password-reset:' || p_reset_id::text
     AND payload->>'resetId' = p_reset_id::text
     AND (
       payload->>'kind' = 'password_reset'
       OR payload = scrubbed_payload
     );

  RETURN changed_jobs = 1;
END;
$$;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO semforge_secret_scrubber;--> statement-breakpoint
ALTER FUNCTION scrub_password_reset_delivery(uuid, uuid, uuid, text, timestamptz, text)
  OWNER TO semforge_secret_scrubber;--> statement-breakpoint
ALTER FUNCTION scrub_dead_password_reset_job()
  OWNER TO semforge_secret_scrubber;--> statement-breakpoint
ALTER FUNCTION scrub_dead_password_reset_outbox()
  OWNER TO semforge_secret_scrubber;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM semforge_secret_scrubber;--> statement-breakpoint
REVOKE ALL ON FUNCTION scrub_password_reset_delivery(uuid, uuid, uuid, text, timestamptz, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION scrub_password_reset_delivery(uuid, uuid, uuid, text, timestamptz, text) TO semforge_dispatcher;--> statement-breakpoint
REVOKE ALL ON FUNCTION scrub_dead_password_reset_job() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION scrub_dead_password_reset_job() TO semforge_dispatcher;--> statement-breakpoint
REVOKE ALL ON FUNCTION scrub_dead_password_reset_outbox() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION scrub_dead_password_reset_outbox() TO semforge_dispatcher;--> statement-breakpoint
CREATE POLICY sites_scheduler_read ON sites FOR SELECT TO semforge_scheduler USING (true);--> statement-breakpoint
CREATE POLICY tracked_queries_scheduler_read ON tracked_queries FOR SELECT TO semforge_scheduler USING (true);--> statement-breakpoint
CREATE POLICY gsc_property_bindings_scheduler_read ON gsc_property_bindings FOR SELECT TO semforge_scheduler USING (true);--> statement-breakpoint
CREATE POLICY subscriptions_scheduler_read ON subscriptions FOR SELECT TO semforge_scheduler USING (true);--> statement-breakpoint
CREATE POLICY outbox_scheduler_select ON outbox FOR SELECT TO semforge_scheduler
  USING (topic IN ('collection.google.weekly', 'collection.naver.weekly', 'collection.gsc.weekly', 'report.snapshot'));--> statement-breakpoint
CREATE POLICY outbox_scheduler_insert ON outbox FOR INSERT TO semforge_scheduler
  WITH CHECK (
    topic IN ('collection.google.weekly', 'collection.naver.weekly', 'collection.gsc.weekly', 'report.snapshot')
    AND CASE
      WHEN jsonb_typeof(payload) = 'object'
        AND payload->>'siteId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      THEN EXISTS (
        SELECT 1 FROM sites
         WHERE sites.id = (payload->>'siteId')::uuid
           AND sites.workspace_id = outbox.workspace_id
           AND sites.active
      )
      ELSE false
    END
    AND (
      topic <> 'report.snapshot'
      OR (
        payload ?& ARRAY['siteId', 'cycleMonday']
        AND payload - 'siteId' - 'cycleMonday' = '{}'::jsonb
        AND payload->>'cycleMonday' ~ '^\d{4}-\d{2}-\d{2}$'
      )
    )
  );--> statement-breakpoint
DO $$
DECLARE billing_table text;
BEGIN
  FOREACH billing_table IN ARRAY ARRAY[
    'billing_customers', 'payment_methods', 'subscriptions', 'payments', 'provider_events', 'billing_ledger_events'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I TO semforge_billing USING (true) WITH CHECK (true)',
      billing_table || '_billing_access', billing_table);
  END LOOP;
END
$$;--> statement-breakpoint
DO $$
DECLARE billing_table text;
BEGIN
  FOREACH billing_table IN ARRAY ARRAY[
    'billing_customers', 'payment_methods', 'subscriptions', 'payments', 'billing_ledger_events'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I TO semforge_billing_tenant USING (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      billing_table || '_billing_tenant_access', billing_table
    );
  END LOOP;
END
$$;--> statement-breakpoint
REVOKE UPDATE, DELETE ON billing_ledger_events FROM semforge_billing, semforge_billing_tenant, semforge_web, semforge_worker;--> statement-breakpoint
