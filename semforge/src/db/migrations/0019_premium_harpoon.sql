CREATE TABLE `advertising_ad_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`final_url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `advertising_ad_groups_campaign_idx` ON `advertising_ad_groups` (`campaign_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `advertising_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`request_id` text,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`platform` text DEFAULT 'google' NOT NULL,
	`goal` text DEFAULT 'sales' NOT NULL,
	`country_code` text DEFAULT 'KR' NOT NULL,
	`language_code` text DEFAULT 'ko' NOT NULL,
	`daily_budget_cents` integer DEFAULT 0 NOT NULL,
	`currency_code` text DEFAULT 'KRW' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`exported_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `advertising_campaigns_workspace_idx` ON `advertising_campaigns` (`workspace_id`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `advertising_campaigns_folder_idx` ON `advertising_campaigns` (`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `advertising_campaigns_request_unique` ON `advertising_campaigns` (`workspace_id`,`request_id`) WHERE request_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `advertising_creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_group_id` text,
	`format` text DEFAULT 'google_rsa' NOT NULL,
	`headlines` text DEFAULT '[]' NOT NULL,
	`descriptions` text DEFAULT '[]' NOT NULL,
	`primary_text` text,
	`path1` text,
	`path2` text,
	`call_to_action` text,
	`final_url` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`provenance` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_group_id`) REFERENCES `advertising_ad_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `advertising_creatives_campaign_idx` ON `advertising_creatives` (`campaign_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `advertising_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_group_id` text,
	`keyword` text NOT NULL,
	`match_type` text DEFAULT 'phrase' NOT NULL,
	`negative` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`volume` integer,
	`cpc_cents` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_group_id`) REFERENCES `advertising_ad_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `advertising_keywords_campaign_idx` ON `advertising_keywords` (`campaign_id`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `advertising_keywords_active_unique` ON `advertising_keywords` (`campaign_id`,`keyword`,`match_type`,`negative`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `advertising_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rationale` text NOT NULL,
	`before_value` text,
	`after_value` text NOT NULL,
	`source` text DEFAULT 'openai' NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `advertising_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `advertising_recommendations_campaign_idx` ON `advertising_recommendations` (`campaign_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `advertising_research_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`keyword_metric_id` text,
	`keyword` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`ad_count` integer DEFAULT 0 NOT NULL,
	`shopping_count` integer DEFAULT 0 NOT NULL,
	`from_cache` integer DEFAULT false NOT NULL,
	`error_message` text,
	`captured_at` integer,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `advertising_research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `advertising_research_items_unique` ON `advertising_research_items` (`run_id`,`keyword`);--> statement-breakpoint
CREATE INDEX `advertising_research_items_status_idx` ON `advertising_research_items` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `advertising_research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`domain` text NOT NULL,
	`country_code` text DEFAULT 'KR' NOT NULL,
	`device` text DEFAULT 'desktop' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`current_keyword` text,
	`error_message` text,
	`source` text DEFAULT 'talordata' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `advertising_research_workspace_idx` ON `advertising_research_runs` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `advertising_research_domain_idx` ON `advertising_research_runs` (`workspace_id`,`domain`,`created_at`);--> statement-breakpoint
DROP INDEX `serp_snapshot_position_unique`;--> statement-breakpoint
ALTER TABLE `serp_snapshots` ADD `result_type` text DEFAULT 'organic' NOT NULL;--> statement-breakpoint
ALTER TABLE `serp_snapshots` ADD `ad_placement` text;--> statement-breakpoint
ALTER TABLE `serp_snapshots` ADD `result_metadata` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX `serp_snapshot_paid_domain_idx` ON `serp_snapshots` (`is_ad`,`domain`,`captured_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `serp_snapshot_position_unique` ON `serp_snapshots` (`keyword_metric_id`,`search_engine`,`captured_at`,`position`,`is_ad`,`result_type`);