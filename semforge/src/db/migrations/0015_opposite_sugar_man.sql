CREATE TABLE `seo_project_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`country_code` text DEFAULT 'US' NOT NULL,
	`device` text DEFAULT 'desktop' NOT NULL,
	`search_engine` text DEFAULT 'google' NOT NULL,
	`result_scope` text DEFAULT 'domain' NOT NULL,
	`hidden_widgets` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seo_project_settings_folder_unique` ON `seo_project_settings` (`folder_id`);--> statement-breakpoint
CREATE INDEX `seo_project_settings_workspace_idx` ON `seo_project_settings` (`workspace_id`);