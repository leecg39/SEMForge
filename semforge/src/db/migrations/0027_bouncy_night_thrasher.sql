CREATE TABLE `ai_visibility_brand_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`provider` text NOT NULL,
	`country_code` text NOT NULL,
	`location_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`report_json` text,
	`observation_count` integer DEFAULT 0 NOT NULL,
	`analyzed_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`analyzer_provider` text,
	`analyzer_model` text,
	`analyzer_reasoning` text,
	`generated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `ai_visibility_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `ai_visibility_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_brand_reports_cell_unique` ON `ai_visibility_brand_reports` (`run_id`,`provider`,`location_key`);--> statement-breakpoint
CREATE INDEX `ai_visibility_brand_reports_project_idx` ON `ai_visibility_brand_reports` (`project_id`,`generated_at`);--> statement-breakpoint
CREATE INDEX `ai_visibility_brand_reports_status_idx` ON `ai_visibility_brand_reports` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_visibility_tracked_brands` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`domain` text,
	`kind` text NOT NULL,
	`source` text NOT NULL,
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
CREATE UNIQUE INDEX `ai_visibility_tracked_brands_unique` ON `ai_visibility_tracked_brands` (`project_id`,`normalized_name`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_tracked_brands_own_unique` ON `ai_visibility_tracked_brands` (`project_id`,`kind`) WHERE kind = 'own' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ai_visibility_tracked_brands_project_idx` ON `ai_visibility_tracked_brands` (`project_id`,`enabled`,`deleted_at`);