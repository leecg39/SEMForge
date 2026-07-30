PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_clickstream_events` (
	`id` text PRIMARY KEY NOT NULL,
	`anonymous_user_hash` text NOT NULL,
	`session_hash` text NOT NULL,
	`domain` text NOT NULL,
	`path` text DEFAULT '/' NOT NULL,
	`country_code` text NOT NULL,
	`device` text NOT NULL,
	`channel` text NOT NULL,
	`population_weight` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_clickstream_events`("id", "anonymous_user_hash", "session_hash", "domain", "path", "country_code", "device", "channel", "population_weight", "source", "occurred_at") SELECT "id", "anonymous_user_hash", "session_hash", "domain", "path", "country_code", "device", "channel", "population_weight", "source", "occurred_at" FROM `clickstream_events`;--> statement-breakpoint
DROP TABLE `clickstream_events`;--> statement-breakpoint
ALTER TABLE `__new_clickstream_events` RENAME TO `clickstream_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `clickstream_domain_scope_idx` ON `clickstream_events` (`domain`,`country_code`,`device`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `clickstream_session_idx` ON `clickstream_events` (`session_hash`);--> statement-breakpoint
CREATE TABLE `__new_keyword_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`normalized_keyword` text NOT NULL,
	`country_code` text NOT NULL,
	`device` text NOT NULL,
	`period_start` integer NOT NULL,
	`volume` integer NOT NULL,
	`cpc_cents` integer DEFAULT 0 NOT NULL,
	`currency_code` text DEFAULT 'USD' NOT NULL,
	`intent` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_keyword_metrics`("id", "keyword", "normalized_keyword", "country_code", "device", "period_start", "volume", "cpc_cents", "currency_code", "intent", "source", "updated_at") SELECT "id", "keyword", "normalized_keyword", "country_code", "device", "period_start", "volume", "cpc_cents", "currency_code", "intent", "source", "updated_at" FROM `keyword_metrics`;--> statement-breakpoint
DROP TABLE `keyword_metrics`;--> statement-breakpoint
ALTER TABLE `__new_keyword_metrics` RENAME TO `keyword_metrics`;--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_metrics_scope_unique` ON `keyword_metrics` (`normalized_keyword`,`country_code`,`device`,`period_start`);--> statement-breakpoint
CREATE INDEX `keyword_metrics_scope_idx` ON `keyword_metrics` (`normalized_keyword`,`country_code`,`device`,`period_start`);--> statement-breakpoint
CREATE TABLE `__new_link_graph_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_domain` text NOT NULL,
	`target_domain` text NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`source_network` text NOT NULL,
	`is_follow` integer DEFAULT true NOT NULL,
	`source_authority` integer NOT NULL,
	`source` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_link_graph_edges`("id", "source_domain", "target_domain", "source_url", "target_url", "source_network", "is_follow", "source_authority", "source", "first_seen_at", "last_seen_at") SELECT "id", "source_domain", "target_domain", "source_url", "target_url", "source_network", "is_follow", "source_authority", "source", "first_seen_at", "last_seen_at" FROM `link_graph_edges`;--> statement-breakpoint
DROP TABLE `link_graph_edges`;--> statement-breakpoint
ALTER TABLE `__new_link_graph_edges` RENAME TO `link_graph_edges`;--> statement-breakpoint
CREATE UNIQUE INDEX `link_graph_edge_unique` ON `link_graph_edges` (`source_url`,`target_url`);--> statement-breakpoint
CREATE INDEX `link_graph_target_idx` ON `link_graph_edges` (`target_domain`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `link_graph_source_network_idx` ON `link_graph_edges` (`source_network`,`target_domain`);--> statement-breakpoint
CREATE TABLE `__new_serp_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword_metric_id` text NOT NULL,
	`search_engine` text DEFAULT 'google' NOT NULL,
	`domain` text NOT NULL,
	`url` text NOT NULL,
	`position` integer NOT NULL,
	`is_ad` integer DEFAULT false NOT NULL,
	`title` text,
	`description` text,
	`serp_features` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`keyword_metric_id`) REFERENCES `keyword_metrics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serp_snapshots`("id", "keyword_metric_id", "search_engine", "domain", "url", "position", "is_ad", "title", "description", "serp_features", "source", "captured_at") SELECT "id", "keyword_metric_id", "search_engine", "domain", "url", "position", "is_ad", "title", "description", "serp_features", "source", "captured_at" FROM `serp_snapshots`;--> statement-breakpoint
DROP TABLE `serp_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_serp_snapshots` RENAME TO `serp_snapshots`;--> statement-breakpoint
CREATE UNIQUE INDEX `serp_snapshot_position_unique` ON `serp_snapshots` (`keyword_metric_id`,`search_engine`,`captured_at`,`position`,`is_ad`);--> statement-breakpoint
CREATE INDEX `serp_snapshot_domain_idx` ON `serp_snapshots` (`domain`,`captured_at`);--> statement-breakpoint
CREATE INDEX `serp_snapshot_keyword_idx` ON `serp_snapshots` (`keyword_metric_id`,`captured_at`);