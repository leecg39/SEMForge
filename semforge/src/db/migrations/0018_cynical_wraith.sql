CREATE TABLE `app_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`href` text,
	`dedupe_key` text NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_notifications_dedupe_unique` ON `app_notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `app_notifications_user_idx` ON `app_notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `position_tracking_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`run_id` text NOT NULL,
	`tracked_keyword_id` text NOT NULL,
	`measurement_kind` text NOT NULL,
	`position` integer,
	`url` text,
	`mentioned` integer DEFAULT false NOT NULL,
	`local_pack_position` integer,
	`features` text DEFAULT '[]' NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `position_tracking_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `position_tracking_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_keyword_id`) REFERENCES `tracked_keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `position_tracking_observations_keyword_idx` ON `position_tracking_observations` (`tracked_keyword_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `position_tracking_observations_run_idx` ON `position_tracking_observations` (`run_id`);--> statement-breakpoint
CREATE TABLE `position_tracking_run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tracked_keyword_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `position_tracking_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_keyword_id`) REFERENCES `tracked_keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_tracking_run_items_unique` ON `position_tracking_run_items` (`run_id`,`tracked_keyword_id`);--> statement-breakpoint
CREATE INDEX `position_tracking_run_items_status_idx` ON `position_tracking_run_items` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `position_tracking_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`current_keyword` text,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `position_tracking_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `position_tracking_runs_campaign_idx` ON `position_tracking_runs` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `position_tracking_runs_workspace_status_idx` ON `position_tracking_runs` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `position_tracking_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`weekly_digest_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `position_tracking_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_tracking_subscriptions_unique` ON `position_tracking_subscriptions` (`campaign_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `position_tracking_subscriptions_user_idx` ON `position_tracking_subscriptions` (`user_id`,`weekly_digest_enabled`);--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `target_type` text DEFAULT 'root_domain' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `target_value` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `country_code` text DEFAULT 'KR' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `language_code` text DEFAULT 'ko' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `location_key` text DEFAULT 'KR-SEOUL' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `location_label` text DEFAULT 'Seoul, South Korea' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `business_name` text;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `weekly_digest_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `setup_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `position_tracking_setup_request_unique` ON `position_tracking_campaigns` (`workspace_id`,`setup_request_id`) WHERE setup_request_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_keywords` ADD `last_result_url` text;--> statement-breakpoint
ALTER TABLE `tracked_keywords` ADD `mentioned` integer;--> statement-breakpoint
ALTER TABLE `tracked_keywords` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `tracked_keywords` ADD `last_collected_at` integer;--> statement-breakpoint
UPDATE `position_tracking_campaigns`
SET
	`target_value` = `domain`,
	`location_label` = `location`,
	`country_code` = CASE
		WHEN lower(`location`) LIKE '%korea%' OR lower(`location`) LIKE '%seoul%' OR `location` LIKE '%서울%' THEN 'KR'
		ELSE 'US'
	END,
	`language_code` = CASE
		WHEN lower(`location`) LIKE '%korea%' OR lower(`location`) LIKE '%seoul%' OR `location` LIKE '%서울%' THEN 'ko'
		ELSE 'en'
	END,
	`location_key` = CASE
		WHEN lower(`location`) LIKE '%korea%' OR lower(`location`) LIKE '%seoul%' OR `location` LIKE '%서울%' THEN 'KR-SEOUL'
		ELSE 'US-NEW-YORK'
	END;
