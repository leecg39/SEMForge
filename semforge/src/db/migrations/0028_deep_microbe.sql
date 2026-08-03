CREATE TABLE `social_competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`instagram_username` text,
	`external_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_competitors_project_name_unique` ON `social_competitors` (`project_id`,`name`) WHERE "social_competitors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `social_competitors_project_idx` ON `social_competitors` (`project_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `social_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_account_id` text,
	`account_name` text,
	`access_token` text,
	`refresh_token` text,
	`expires_at` integer,
	`scopes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
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
CREATE UNIQUE INDEX `social_connections_workspace_provider_unique` ON `social_connections` (`workspace_id`,`provider`) WHERE "social_connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `social_connections_workspace_idx` ON `social_connections` (`workspace_id`,`status`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `social_content_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`external_post_id` text NOT NULL,
	`external_url` text,
	`caption` text,
	`media_url` text,
	`published_at` integer NOT NULL,
	`likes` integer,
	`comments` integer,
	`shares` integer,
	`saves` integer,
	`reach` integer,
	`impressions` integer,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `social_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_content_profile_external_unique` ON `social_content_snapshots` (`profile_id`,`external_post_id`);--> statement-breakpoint
CREATE INDEX `social_content_project_published_idx` ON `social_content_snapshots` (`project_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `social_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`post_id` text,
	`storage_key` text NOT NULL,
	`mime_type` text DEFAULT 'image/jpeg' NOT NULL,
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
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_media_storage_key_unique` ON `social_media_assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `social_media_project_idx` ON `social_media_assets` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_media_post_idx` ON `social_media_assets` (`post_id`);--> statement-breakpoint
CREATE TABLE `social_metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`profile_id` text,
	`competitor_id` text,
	`platform` text NOT NULL,
	`captured_date` text NOT NULL,
	`followers` integer,
	`reach` integer,
	`impressions` integer,
	`interactions` integer,
	`posts` integer,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `social_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competitor_id`) REFERENCES `social_competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_metrics_profile_date_unique` ON `social_metric_snapshots` (`profile_id`,`captured_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_metrics_competitor_date_unique` ON `social_metric_snapshots` (`competitor_id`,`platform`,`captured_date`);--> statement-breakpoint
CREATE INDEX `social_metrics_project_date_idx` ON `social_metric_snapshots` (`project_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `social_post_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `social_post_approvals_post_idx` ON `social_post_approvals` (`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `social_post_tags` (
	`post_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `tag_id`),
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `social_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_post_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`external_post_id` text,
	`external_url` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`published_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `social_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_post_targets_post_profile_unique` ON `social_post_targets` (`post_id`,`profile_id`);--> statement-breakpoint
CREATE INDEX `social_post_targets_due_idx` ON `social_post_targets` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`link_url` text,
	`utm` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`publish_mode` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`recurrence` text DEFAULT '{}' NOT NULL,
	`recurrence_parent_id` text,
	`recurrence_end_at` integer,
	`next_occurrence_at` integer,
	`submitted_at` integer,
	`approved_at` integer,
	`approved_by` text,
	`published_at` integer,
	`idempotency_key` text NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_posts_project_idempotency_unique` ON `social_posts` (`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `social_posts_project_status_idx` ON `social_posts` (`project_id`,`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `social_posts_due_idx` ON `social_posts` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `social_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`connection_id` text,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`parent_external_id` text,
	`display_name` text NOT NULL,
	`handle` text,
	`avatar_url` text,
	`access_token` text,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `social_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_profiles_project_platform_external_unique` ON `social_profiles` (`project_id`,`platform`,`external_id`) WHERE "social_profiles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `social_profiles_project_idx` ON `social_profiles` (`project_id`,`enabled`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `social_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Seoul' NOT NULL,
	`approval_required` integer DEFAULT false NOT NULL,
	`sync_enabled` integer DEFAULT true NOT NULL,
	`next_sync_at` integer,
	`last_sync_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_projects_folder_unique` ON `social_projects` (`folder_id`) WHERE "social_projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `social_projects_workspace_idx` ON `social_projects` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `social_projects_sync_idx` ON `social_projects` (`sync_enabled`,`next_sync_at`);--> statement-breakpoint
CREATE TABLE `social_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`succeeded_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_runs_project_kind_active_unique` ON `social_runs` (`project_id`,`kind`) WHERE "social_runs"."status" IN ('queued', 'running') AND "social_runs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `social_runs_project_idx` ON `social_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `social_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#6b6de3' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `social_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_tags_project_name_unique` ON `social_tags` (`project_id`,`normalized_name`) WHERE "social_tags"."deleted_at" IS NULL;