CREATE TABLE `keyword_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`normalized_keyword` text NOT NULL,
	`country_code` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `keyword_insights_scope_idx` ON `keyword_insights` (`normalized_keyword`,`country_code`,`kind`,`captured_at`);