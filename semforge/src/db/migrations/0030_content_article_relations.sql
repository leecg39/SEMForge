CREATE TABLE `content_article_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_article_id` text NOT NULL,
	`derived_article_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`source_version` integer NOT NULL,
	`created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_article_id`) REFERENCES `content_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`derived_article_id`) REFERENCES `content_articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_article_relations_derived_unique` ON `content_article_relations` (`derived_article_id`);--> statement-breakpoint
CREATE INDEX `content_article_relations_source_idx` ON `content_article_relations` (`source_article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_article_relations_workspace_idx` ON `content_article_relations` (`workspace_id`,`created_at`);
