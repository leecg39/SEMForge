CREATE TABLE `position_tracking_keyword_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `position_tracking_tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `tracked_keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_tracking_keyword_tags_unique` ON `position_tracking_keyword_tags` (`tag_id`,`keyword_id`);--> statement-breakpoint
CREATE INDEX `position_tracking_keyword_tags_keyword_idx` ON `position_tracking_keyword_tags` (`keyword_id`);--> statement-breakpoint
CREATE TABLE `position_tracking_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`color` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `position_tracking_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_tracking_tags_unique` ON `position_tracking_tags` (`campaign_id`,`normalized_name`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `position_tracking_tags_campaign_idx` ON `position_tracking_tags` (`workspace_id`,`campaign_id`,`deleted_at`);