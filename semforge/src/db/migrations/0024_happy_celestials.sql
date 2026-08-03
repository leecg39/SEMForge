CREATE TABLE `content_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`article_id` text NOT NULL,
	`visual_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`alt_text` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `content_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visual_id`) REFERENCES `content_visuals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_assets_visual_kind_unique` ON `content_assets` (`visual_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_assets_storage_key_unique` ON `content_assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `content_assets_article_idx` ON `content_assets` (`article_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_brand_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`brand_name` text NOT NULL,
	`primary_color` text DEFAULT '#ff5a1f' NOT NULL,
	`secondary_color` text DEFAULT '#18181b' NOT NULL,
	`logo_storage_key` text,
	`logo_mime_type` text,
	`logo_width` integer,
	`logo_height` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_brand_kits_workspace_unique` ON `content_brand_kits` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `content_visuals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`article_id` text NOT NULL,
	`source_visual_id` text,
	`idempotency_key` text NOT NULL,
	`article_version` integer NOT NULL,
	`style_preset` text NOT NULL,
	`display_title` text NOT NULL,
	`show_title` integer DEFAULT true NOT NULL,
	`show_logo` integer DEFAULT true NOT NULL,
	`visual_direction` text,
	`focal_x` integer DEFAULT 50 NOT NULL,
	`focal_y` integer DEFAULT 50 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'validate' NOT NULL,
	`prompt_version` text DEFAULT 'semforge-visual-v1' NOT NULL,
	`input_json` text NOT NULL,
	`specification_json` text,
	`provenance_json` text,
	`error_json` text,
	`started_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`active_at` integer,
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
	FOREIGN KEY (`article_id`) REFERENCES `content_articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_visuals_article_idempotency_unique` ON `content_visuals` (`article_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_visuals_article_active_unique` ON `content_visuals` (`article_id`) WHERE "content_visuals"."active_at" IS NOT NULL AND "content_visuals"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `content_visuals_article_running_unique` ON `content_visuals` (`article_id`) WHERE "content_visuals"."status" IN ('queued', 'running') AND "content_visuals"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `content_visuals_workspace_status_idx` ON `content_visuals` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `content_visuals_article_idx` ON `content_visuals` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_visuals_stale_lease_idx` ON `content_visuals` (`status`,`lease_expires_at`);