CREATE TABLE `domain_analysis_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`country_code` text NOT NULL,
	`device` text NOT NULL,
	`external_json` text NOT NULL,
	`captured_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_analysis_snapshot_scope_unique` ON `domain_analysis_snapshots` (`domain`,`country_code`,`device`);--> statement-breakpoint
CREATE INDEX `domain_analysis_snapshot_captured_idx` ON `domain_analysis_snapshots` (`captured_at`);