CREATE TABLE `ai_visibility_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`domain` text NOT NULL,
	`query` text NOT NULL,
	`normalized_query` text NOT NULL,
	`country_code` text DEFAULT 'KR' NOT NULL,
	`device` text DEFAULT 'desktop' NOT NULL,
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
CREATE UNIQUE INDEX `ai_visibility_queries_unique` ON `ai_visibility_queries` (`workspace_id`,`domain`,`normalized_query`,`country_code`,`device`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ai_visibility_queries_domain_idx` ON `ai_visibility_queries` (`workspace_id`,`domain`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `ai_visibility_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`query_id` text NOT NULL,
	`aio_present` integer DEFAULT false NOT NULL,
	`cited` integer,
	`cited_url` text,
	`cited_domains` text DEFAULT '[]' NOT NULL,
	`organic_position` integer,
	`features` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'talordata' NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`query_id`) REFERENCES `ai_visibility_queries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_snapshots_query_idx` ON `ai_visibility_snapshots` (`query_id`,`captured_at`);
