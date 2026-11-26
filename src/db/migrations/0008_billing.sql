CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`provider_subscription_id` text,
	`status` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_until` integer,
	`authorized_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "subscriptions_status_check" CHECK("subscriptions"."status" IN ('pending','authorized','paused','cancelled')),
	CONSTRAINT "subscriptions_plan_check" CHECK("subscriptions"."plan_id" IN ('starter','pro'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_id_unique` ON `subscriptions` (`provider_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_open_workspace_unique` ON `subscriptions` (`workspace_id`) WHERE "subscriptions"."status" IN ('pending','authorized','paused');--> statement-breakpoint
CREATE INDEX `subscriptions_ws_status_idx` ON `subscriptions` (`workspace_id`,`status`);--> statement-breakpoint
ALTER TABLE `users` ADD `trial_started_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `trial_ends_at` integer;--> statement-breakpoint
UPDATE `plans` SET `max_members` = 3, `max_ad_accounts` = 2, `price_monthly_minor` = 3000000, `currency` = 'ARS', `is_active` = 1 WHERE `id` = 'starter';--> statement-breakpoint
UPDATE `plans` SET `max_members` = 10, `max_ad_accounts` = 10, `price_monthly_minor` = 8000000, `currency` = 'ARS', `is_active` = 1 WHERE `id` = 'pro';
