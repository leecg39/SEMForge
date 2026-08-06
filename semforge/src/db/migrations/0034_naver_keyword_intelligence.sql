-- @TASK NAVER-KI-DB-01 - 네이버 키워드 인텔리전스 원천·사용량 스키마
-- @SPEC docs/DB_SCHEMA.md#네이버-키워드-인텔리전스-schemanaver-keywordsts
CREATE TABLE `naver_keyword_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`normalized_keyword` text NOT NULL,
	`kind` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "naver_keyword_insights_schema_version_check" CHECK("naver_keyword_insights"."schema_version" > 0),
	CONSTRAINT "naver_keyword_insights_payload_json_check" CHECK(json_valid("naver_keyword_insights"."payload")),
	CONSTRAINT "naver_keyword_insights_expiry_check" CHECK("naver_keyword_insights"."expires_at" > "naver_keyword_insights"."captured_at")
);
--> statement-breakpoint
CREATE INDEX `naver_keyword_insights_latest_idx` ON `naver_keyword_insights` (`normalized_keyword`,`kind`,`source`,`captured_at`);--> statement-breakpoint
CREATE INDEX `naver_keyword_insights_expiry_idx` ON `naver_keyword_insights` (`expires_at`);--> statement-breakpoint
CREATE TABLE `naver_keyword_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_keyword` text NOT NULL,
	`keyword` text NOT NULL,
	`normalized_keyword` text NOT NULL,
	`pc_search_count_min` integer NOT NULL,
	`pc_search_count_max_exclusive` integer,
	`pc_search_count_qualifier` text NOT NULL,
	`pc_search_count_display` text NOT NULL,
	`mobile_search_count_min` integer NOT NULL,
	`mobile_search_count_max_exclusive` integer,
	`mobile_search_count_qualifier` text NOT NULL,
	`mobile_search_count_display` text NOT NULL,
	`avg_pc_clicks` real,
	`avg_mobile_clicks` real,
	`avg_pc_ctr` real,
	`avg_mobile_ctr` real,
	`ad_depth` real,
	`competition` text,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "naver_keyword_snapshots_pc_range_check" CHECK("naver_keyword_snapshots"."pc_search_count_min" >= 0 AND ("naver_keyword_snapshots"."pc_search_count_max_exclusive" IS NULL OR "naver_keyword_snapshots"."pc_search_count_max_exclusive" > "naver_keyword_snapshots"."pc_search_count_min")),
	CONSTRAINT "naver_keyword_snapshots_mobile_range_check" CHECK("naver_keyword_snapshots"."mobile_search_count_min" >= 0 AND ("naver_keyword_snapshots"."mobile_search_count_max_exclusive" IS NULL OR "naver_keyword_snapshots"."mobile_search_count_max_exclusive" > "naver_keyword_snapshots"."mobile_search_count_min")),
	CONSTRAINT "naver_keyword_snapshots_pc_qualifier_check" CHECK(("naver_keyword_snapshots"."pc_search_count_qualifier" = 'exact' AND "naver_keyword_snapshots"."pc_search_count_max_exclusive" IS NULL) OR ("naver_keyword_snapshots"."pc_search_count_qualifier" = 'lt' AND "naver_keyword_snapshots"."pc_search_count_max_exclusive" IS NOT NULL)),
	CONSTRAINT "naver_keyword_snapshots_mobile_qualifier_check" CHECK(("naver_keyword_snapshots"."mobile_search_count_qualifier" = 'exact' AND "naver_keyword_snapshots"."mobile_search_count_max_exclusive" IS NULL) OR ("naver_keyword_snapshots"."mobile_search_count_qualifier" = 'lt' AND "naver_keyword_snapshots"."mobile_search_count_max_exclusive" IS NOT NULL)),
	CONSTRAINT "naver_keyword_snapshots_expiry_check" CHECK("naver_keyword_snapshots"."expires_at" > "naver_keyword_snapshots"."captured_at")
);
--> statement-breakpoint
CREATE INDEX `naver_keyword_snapshots_latest_idx` ON `naver_keyword_snapshots` (`normalized_keyword`,`source`,`captured_at`);--> statement-breakpoint
CREATE INDEX `naver_keyword_snapshots_request_idx` ON `naver_keyword_snapshots` (`requested_keyword`,`captured_at`);--> statement-breakpoint
CREATE INDEX `naver_keyword_snapshots_expiry_idx` ON `naver_keyword_snapshots` (`expires_at`);--> statement-breakpoint
CREATE TABLE `provider_call_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`budget_date` text NOT NULL,
	`call_count` integer DEFAULT 0 NOT NULL,
	`call_limit` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "provider_call_budgets_nonnegative_check" CHECK("provider_call_budgets"."call_count" >= 0 AND "provider_call_budgets"."call_limit" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_call_budgets_provider_date_unique` ON `provider_call_budgets` (`provider`,`budget_date`);--> statement-breakpoint
CREATE INDEX `provider_call_budgets_date_idx` ON `provider_call_budgets` (`budget_date`);--> statement-breakpoint
CREATE TABLE `public_keyword_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_type` text NOT NULL,
	`identity_hash` text NOT NULL,
	`keyword_hash` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "public_keyword_usage_expiry_check" CHECK("public_keyword_usage"."expires_at" > "public_keyword_usage"."first_seen_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_keyword_usage_identity_keyword_unique` ON `public_keyword_usage` (`identity_type`,`identity_hash`,`keyword_hash`);--> statement-breakpoint
CREATE INDEX `public_keyword_usage_active_identity_idx` ON `public_keyword_usage` (`identity_type`,`identity_hash`,`expires_at`);--> statement-breakpoint
CREATE INDEX `public_keyword_usage_expiry_idx` ON `public_keyword_usage` (`expires_at`);--> statement-breakpoint
ALTER TABLE `keyword_list_items` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `keyword_list_items` ADD `source_snapshot_id` text;--> statement-breakpoint
ALTER TABLE `keyword_list_items` ADD `measurement` text;
