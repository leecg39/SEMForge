CREATE TABLE `ai_visibility_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`position` integer NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`title` text,
	`is_own_domain` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `ai_visibility_observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_citations_unique` ON `ai_visibility_citations` (`observation_id`,`url`);--> statement-breakpoint
CREATE INDEX `ai_visibility_citations_observation_idx` ON `ai_visibility_citations` (`observation_id`);--> statement-breakpoint
CREATE INDEX `ai_visibility_citations_domain_idx` ON `ai_visibility_citations` (`domain`,`is_own_domain`);--> statement-breakpoint
CREATE TABLE `ai_visibility_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text,
	`run_item_id` text,
	`prompt_id` text NOT NULL,
	`provider` text NOT NULL,
	`country_code` text NOT NULL,
	`location_key` text NOT NULL,
	`visibility_status` text NOT NULL,
	`brand_mentioned` integer,
	`citations_available` integer DEFAULT false NOT NULL,
	`response_text` text,
	`source` text NOT NULL,
	`from_cache` integer DEFAULT false NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `ai_visibility_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `ai_visibility_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`run_item_id`) REFERENCES `ai_visibility_run_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_visibility_prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_observations_project_idx` ON `ai_visibility_observations` (`project_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `ai_visibility_observations_cell_idx` ON `ai_visibility_observations` (`prompt_id`,`provider`,`location_key`,`captured_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_observations_run_item_unique` ON `ai_visibility_observations` (`run_item_id`) WHERE run_item_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `ai_visibility_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`domain` text NOT NULL,
	`brand_name` text NOT NULL,
	`brand_aliases` text DEFAULT '[]' NOT NULL,
	`providers` text DEFAULT '["google_aio","chatgpt_web","gemini_grounded"]' NOT NULL,
	`schedule` text DEFAULT 'weekly' NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
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
CREATE UNIQUE INDEX `ai_visibility_projects_folder_unique` ON `ai_visibility_projects` (`folder_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ai_visibility_projects_workspace_idx` ON `ai_visibility_projects` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `ai_visibility_projects_due_idx` ON `ai_visibility_projects` (`schedule`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `ai_visibility_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prompt` text NOT NULL,
	`normalized_prompt` text NOT NULL,
	`topic` text DEFAULT '미분류' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `ai_visibility_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_prompts_unique` ON `ai_visibility_prompts` (`project_id`,`normalized_prompt`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ai_visibility_prompts_project_idx` ON `ai_visibility_prompts` (`project_id`,`enabled`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `ai_visibility_run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`provider` text NOT NULL,
	`country_code` text NOT NULL,
	`location_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `ai_visibility_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_visibility_prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_run_items_unique` ON `ai_visibility_run_items` (`run_id`,`prompt_id`,`provider`,`location_key`);--> statement-breakpoint
CREATE INDEX `ai_visibility_run_items_status_idx` ON `ai_visibility_run_items` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `ai_visibility_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`current_prompt` text,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `ai_visibility_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_runs_project_idx` ON `ai_visibility_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_visibility_runs_workspace_status_idx` ON `ai_visibility_runs` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_visibility_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`country_code` text NOT NULL,
	`location_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `ai_visibility_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_scopes_unique` ON `ai_visibility_scopes` (`project_id`,`location_key`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ai_visibility_scopes_project_idx` ON `ai_visibility_scopes` (`project_id`,`deleted_at`);