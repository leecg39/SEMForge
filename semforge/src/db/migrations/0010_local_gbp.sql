CREATE TABLE `gbp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text,
	`account_name` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expiry` integer NOT NULL,
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
CREATE UNIQUE INDEX `gbp_connections_workspace_unique` ON `gbp_connections` (`workspace_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `map_rank_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`business_name` text NOT NULL,
	`keyword` text NOT NULL,
	`normalized_keyword` text NOT NULL,
	`location_text` text DEFAULT '' NOT NULL,
	`country_code` text DEFAULT 'KR' NOT NULL,
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
CREATE UNIQUE INDEX `map_rank_keywords_unique` ON `map_rank_keywords` (`workspace_id`,`business_name`,`normalized_keyword`,`country_code`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `map_rank_keywords_workspace_idx` ON `map_rank_keywords` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `map_rank_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword_id` text NOT NULL,
	`local_pack_present` integer DEFAULT false NOT NULL,
	`business_position` integer,
	`businesses` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'talordata' NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `map_rank_keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_rank_snapshots_keyword_idx` ON `map_rank_snapshots` (`keyword_id`,`captured_at`);
