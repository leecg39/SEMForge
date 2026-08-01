PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_serp_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword_metric_id` text NOT NULL,
	`search_engine` text DEFAULT 'google' NOT NULL,
	`domain` text NOT NULL,
	`url` text NOT NULL,
	`position` integer NOT NULL,
	`is_ad` integer DEFAULT false NOT NULL,
	`result_type` text DEFAULT 'organic' NOT NULL,
	`ad_placement` text DEFAULT 'unknown' NOT NULL,
	`title` text,
	`description` text,
	`serp_features` text DEFAULT '[]' NOT NULL,
	`result_metadata` text DEFAULT '{}' NOT NULL,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`keyword_metric_id`) REFERENCES `keyword_metrics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serp_snapshots`("id", "keyword_metric_id", "search_engine", "domain", "url", "position", "is_ad", "result_type", "ad_placement", "title", "description", "serp_features", "result_metadata", "source", "captured_at") SELECT "id", "keyword_metric_id", "search_engine", "domain", "url", "position", "is_ad", "result_type", COALESCE("ad_placement", 'unknown'), "title", "description", "serp_features", "result_metadata", "source", "captured_at" FROM `serp_snapshots`;--> statement-breakpoint
DROP TABLE `serp_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_serp_snapshots` RENAME TO `serp_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `serp_snapshot_position_unique` ON `serp_snapshots` (`keyword_metric_id`,`search_engine`,`captured_at`,`position`,`is_ad`,`result_type`,`ad_placement`);--> statement-breakpoint
CREATE INDEX `serp_snapshot_domain_idx` ON `serp_snapshots` (`domain`,`captured_at`);--> statement-breakpoint
CREATE INDEX `serp_snapshot_paid_domain_idx` ON `serp_snapshots` (`is_ad`,`domain`,`captured_at`);--> statement-breakpoint
CREATE INDEX `serp_snapshot_keyword_idx` ON `serp_snapshots` (`keyword_metric_id`,`captured_at`);
