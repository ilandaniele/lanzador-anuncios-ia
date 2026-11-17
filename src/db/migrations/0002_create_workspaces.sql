CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by` text,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invitations_role_check" CHECK("invitations"."role" IN ('admin','editor','viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_pending_unique` ON `invitations` (`workspace_id`,`email`) WHERE "invitations"."accepted_at" IS NULL AND "invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `invitations_ws_created_idx` ON `invitations` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invitations_email_idx` ON `invitations` (`email`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "memberships_role_check" CHECK("memberships"."role" IN ('owner','admin','editor','viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_workspace_user_unique` ON `memberships` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_one_owner` ON `memberships` (`workspace_id`) WHERE "memberships"."role" = 'owner';--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`provider` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`launch_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "oauth_states_provider_check" CHECK("oauth_states"."provider" IN ('meta','google'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_states_state_hash_unique` ON `oauth_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `oauth_states_expires_idx` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`max_campaign_budget_minor` integer DEFAULT 30000 NOT NULL,
	`budget_currency` text DEFAULT 'USD' NOT NULL,
	`max_scale_percent` integer DEFAULT 50 NOT NULL,
	`advantage_creative_enabled` integer DEFAULT 0 NOT NULL,
	`timezone` text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	`default_countries` text DEFAULT '["AR"]' NOT NULL,
	`campaign_name_template` text DEFAULT 'CBO {fecha}' NOT NULL,
	`adset_name_template` text DEFAULT 'CONJ {n}' NOT NULL,
	`ad_name_template` text DEFAULT '{hook}-{formato}-{angulo}-{n}' NOT NULL,
	`launch_defaults` text DEFAULT '{"objective":"OUTCOME_SALES","bidStrategy":"LOWEST_COST_WITHOUT_CAP","optimizationGoal":"OFFSITE_CONVERSIONS","billingEvent":"IMPRESSIONS","attributionSpec":[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}],"customEventType":"PURCHASE","defaultBudgetMinor":3000,"targeting":{"age_min":18,"geo_locations":{"countries":["AR"]}}}' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workspace_settings_max_campaign_budget_check" CHECK("workspace_settings"."max_campaign_budget_minor" > 0),
	CONSTRAINT "workspace_settings_max_scale_percent_check" CHECK("workspace_settings"."max_scale_percent" BETWEEN 1 AND 50),
	CONSTRAINT "workspace_settings_advantage_creative_check" CHECK("workspace_settings"."advantage_creative_enabled" IN (0,1)),
	CONSTRAINT "workspace_settings_default_countries_check" CHECK(json_valid("workspace_settings"."default_countries")),
	CONSTRAINT "workspace_settings_launch_defaults_check" CHECK(json_valid("workspace_settings"."launch_defaults"))
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan_id` text DEFAULT 'beta' NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`disabled_reason` text,
	`ai_daily_neurons_override` integer,
	`ai_monthly_neurons_override` integer,
	`last_activity_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "workspaces_status_check" CHECK("workspaces"."status" IN ('active','disabled','deleting'))
);
--> statement-breakpoint
CREATE INDEX `workspaces_status_created_idx` ON `workspaces` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `workspaces_owner_idx` ON `workspaces` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `workspaces_activity_idx` ON `workspaces` (`status`,`last_activity_at`);