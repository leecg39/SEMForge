CREATE TABLE `content_package_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`package_id` text NOT NULL,
	`kind` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`board_id` text,
	`article_id` text,
	`production_id` text,
	`parent_item_id` text,
	`source_version` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_id`) REFERENCES `content_packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `content_boards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`article_id`) REFERENCES `content_articles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`production_id`) REFERENCES `content_productions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_items_revision_unique` ON `content_package_items` (`package_id`,`kind`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_package_items_active_unique` ON `content_package_items` (`package_id`,`kind`) WHERE "content_package_items"."status" = 'active' AND "content_package_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `content_package_items_package_idx` ON `content_package_items` (`package_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_package_items_board_idx` ON `content_package_items` (`board_id`);--> statement-breakpoint
CREATE INDEX `content_package_items_article_idx` ON `content_package_items` (`article_id`);--> statement-breakpoint
CREATE INDEX `content_package_items_production_idx` ON `content_package_items` (`production_id`);--> statement-breakpoint
CREATE TABLE `content_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`idempotency_key` text NOT NULL,
	`title` text NOT NULL,
	`brief` text NOT NULL,
	`start_mode` text NOT NULL,
	`target_stage` text NOT NULL,
	`current_step` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`settings_json` text NOT NULL,
	`error_json` text,
	`completed_at` integer,
	`cancelled_at` integer,
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
CREATE UNIQUE INDEX `content_packages_workspace_idempotency_unique` ON `content_packages` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `content_packages_workspace_status_idx` ON `content_packages` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `content_packages_folder_idx` ON `content_packages` (`folder_id`,`deleted_at`);--> statement-breakpoint
ALTER TABLE `content_productions` ADD `source_production_id` text;--> statement-breakpoint
ALTER TABLE `content_productions` ADD `source_asset_id` text;--> statement-breakpoint
ALTER TABLE `content_productions` ADD `source_asset_sha256` text;--> statement-breakpoint
CREATE INDEX `content_productions_source_idx` ON `content_productions` (`source_production_id`,`source_asset_id`);