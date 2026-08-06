CREATE TABLE `marketing_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`airbyte_workspace_id` text,
	`airbyte_source_id` text,
	`airbyte_destination_id` text,
	`airbyte_connection_id` text,
	`raw_namespace` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_attempted_at` integer,
	`last_succeeded_at` integer,
	`next_sync_at` integer,
	`error_code` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`disconnected_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketing_connections_workspace_status_idx` ON `marketing_connections` (`workspace_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_connections_airbyte_connection_unique` ON `marketing_connections` (`airbyte_connection_id`);--> statement-breakpoint
CREATE TABLE `marketing_entity_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`provider` text NOT NULL,
	`local_entity_type` text NOT NULL,
	`local_entity_id` text NOT NULL,
	`external_entity_type` text NOT NULL,
	`external_entity_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_entity_bindings_active_unique` ON `marketing_entity_bindings` (`workspace_id`,`provider`,`local_entity_type`,`local_entity_id`,`external_entity_type`,`external_entity_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `marketing_entity_bindings_folder_idx` ON `marketing_entity_bindings` (`workspace_id`,`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `marketing_oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`provider` text NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_oauth_states_hash_unique` ON `marketing_oauth_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `marketing_oauth_states_expiry_idx` ON `marketing_oauth_states` (`expires_at`,`used_at`);--> statement-breakpoint
CREATE TABLE `marketing_property_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`property_type` text NOT NULL,
	`external_property_id` text NOT NULL,
	`display_name` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `marketing_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_property_bindings_active_unique` ON `marketing_property_bindings` (`workspace_id`,`folder_id`,`property_type`,`external_property_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `marketing_property_bindings_folder_idx` ON `marketing_property_bindings` (`workspace_id`,`folder_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `marketing_report_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`report_type` text NOT NULL,
	`range_from` text NOT NULL,
	`range_to` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`provenance` text NOT NULL,
	`asset_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketing_report_snapshots_folder_idx` ON `marketing_report_snapshots` (`workspace_id`,`folder_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketing_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`airbyte_job_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`row_count` integer,
	`error_code` text,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `marketing_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_sync_runs_job_unique` ON `marketing_sync_runs` (`airbyte_job_id`);--> statement-breakpoint
CREATE INDEX `marketing_sync_runs_connection_idx` ON `marketing_sync_runs` (`connection_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `marketing_sync_runs_retention_idx` ON `marketing_sync_runs` (`completed_at`);