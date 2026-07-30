CREATE TABLE `gsc_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text,
	`site_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expiry` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gsc_connections_site_url_idx` ON `gsc_connections` (`site_url`);
