CREATE TABLE `content_production_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`production_id` text NOT NULL,
	`scene_id` text,
	`run_id` text,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`duration_ms` integer,
	`fps` integer,
	`has_audio` integer,
	`alt_text` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`production_id`) REFERENCES `content_productions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `content_video_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `content_video_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_production_assets_storage_key_unique` ON `content_production_assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `content_production_assets_production_idx` ON `content_production_assets` (`production_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_production_assets_scene_idx` ON `content_production_assets` (`scene_id`,`kind`);--> statement-breakpoint
CREATE TABLE `content_productions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text,
	`article_id` text,
	`article_version` integer,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`stage` text DEFAULT 'validate' NOT NULL,
	`settings_json` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`provenance_json` text,
	`error_json` text,
	`started_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`lease_token` text,
	`lease_expires_at` integer,
	`next_process_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`article_id`) REFERENCES `content_articles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_productions_workspace_idempotency_unique` ON `content_productions` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `content_productions_workspace_kind_status_idx` ON `content_productions` (`workspace_id`,`kind`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `content_productions_folder_idx` ON `content_productions` (`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `content_productions_article_idx` ON `content_productions` (`article_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `content_productions_due_idx` ON `content_productions` (`status`,`next_process_at`,`lease_expires_at`);--> statement-breakpoint
CREATE TABLE `content_video_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`production_id` text NOT NULL,
	`storyboard_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'submit_scenes' NOT NULL,
	`provenance_json` text,
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
	FOREIGN KEY (`production_id`) REFERENCES `content_productions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyboard_id`) REFERENCES `content_video_storyboards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_video_runs_production_idempotency_unique` ON `content_video_runs` (`production_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `content_video_runs_production_idx` ON `content_video_runs` (`production_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_video_runs_status_idx` ON `content_video_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `content_video_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`production_id` text NOT NULL,
	`storyboard_id` text NOT NULL,
	`run_id` text,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`duration` integer NOT NULL,
	`prompt` text NOT NULL,
	`audio_prompt` text NOT NULL,
	`transition` text DEFAULT 'crossfade' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`provider` text,
	`model` text,
	`provider_task_id` text,
	`provider_request_id` text,
	`seed` integer,
	`provenance_json` text,
	`error_json` text,
	`submitted_at` integer,
	`completed_at` integer,
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
	FOREIGN KEY (`production_id`) REFERENCES `content_productions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyboard_id`) REFERENCES `content_video_storyboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `content_video_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_video_scenes_storyboard_ordinal_unique` ON `content_video_scenes` (`storyboard_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `content_video_scenes_production_status_idx` ON `content_video_scenes` (`production_id`,`status`,`ordinal`);--> statement-breakpoint
CREATE INDEX `content_video_scenes_task_idx` ON `content_video_scenes` (`provider_task_id`);--> statement-breakpoint
CREATE TABLE `content_video_storyboards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`production_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total_duration` integer NOT NULL,
	`aspect_ratio` text NOT NULL,
	`style_preset` text NOT NULL,
	`summary` text NOT NULL,
	`visual_bible_json` text NOT NULL,
	`provenance_json` text,
	`approved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`production_id`) REFERENCES `content_productions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_video_storyboards_production_revision_unique` ON `content_video_storyboards` (`production_id`,`revision`);--> statement-breakpoint
CREATE INDEX `content_video_storyboards_production_idx` ON `content_video_storyboards` (`production_id`,`created_at`);