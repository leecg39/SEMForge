CREATE TABLE `position_tracking_competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`domain` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `position_tracking_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_tracking_competitors_unique` ON `position_tracking_competitors` (`campaign_id`,`domain`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `position_tracking_competitors_campaign_idx` ON `position_tracking_competitors` (`campaign_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `position_tracking_visibility_history` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`visibility` integer NOT NULL,
	`ranked_count` integer DEFAULT 0 NOT NULL,
	`keyword_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'talordata' NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `position_tracking_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pt_visibility_history_campaign_idx` ON `position_tracking_visibility_history` (`campaign_id`,`captured_at`);