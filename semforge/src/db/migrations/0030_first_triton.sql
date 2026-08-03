CREATE TABLE `backlink_list_caches` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`dataset` text NOT NULL,
	`query_hash` text NOT NULL,
	`query_payload` text NOT NULL,
	`rows_payload` text NOT NULL,
	`total` integer NOT NULL,
	`request_id` text,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `backlink_report_caches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_list_cache_query_unique` ON `backlink_list_caches` (`report_id`,`query_hash`);--> statement-breakpoint
CREATE INDEX `backlink_list_cache_expiry_idx` ON `backlink_list_caches` (`expires_at`);--> statement-breakpoint
CREATE INDEX `backlink_list_cache_report_idx` ON `backlink_list_caches` (`report_id`,`dataset`);--> statement-breakpoint
CREATE TABLE `backlink_report_caches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`target` text NOT NULL,
	`effective_target` text,
	`scope` text NOT NULL,
	`provider` text DEFAULT 'semrush-v4' NOT NULL,
	`status` text DEFAULT 'refreshing' NOT NULL,
	`overview_payload` text,
	`history_payload` text,
	`score_profile_payload` text,
	`request_ids_payload` text DEFAULT '[]' NOT NULL,
	`fetched_at` integer,
	`expires_at` integer,
	`refresh_lease_until` integer,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_report_cache_scope_unique` ON `backlink_report_caches` (`workspace_id`,`target`,`scope`,`provider`);--> statement-breakpoint
CREATE INDEX `backlink_report_cache_expiry_idx` ON `backlink_report_caches` (`expires_at`);--> statement-breakpoint
CREATE INDEX `backlink_report_cache_workspace_idx` ON `backlink_report_caches` (`workspace_id`,`updated_at`);