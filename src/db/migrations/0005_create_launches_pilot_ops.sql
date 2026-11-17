CREATE TABLE `launch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`launch_id` text NOT NULL,
	`position` integer NOT NULL,
	`source` text NOT NULL,
	`creative_id` text,
	`clone_source_ad_id` text,
	`clone_story_id` text,
	`copy_id` text,
	`ad_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`meta_video_id` text,
	`meta_image_hash` text,
	`meta_creative_id` text,
	`meta_ad_id` text,
	`checks` text,
	`warnings` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creative_id`) REFERENCES `creatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`copy_id`) REFERENCES `product_copies`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "launch_items_source_check" CHECK("launch_items"."source" IN ('upload','drive','clone')),
	CONSTRAINT "launch_items_status_check" CHECK("launch_items"."status" IN ('pending','processing_media','creating_creative','creating_ad','done','failed')),
	CONSTRAINT "launch_items_checks_check" CHECK(json_valid("launch_items"."checks")),
	CONSTRAINT "launch_items_warnings_check" CHECK(json_valid("launch_items"."warnings"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_items_launch_position_unique` ON `launch_items` (`launch_id`,`position`);--> statement-breakpoint
CREATE INDEX `launch_items_launch_updated_idx` ON `launch_items` (`launch_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `launch_items_launch_status_idx` ON `launch_items` (`launch_id`,`status`);--> statement-breakpoint
CREATE INDEX `launch_items_ws_ad_idx` ON `launch_items` (`workspace_id`,`meta_ad_id`);--> statement-breakpoint
CREATE TABLE `launches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`phase` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`mode` text,
	`ad_account_asset_id` text,
	`ad_account_meta_id` text,
	`currency` text,
	`product_id` text,
	`draft` text DEFAULT '{}' NOT NULL,
	`plan` text,
	`plan_hash` text,
	`daily_budget_minor` integer,
	`start_at` integer,
	`meta_campaign_id` text,
	`meta_adset_id` text,
	`items_total` integer DEFAULT 0 NOT NULL,
	`items_done` integer DEFAULT 0 NOT NULL,
	`items_failed` integer DEFAULT 0 NOT NULL,
	`checks` text,
	`checks_ok` integer,
	`attempt` integer DEFAULT 0 NOT NULL,
	`workflow_instance_id` text,
	`error_code` text,
	`error_message` text,
	`created_by` text,
	`started_by` text,
	`activated_by` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`activated_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_account_asset_id`) REFERENCES `meta_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "launches_status_check" CHECK("launches"."status" IN ('draft','simulated','queued','running','verifying','paused_verified','verified_with_errors','activating','active','scheduled','failed','discarded')),
	CONSTRAINT "launches_phase_check" CHECK("launches"."phase" IN ('preflight','campaign','adset','items','verify','activate')),
	CONSTRAINT "launches_source_check" CHECK("launches"."source" IN ('manual','chat','pilot','top_ads')),
	CONSTRAINT "launches_mode_check" CHECK("launches"."mode" IN ('new_cbo','existing_cbo')),
	CONSTRAINT "launches_draft_check" CHECK(json_valid("launches"."draft")),
	CONSTRAINT "launches_plan_check" CHECK(json_valid("launches"."plan")),
	CONSTRAINT "launches_checks_check" CHECK(json_valid("launches"."checks")),
	CONSTRAINT "launches_checks_ok_check" CHECK("launches"."checks_ok" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `launches_ws_created_idx` ON `launches` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `launches_ws_status_created_idx` ON `launches` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `launches_ws_campaign_idx` ON `launches` (`workspace_id`,`meta_campaign_id`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text,
	`feature` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`neurons` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`ref_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ai_usage_feature_check" CHECK("ai_usage"."feature" IN ('copy','tagging','pilot','chat')),
	CONSTRAINT "ai_usage_provider_check" CHECK("ai_usage"."provider" IN ('workers_ai')),
	CONSTRAINT "ai_usage_status_check" CHECK("ai_usage"."status" IN ('ok','error','blocked_budget'))
);
--> statement-breakpoint
CREATE INDEX `ai_usage_ws_created_idx` ON `ai_usage` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`actor_user_id` text,
	`actor_type` text NOT NULL,
	`origin` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text,
	`object_meta_id` text,
	`object_name` text,
	`ad_account_meta_id` text,
	`launch_id` text,
	`result` text NOT NULL,
	`detail` text,
	`request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_log_actor_type_check" CHECK("audit_log"."actor_type" IN ('user','superadmin','system')),
	CONSTRAINT "audit_log_origin_check" CHECK("audit_log"."origin" IN ('manual','pilot','chat','system')),
	CONSTRAINT "audit_log_result_check" CHECK("audit_log"."result" IN ('ok','error')),
	CONSTRAINT "audit_log_detail_check" CHECK(json_valid("audit_log"."detail"))
);
--> statement-breakpoint
CREATE INDEX `audit_ws_created_idx` ON `audit_log` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_ws_origin_created_idx` ON `audit_log` (`workspace_id`,`origin`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`workspace_id`,`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_ws_object_created_idx` ON `audit_log` (`workspace_id`,`object_meta_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_name` text,
	`tool_payload` text,
	`ai_usage_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_usage_id`) REFERENCES `ai_usage`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_messages_role_check" CHECK("chat_messages"."role" IN ('user','assistant','tool')),
	CONSTRAINT "chat_messages_content_check" CHECK(length("chat_messages"."content") <= 8000),
	CONSTRAINT "chat_messages_tool_payload_check" CHECK(json_valid("chat_messages"."tool_payload"))
);
--> statement-breakpoint
CREATE INDEX `chat_messages_session_created_idx` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'open' NOT NULL,
	`launch_id` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_sessions_status_check" CHECK("chat_sessions"."status" IN ('open','draft_created','closed')),
	CONSTRAINT "chat_sessions_message_count_check" CHECK("chat_sessions"."message_count" BETWEEN 0 AND 60)
);
--> statement-breakpoint
CREATE INDEX `chat_sessions_ws_user_updated_idx` ON `chat_sessions` (`workspace_id`,`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `data_deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`confirmation_code` text NOT NULL,
	`meta_user_id` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`connections_affected` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT "data_deletion_requests_status_check" CHECK("data_deletion_requests"."status" IN ('received','done'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_deletion_requests_confirmation_code_unique` ON `data_deletion_requests` (`confirmation_code`);--> statement-breakpoint
CREATE TABLE `error_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`user_id` text,
	`source` text NOT NULL,
	`request_id` text,
	`route` text,
	`status` integer,
	`code` text,
	`message` text NOT NULL,
	`stack_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "error_events_source_check" CHECK("error_events"."source" IN ('api','workflow','cron','client')),
	CONSTRAINT "error_events_message_check" CHECK(length("error_events"."message") <= 500)
);
--> statement-breakpoint
CREATE INDEX `error_events_created_idx` ON `error_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `error_events_source_created_idx` ON `error_events` (`source`,`created_at`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`period` text NOT NULL,
	`metric` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `scope_id`, `period`, `metric`),
	CONSTRAINT "usage_counters_scope_check" CHECK("usage_counters"."scope" IN ('workspace','global')),
	CONSTRAINT "usage_counters_metric_check" CHECK("usage_counters"."metric" IN ('ai_neurons','meta_calls','launches','ads_created'))
);
--> statement-breakpoint
CREATE TABLE `insights_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`ad_account_asset_id` text NOT NULL,
	`level` text NOT NULL,
	`range_key` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`payload` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`refreshing_until` integer,
	`last_error` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_account_asset_id`) REFERENCES `meta_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "insights_cache_level_check" CHECK("insights_cache"."level" IN ('account','campaign','adset','ad','health','issues')),
	CONSTRAINT "insights_cache_payload_check" CHECK(json_valid("insights_cache"."payload") AND json_array_length("insights_cache"."payload") <= 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insights_cache_ws_account_level_range_unique` ON `insights_cache` (`workspace_id`,`ad_account_asset_id`,`level`,`range_key`);--> statement-breakpoint
CREATE INDEX `insights_cache_expires_idx` ON `insights_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `pilot_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`rule_type` text NOT NULL,
	`action` text NOT NULL,
	`ad_account_meta_id` text NOT NULL,
	`object_level` text NOT NULL,
	`object_meta_id` text NOT NULL,
	`object_name` text NOT NULL,
	`evidence` text NOT NULL,
	`current_budget_minor` integer,
	`proposed_budget_minor` integer,
	`percent` integer,
	`explanation` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`dedupe_key` text NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`result_message` text,
	`launch_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `pilot_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pilot_proposals_rule_type_check" CHECK("pilot_proposals"."rule_type" IN ('pause_no_sales','pause_low_roas','scale_winner','duplicate_winner')),
	CONSTRAINT "pilot_proposals_action_check" CHECK("pilot_proposals"."action" IN ('pause','scale','duplicate')),
	CONSTRAINT "pilot_proposals_object_level_check" CHECK("pilot_proposals"."object_level" IN ('campaign','adset','ad')),
	CONSTRAINT "pilot_proposals_evidence_check" CHECK(json_valid("pilot_proposals"."evidence")),
	CONSTRAINT "pilot_proposals_percent_check" CHECK("pilot_proposals"."percent" BETWEEN 1 AND 50),
	CONSTRAINT "pilot_proposals_status_check" CHECK("pilot_proposals"."status" IN ('pending','executing','executed','dismissed','failed','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pilot_proposals_pending_unique` ON `pilot_proposals` (`workspace_id`,`dedupe_key`) WHERE "pilot_proposals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `pilot_proposals_ws_status_created_idx` ON `pilot_proposals` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `pilot_proposals_expires_idx` ON `pilot_proposals` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `pilot_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`rule_type` text NOT NULL,
	`enabled` integer NOT NULL,
	`params` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pilot_rules_rule_type_check" CHECK("pilot_rules"."rule_type" IN ('pause_no_sales','pause_low_roas','scale_winner','duplicate_winner')),
	CONSTRAINT "pilot_rules_enabled_check" CHECK("pilot_rules"."enabled" IN (0,1)),
	CONSTRAINT "pilot_rules_params_check" CHECK(json_valid("pilot_rules"."params"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pilot_rules_ws_type_unique` ON `pilot_rules` (`workspace_id`,`rule_type`);--> statement-breakpoint
CREATE TABLE `pilot_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`trigger` text NOT NULL,
	`triggered_by` text,
	`status` text DEFAULT 'running' NOT NULL,
	`proposals_created` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pilot_runs_trigger_check" CHECK("pilot_runs"."trigger" IN ('cron','manual')),
	CONSTRAINT "pilot_runs_status_check" CHECK("pilot_runs"."status" IN ('running','done','failed'))
);
--> statement-breakpoint
CREATE INDEX `pilot_runs_ws_started_idx` ON `pilot_runs` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `protected_campaigns` (
	`workspace_id` text NOT NULL,
	`campaign_meta_id` text NOT NULL,
	`ad_account_meta_id` text NOT NULL,
	`protected_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `campaign_meta_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`protected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_product_copies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`angle` text NOT NULL,
	`custom_angle` text,
	`primary_text` text NOT NULL,
	`headline` text NOT NULL,
	`description` text,
	`source` text NOT NULL,
	`edited` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`policy_risk` text DEFAULT 'none' NOT NULL,
	`policy_note` text,
	`over_limit` integer DEFAULT 0 NOT NULL,
	`ai_usage_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ai_usage_id`) REFERENCES `ai_usage`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "product_copies_angle_check" CHECK("__new_product_copies"."angle" IN ('dolor','beneficio','prueba_social','oferta','urgencia','libre','manual')),
	CONSTRAINT "product_copies_source_check" CHECK("__new_product_copies"."source" IN ('ai','manual')),
	CONSTRAINT "product_copies_edited_check" CHECK("__new_product_copies"."edited" IN (0,1)),
	CONSTRAINT "product_copies_status_check" CHECK("__new_product_copies"."status" IN ('suggested','saved','discarded')),
	CONSTRAINT "product_copies_favorite_check" CHECK("__new_product_copies"."favorite" IN (0,1)),
	CONSTRAINT "product_copies_policy_risk_check" CHECK("__new_product_copies"."policy_risk" IN ('none','low','high')),
	CONSTRAINT "product_copies_over_limit_check" CHECK("__new_product_copies"."over_limit" IN (0,1))
);
--> statement-breakpoint
INSERT INTO `__new_product_copies`("id", "workspace_id", "product_id", "angle", "custom_angle", "primary_text", "headline", "description", "source", "edited", "status", "favorite", "policy_risk", "policy_note", "over_limit", "ai_usage_id", "created_by", "created_at", "updated_at") SELECT "id", "workspace_id", "product_id", "angle", "custom_angle", "primary_text", "headline", "description", "source", "edited", "status", "favorite", "policy_risk", "policy_note", "over_limit", "ai_usage_id", "created_by", "created_at", "updated_at" FROM `product_copies`;--> statement-breakpoint
DROP TABLE `product_copies`;--> statement-breakpoint
ALTER TABLE `__new_product_copies` RENAME TO `product_copies`;--> statement-breakpoint
CREATE INDEX `product_copies_product_status_idx` ON `product_copies` (`workspace_id`,`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_oauth_states` (
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
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "oauth_states_provider_check" CHECK("__new_oauth_states"."provider" IN ('meta','google'))
);
--> statement-breakpoint
INSERT INTO `__new_oauth_states`("id", "state_hash", "provider", "workspace_id", "user_id", "launch_id", "created_at", "expires_at", "used_at") SELECT "id", "state_hash", "provider", "workspace_id", "user_id", "launch_id", "created_at", "expires_at", "used_at" FROM `oauth_states`;--> statement-breakpoint
DROP TABLE `oauth_states`;--> statement-breakpoint
ALTER TABLE `__new_oauth_states` RENAME TO `oauth_states`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_states_state_hash_unique` ON `oauth_states` (`state_hash`);--> statement-breakpoint
CREATE INDEX `oauth_states_expires_idx` ON `oauth_states` (`expires_at`);