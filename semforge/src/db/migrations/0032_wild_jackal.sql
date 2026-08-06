CREATE TABLE `backlink_import_staging` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_sha256` text NOT NULL,
	`raw_payload` text NOT NULL,
	`headers_payload` text NOT NULL,
	`detected_mapping_payload` text NOT NULL,
	`row_count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backlink_import_staging_workspace_idx` ON `backlink_import_staging` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `backlink_import_staging_expiry_idx` ON `backlink_import_staging` (`expires_at`);--> statement-breakpoint
CREATE TABLE `backlink_imported_links` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`source_domain` text NOT NULL,
	`anchor` text,
	`link_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `backlink_report_caches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_imported_links_row_unique` ON `backlink_imported_links` (`report_id`,`source_url`,`target_url`,`anchor`);--> statement-breakpoint
CREATE INDEX `backlink_imported_links_target_idx` ON `backlink_imported_links` (`report_id`,`target_url`);--> statement-breakpoint
CREATE INDEX `backlink_imported_links_domain_idx` ON `backlink_imported_links` (`report_id`,`source_domain`);--> statement-breakpoint
CREATE TABLE `backlink_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_url` text NOT NULL,
	`scope` text NOT NULL,
	`target_url` text,
	`provider` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`total_inbound_links` integer,
	`linked_pages` integer,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_snapshots_scope_date_unique` ON `backlink_snapshots` (`workspace_id`,`site_url`,`scope`,`target_url`,`provider`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `backlink_snapshots_history_idx` ON `backlink_snapshots` (`workspace_id`,`site_url`,`captured_at`);--> statement-breakpoint
CREATE TABLE `bing_webmaster_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`selected_site_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expiry` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bing_webmaster_connections_workspace_unique` ON `bing_webmaster_connections` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `bing_webmaster_connections_site_idx` ON `bing_webmaster_connections` (`selected_site_url`);--> statement-breakpoint
CREATE TABLE `bing_webmaster_oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`workspace_id` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bing_webmaster_oauth_states_hash_unique` ON `bing_webmaster_oauth_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `bing_webmaster_oauth_states_expiry_idx` ON `bing_webmaster_oauth_states` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_backlink_report_caches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`target` text NOT NULL,
	`effective_target` text,
	`scope` text NOT NULL,
	`provider` text DEFAULT 'bing-webmaster' NOT NULL,
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
INSERT INTO `__new_backlink_report_caches`("id", "workspace_id", "target", "effective_target", "scope", "provider", "status", "overview_payload", "history_payload", "score_profile_payload", "request_ids_payload", "fetched_at", "expires_at", "refresh_lease_until", "last_error_code", "last_error_message", "created_at", "updated_at") SELECT "id", "workspace_id", "target", "effective_target", "scope", "provider", "status", "overview_payload", "history_payload", "score_profile_payload", "request_ids_payload", "fetched_at", "expires_at", "refresh_lease_until", "last_error_code", "last_error_message", "created_at", "updated_at" FROM `backlink_report_caches`;--> statement-breakpoint
DROP TABLE `backlink_report_caches`;--> statement-breakpoint
ALTER TABLE `__new_backlink_report_caches` RENAME TO `backlink_report_caches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_report_cache_scope_unique` ON `backlink_report_caches` (`workspace_id`,`target`,`scope`,`provider`);--> statement-breakpoint
CREATE INDEX `backlink_report_cache_expiry_idx` ON `backlink_report_caches` (`expires_at`);--> statement-breakpoint
CREATE INDEX `backlink_report_cache_workspace_idx` ON `backlink_report_caches` (`workspace_id`,`updated_at`);
