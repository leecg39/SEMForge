CREATE TABLE `onpage_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`domain` text NOT NULL,
	`url` text NOT NULL,
	`keyword` text NOT NULL,
	`country_code` text DEFAULT 'KR' NOT NULL,
	`device` text DEFAULT 'desktop' NOT NULL,
	`ideas` text DEFAULT '[]' NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`warning_count` integer DEFAULT 0 NOT NULL,
	`idea_count` integer DEFAULT 0 NOT NULL,
	`serp_position` integer,
	`source` text DEFAULT 'onpage-analyzer' NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onpage_analyses_scope_unique` ON `onpage_analyses` (`workspace_id`,`domain`,`url`,`keyword`,`country_code`,`device`);--> statement-breakpoint
CREATE INDEX `onpage_analyses_domain_idx` ON `onpage_analyses` (`workspace_id`,`domain`,`captured_at`);