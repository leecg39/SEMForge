ALTER TABLE `position_tracking_campaigns` ADD `collect_schedule` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `position_tracking_campaigns` ADD `next_run_at` integer;--> statement-breakpoint
CREATE INDEX `position_tracking_due_idx` ON `position_tracking_campaigns` (`collect_schedule`,`next_run_at`);
