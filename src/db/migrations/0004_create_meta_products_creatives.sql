CREATE TABLE `creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`ad_account_asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`original_filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`meta_video_id` text,
	`meta_image_hash` text,
	`thumbnail_url` text,
	`thumbnail_refreshed_at` integer,
	`format_warning` text,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`ai_status` text DEFAULT 'pending' NOT NULL,
	`tag_hook` text,
	`tag_angle` text,
	`tag_format` text,
	`tag_language` text,
	`tag_on_screen_text` integer,
	`tag_summary` text,
	`tags_edited` integer DEFAULT 0 NOT NULL,
	`ai_model` text,
	`ad_name_suggested` text,
	`ad_name` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_account_asset_id`) REFERENCES `meta_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "creatives_kind_check" CHECK("creatives"."kind" IN ('video','image')),
	CONSTRAINT "creatives_content_type_check" CHECK("creatives"."content_type" IN ('video/mp4','video/quicktime','video/x-m4v','image/jpeg','image/png')),
	CONSTRAINT "creatives_size_bytes_check" CHECK("creatives"."size_bytes" > 0),
	CONSTRAINT "creatives_format_warning_check" CHECK("creatives"."format_warning" IN ('horizontal')),
	CONSTRAINT "creatives_source_check" CHECK("creatives"."source" IN ('browser','drive')),
	CONSTRAINT "creatives_status_check" CHECK("creatives"."status" IN ('uploading','importing','processing','ready','failed','archived')),
	CONSTRAINT "creatives_ai_status_check" CHECK("creatives"."ai_status" IN ('pending','queued','done','failed','skipped')),
	CONSTRAINT "creatives_tag_format_check" CHECK("creatives"."tag_format" IN ('ugc','demo','testimonio','estatico','otro')),
	CONSTRAINT "creatives_tag_on_screen_text_check" CHECK("creatives"."tag_on_screen_text" IN (0,1)),
	CONSTRAINT "creatives_tags_edited_check" CHECK("creatives"."tags_edited" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `creatives_ws_status_created_idx` ON `creatives` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `creatives_ws_sha_idx` ON `creatives` (`workspace_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `creatives_status_thumbnail_idx` ON `creatives` (`status`,`thumbnail_refreshed_at`);--> statement-breakpoint
CREATE INDEX `creatives_ai_status_idx` ON `creatives` (`ai_status`,`created_at`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`creative_id` text,
	`ad_account_asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`meta_upload_session_id` text,
	`start_offset` integer DEFAULT 0 NOT NULL,
	`end_offset` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creative_id`) REFERENCES `creatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ad_account_asset_id`) REFERENCES `meta_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "uploads_kind_check" CHECK("uploads"."kind" IN ('video','image')),
	CONSTRAINT "uploads_size_bytes_check" CHECK("uploads"."size_bytes" > 0),
	CONSTRAINT "uploads_start_offset_check" CHECK("uploads"."start_offset" >= 0),
	CONSTRAINT "uploads_end_offset_check" CHECK("uploads"."end_offset" >= 0),
	CONSTRAINT "uploads_status_check" CHECK("uploads"."status" IN ('uploading','completed','aborted','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_creative_id_unique` ON `uploads` (`creative_id`);--> statement-breakpoint
CREATE INDEX `uploads_status_expires_idx` ON `uploads` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `google_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`google_email` text NOT NULL,
	`refresh_token_ciphertext` blob NOT NULL,
	`refresh_token_iv` blob NOT NULL,
	`token_key_version` integer NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "google_connections_scopes_check" CHECK(json_valid("google_connections"."scopes")),
	CONSTRAINT "google_connections_status_check" CHECK("google_connections"."status" IN ('active','reconnect_required'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_connections_ws_user_unique` ON `google_connections` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `google_connections_key_idx` ON `google_connections` (`token_key_version`);--> statement-breakpoint
CREATE TABLE `meta_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`meta_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_meta_id` text,
	`currency` text,
	`timezone_name` text,
	`account_status` integer,
	`disable_reason` integer,
	`funding_ok` integer,
	`spend_cap_pct` integer,
	`health_checked_at` integer,
	`enabled` integer DEFAULT 0 NOT NULL,
	`missing_since` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `meta_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "meta_assets_kind_check" CHECK("meta_assets"."kind" IN ('ad_account','page','instagram','pixel')),
	CONSTRAINT "meta_assets_funding_ok_check" CHECK("meta_assets"."funding_ok" IN (0,1)),
	CONSTRAINT "meta_assets_enabled_check" CHECK("meta_assets"."enabled" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_assets_ws_kind_meta_unique` ON `meta_assets` (`workspace_id`,`kind`,`meta_id`);--> statement-breakpoint
CREATE INDEX `meta_assets_ws_kind_enabled_idx` ON `meta_assets` (`workspace_id`,`kind`,`enabled`);--> statement-breakpoint
CREATE INDEX `meta_assets_connection_idx` ON `meta_assets` (`connection_id`);--> statement-breakpoint
CREATE TABLE `meta_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`meta_business_id` text NOT NULL,
	`business_name` text,
	`meta_user_id` text NOT NULL,
	`token_type` text DEFAULT 'system_user' NOT NULL,
	`token_ciphertext` blob NOT NULL,
	`token_iv` blob NOT NULL,
	`token_key_version` integer NOT NULL,
	`token_expires_at` integer,
	`scopes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error_code` integer,
	`last_error_at` integer,
	`connected_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "meta_connections_token_type_check" CHECK("meta_connections"."token_type" IN ('system_user','user')),
	CONSTRAINT "meta_connections_scopes_check" CHECK(json_valid("meta_connections"."scopes")),
	CONSTRAINT "meta_connections_status_check" CHECK("meta_connections"."status" IN ('active','reconnect_required'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_connections_ws_business_unique` ON `meta_connections` (`workspace_id`,`meta_business_id`);--> statement-breakpoint
CREATE INDEX `meta_connections_user_idx` ON `meta_connections` (`meta_user_id`);--> statement-breakpoint
CREATE INDEX `meta_connections_key_idx` ON `meta_connections` (`token_key_version`);--> statement-breakpoint
CREATE TABLE `product_copies` (
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
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "product_copies_angle_check" CHECK("product_copies"."angle" IN ('dolor','beneficio','prueba_social','oferta','urgencia','libre','manual')),
	CONSTRAINT "product_copies_source_check" CHECK("product_copies"."source" IN ('ai','manual')),
	CONSTRAINT "product_copies_edited_check" CHECK("product_copies"."edited" IN (0,1)),
	CONSTRAINT "product_copies_status_check" CHECK("product_copies"."status" IN ('suggested','saved','discarded')),
	CONSTRAINT "product_copies_favorite_check" CHECK("product_copies"."favorite" IN (0,1)),
	CONSTRAINT "product_copies_policy_risk_check" CHECK("product_copies"."policy_risk" IN ('none','low','high')),
	CONSTRAINT "product_copies_over_limit_check" CHECK("product_copies"."over_limit" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `product_copies_product_status_idx` ON `product_copies` (`workspace_id`,`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`landing_url` text NOT NULL,
	`primary_text` text NOT NULL,
	`headline` text NOT NULL,
	`description` text,
	`cta` text DEFAULT 'SHOP_NOW' NOT NULL,
	`utm` text,
	`price_minor` integer,
	`cost_minor` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`landing_status` text DEFAULT 'unchecked' NOT NULL,
	`landing_http_status` integer,
	`landing_error` text,
	`landing_checked_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "products_landing_url_check" CHECK("products"."landing_url" LIKE 'https://%'),
	CONSTRAINT "products_cta_check" CHECK("products"."cta" IN ('SHOP_NOW','LEARN_MORE','ORDER_NOW','BUY_NOW','GET_OFFER','SIGN_UP')),
	CONSTRAINT "products_price_minor_check" CHECK("products"."price_minor" > 0),
	CONSTRAINT "products_cost_minor_check" CHECK("products"."cost_minor" >= 0 AND "products"."cost_minor" < "products"."price_minor"),
	CONSTRAINT "products_archived_check" CHECK("products"."archived" IN (0,1)),
	CONSTRAINT "products_landing_status_check" CHECK("products"."landing_status" IN ('unchecked','ok','soft_ok','error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_ws_name_unique` ON `products` (`workspace_id`,`name_normalized`);--> statement-breakpoint
CREATE INDEX `products_ws_archived_updated_idx` ON `products` (`workspace_id`,`archived`,`updated_at`);