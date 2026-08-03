CREATE TABLE `content_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`title` text NOT NULL,
	`intent` text DEFAULT 'create' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
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
CREATE INDEX `content_boards_workspace_status_idx` ON `content_boards` (`workspace_id`,`status`,`updated_at`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `content_boards_folder_idx` ON `content_boards` (`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `content_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`board_id` text NOT NULL,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`payload_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `content_boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_messages_board_idx` ON `content_messages` (`board_id`,`created_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `content_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`board_id` text NOT NULL,
	`article_id` text,
	`idempotency_key` text NOT NULL,
	`intent` text DEFAULT 'create' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'validate' NOT NULL,
	`input_json` text NOT NULL,
	`provenance_json` text,
	`output_json` text,
	`error_json` text,
	`started_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`lease_token` text,
	`lease_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `content_boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_runs_board_idempotency_unique` ON `content_runs` (`board_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `content_runs_workspace_status_idx` ON `content_runs` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `content_runs_board_idx` ON `content_runs` (`board_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_runs_article_idx` ON `content_runs` (`article_id`);--> statement-breakpoint
CREATE INDEX `content_runs_stale_lease_idx` ON `content_runs` (`status`,`lease_expires_at`);--> statement-breakpoint
DROP INDEX `content_articles_workspace_title_unique`;--> statement-breakpoint
ALTER TABLE `content_articles` ADD `board_id` text;--> statement-breakpoint
ALTER TABLE `content_articles` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `content_articles` ADD `meta_description` text;--> statement-breakpoint
ALTER TABLE `content_articles` ADD `body_format` text DEFAULT 'markdown' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_articles` ADD `published_at` integer;--> statement-breakpoint
CREATE INDEX `content_articles_workspace_title_idx` ON `content_articles` (`workspace_id`,`title`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `content_articles_board_idx` ON `content_articles` (`board_id`,`deleted_at`);