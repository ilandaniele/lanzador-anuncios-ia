CREATE TABLE `beta_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`note` text,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_invites_email_unique` ON `beta_invites` (`email`);--> statement-breakpoint
CREATE INDEX `beta_invites_created_idx` ON `beta_invites` (`created_at`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`invalidated_at` integer,
	`ip_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_token_hash_unique` ON `magic_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `magic_links_email_created_idx` ON `magic_links` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `magic_links_expires_idx` ON `magic_links` (`expires_at`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`max_members` integer DEFAULT 10 NOT NULL,
	`max_ad_accounts` integer DEFAULT 10 NOT NULL,
	`max_creatives_per_launch` integer DEFAULT 30 NOT NULL,
	`ai_daily_neurons` integer DEFAULT 2000 NOT NULL,
	`ai_monthly_neurons` integer DEFAULT 30000 NOT NULL,
	`price_monthly_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "plans_is_active_check" CHECK("plans"."is_active" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`previous_token_hash` text,
	`rotated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_prev_hash_idx` ON `sessions` (`previous_token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`is_superadmin` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer,
	CONSTRAINT "users_is_superadmin_check" CHECK("users"."is_superadmin" IN (0,1)),
	CONSTRAINT "users_status_check" CHECK("users"."status" IN ('active','disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);