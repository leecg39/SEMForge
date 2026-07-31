CREATE TABLE `ai_visibility_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_id` text NOT NULL,
	`platform` text NOT NULL,
	`model` text,
	`answer_text` text,
	`brand_mentioned` integer,
	`brand_rank` integer,
	`cited_urls` text DEFAULT '[]' NOT NULL,
	`cited_domains` text DEFAULT '[]' NOT NULL,
	`mentioned_brands` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`billed` integer DEFAULT false NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_visibility_prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_answers_prompt_idx` ON `ai_visibility_answers` (`prompt_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `ai_visibility_answers_platform_idx` ON `ai_visibility_answers` (`platform`,`captured_at`);--> statement-breakpoint
CREATE TABLE `ai_visibility_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`domain` text NOT NULL,
	`prompt` text NOT NULL,
	`normalized_prompt` text NOT NULL,
	`topic` text,
	`intent` text,
	`country_code` text DEFAULT 'KR' NOT NULL,
	`locale` text DEFAULT 'ko' NOT NULL,
	`tracked` integer DEFAULT false NOT NULL,
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
CREATE UNIQUE INDEX `ai_visibility_prompts_unique` ON `ai_visibility_prompts` (`workspace_id`,`domain`,`normalized_prompt`,`country_code`,`locale`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ai_visibility_prompts_domain_idx` ON `ai_visibility_prompts` (`workspace_id`,`domain`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `ai_visibility_prompts_tracked_idx` ON `ai_visibility_prompts` (`tracked`,`deleted_at`);