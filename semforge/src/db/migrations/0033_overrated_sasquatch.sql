CREATE TABLE `backlink_audit_domain_rollups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`source_domain` text NOT NULL,
	`total_links` integer NOT NULL,
	`active_links` integer NOT NULL,
	`risky_links` integer NOT NULL,
	`unreviewed_links` integer NOT NULL,
	`top_anchor` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_audit_domain_rollup_unique` ON `backlink_audit_domain_rollups` (`project_id`,`source_domain`);--> statement-breakpoint
CREATE INDEX `backlink_audit_domain_rollup_project_idx` ON `backlink_audit_domain_rollups` (`project_id`,`total_links`);--> statement-breakpoint
CREATE TABLE `backlink_audit_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`last_run_id` text,
	`fingerprint` text NOT NULL,
	`source_url` text NOT NULL,
	`final_source_url` text,
	`target_url` text NOT NULL,
	`source_domain` text NOT NULL,
	`provider_anchor` text,
	`observed_anchor` text,
	`link_count` integer DEFAULT 1 NOT NULL,
	`source_status` integer,
	`target_status` integer,
	`audit_status` text DEFAULT 'unverified' NOT NULL,
	`link_type` text DEFAULT 'unknown' NOT NULL,
	`is_follow` integer,
	`is_nofollow` integer,
	`is_sponsored` integer,
	`is_ugc` integer,
	`risk_level` text DEFAULT 'unscored' NOT NULL,
	`risk_score` integer DEFAULT 0 NOT NULL,
	`confidence` text DEFAULT 'low' NOT NULL,
	`signals_payload` text DEFAULT '[]' NOT NULL,
	`fetch_error` text,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_checked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_run_id`) REFERENCES `backlink_audit_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_audit_link_fingerprint_unique` ON `backlink_audit_links` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `backlink_audit_link_project_risk_idx` ON `backlink_audit_links` (`project_id`,`risk_level`);--> statement-breakpoint
CREATE INDEX `backlink_audit_link_project_review_idx` ON `backlink_audit_links` (`project_id`,`review_status`);--> statement-breakpoint
CREATE INDEX `backlink_audit_link_domain_idx` ON `backlink_audit_links` (`project_id`,`source_domain`);--> statement-breakpoint
CREATE INDEX `backlink_audit_link_target_idx` ON `backlink_audit_links` (`project_id`,`target_url`);--> statement-breakpoint
CREATE TABLE `backlink_audit_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_report_id` text,
	`source_provider` text NOT NULL,
	`name` text NOT NULL,
	`site_url` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`last_collected_at` integer,
	`last_error_message` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_report_id`) REFERENCES `backlink_report_caches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_audit_project_scope_unique` ON `backlink_audit_projects` (`workspace_id`,`site_url`,`source_provider`);--> statement-breakpoint
CREATE INDEX `backlink_audit_project_workspace_idx` ON `backlink_audit_projects` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `backlink_audit_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`link_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`reviewed_by` text,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `backlink_audit_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backlink_audit_review_link_idx` ON `backlink_audit_reviews` (`link_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `backlink_audit_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`requested_links` integer NOT NULL,
	`discovered_links` integer DEFAULT 0 NOT NULL,
	`processed_links` integer DEFAULT 0 NOT NULL,
	`active_links` integer DEFAULT 0 NOT NULL,
	`missing_links` integer DEFAULT 0 NOT NULL,
	`unavailable_links` integer DEFAULT 0 NOT NULL,
	`risky_links` integer DEFAULT 0 NOT NULL,
	`inventory_partial` integer DEFAULT false NOT NULL,
	`warning_message` text,
	`error_message` text,
	`started_at` integer,
	`heartbeat_at` integer,
	`finished_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backlink_audit_run_project_idx` ON `backlink_audit_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `backlink_audit_run_status_idx` ON `backlink_audit_runs` (`status`,`heartbeat_at`);--> statement-breakpoint
CREATE TABLE `backlink_disavow_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`link_id` text,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `backlink_audit_links`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_disavow_entry_unique` ON `backlink_disavow_entries` (`project_id`,`kind`,`value`);--> statement-breakpoint
CREATE INDEX `backlink_disavow_project_idx` ON `backlink_disavow_entries` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backlink_disavow_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`entry_count` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`exported_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backlink_disavow_export_project_idx` ON `backlink_disavow_exports` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backlink_removal_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`link_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`contact` text,
	`note` text,
	`last_contacted_at` integer,
	`follow_up_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `backlink_audit_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `backlink_audit_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backlink_removal_link_unique` ON `backlink_removal_requests` (`project_id`,`link_id`);--> statement-breakpoint
CREATE INDEX `backlink_removal_project_status_idx` ON `backlink_removal_requests` (`project_id`,`status`);