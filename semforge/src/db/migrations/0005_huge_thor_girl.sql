CREATE TABLE `site_audit_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`url` text NOT NULL,
	`status_code` integer DEFAULT 0 NOT NULL,
	`title` text,
	`has_title` integer DEFAULT false NOT NULL,
	`title_dup` integer DEFAULT false NOT NULL,
	`meta_description_present` integer DEFAULT false NOT NULL,
	`meta_dup_key` text,
	`images_total` integer DEFAULT 0 NOT NULL,
	`images_missing_alt` integer DEFAULT 0 NOT NULL,
	`internal_links` integer DEFAULT 0 NOT NULL,
	`is_https` integer DEFAULT false NOT NULL,
	`has_json_ld` integer DEFAULT false NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`response_ms` integer DEFAULT 0 NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `site_audit_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_audit_pages_campaign_idx` ON `site_audit_pages` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_audit_pages_status_idx` ON `site_audit_pages` (`campaign_id`,`status_code`);