CREATE TABLE `site_audit_metric_snapshots` (
	`run_id` text PRIMARY KEY NOT NULL,
	`site_health` integer,
	`crawled_pages` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`warning_count` integer DEFAULT 0 NOT NULL,
	`notice_count` integer DEFAULT 0 NOT NULL,
	`theme_scores` text DEFAULT '[]' NOT NULL,
	`psi_metrics` text,
	`provenance` text DEFAULT '{}' NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `site_audit_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_audit_metric_snapshots_captured_idx` ON `site_audit_metric_snapshots` (`captured_at`);--> statement-breakpoint
CREATE TABLE `site_audit_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`provider_message` text,
	`read_at` integer,
	`delivered_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `site_audit_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `site_audit_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_audit_notifications_delivery_unique` ON `site_audit_notifications` (`run_id`,`user_id`,`channel`);--> statement-breakpoint
CREATE INDEX `site_audit_notifications_user_idx` ON `site_audit_notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_audit_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`page_limit` integer NOT NULL,
	`crawled_pages` integer DEFAULT 0 NOT NULL,
	`failed_fetches` integer DEFAULT 0 NOT NULL,
	`crawl_engine` text,
	`source_note` text,
	`error_message` text,
	`started_at` integer,
	`finished_at` integer,
	`heartbeat_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `site_audit_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_audit_runs_active_unique` ON `site_audit_runs` (`campaign_id`) WHERE status IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX `site_audit_runs_campaign_idx` ON `site_audit_runs` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_audit_runs_workspace_status_idx` ON `site_audit_runs` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
DROP INDEX `folders_workspace_domain_unique`;--> statement-breakpoint
CREATE INDEX `folders_workspace_domain_idx` ON `folders` (`workspace_id`,`domain`,`deleted_at`);--> statement-breakpoint
DROP INDEX `site_audit_workspace_name_unique`;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `notify_on_complete` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `email_on_complete` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `crawler_user_agent` text DEFAULT 'semforge' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `allow_paths` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `disallow_paths` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `ignore_query_parameters` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `site_audit_folder_unique` ON `site_audit_campaigns` (`workspace_id`,`folder_id`) WHERE deleted_at IS NULL AND folder_id IS NOT NULL;