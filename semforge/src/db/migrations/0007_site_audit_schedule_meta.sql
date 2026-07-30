ALTER TABLE `site_audit_campaigns` ADD `next_run_at` integer;--> statement-breakpoint
ALTER TABLE `site_audit_campaigns` ADD `crawl_meta` text;--> statement-breakpoint
CREATE INDEX `site_audit_campaigns_due_idx` ON `site_audit_campaigns` (`next_run_at`);
