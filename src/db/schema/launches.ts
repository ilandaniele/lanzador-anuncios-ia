import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { metaAssets } from "./meta";
import { creatives } from "./creatives";
import { productCopies, products } from "./products";
import { workspaces } from "./workspaces";

export const launches = sqliteTable(
  "launches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    phase: text("phase"),
    source: text("source").notNull().default("manual"),
    mode: text("mode"),
    adAccountAssetId: text("ad_account_asset_id").references(
      () => metaAssets.id,
      { onDelete: "set null" },
    ),
    adAccountMetaId: text("ad_account_meta_id"),
    currency: text("currency"),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    draft: text("draft").notNull().default("{}"),
    plan: text("plan"),
    planHash: text("plan_hash"),
    dailyBudgetMinor: integer("daily_budget_minor"),
    startAt: integer("start_at"),
    metaCampaignId: text("meta_campaign_id"),
    metaAdsetId: text("meta_adset_id"),
    itemsTotal: integer("items_total").notNull().default(0),
    itemsDone: integer("items_done").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    checks: text("checks"),
    checksOk: integer("checks_ok"),
    attempt: integer("attempt").notNull().default(0),
    workflowInstanceId: text("workflow_instance_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    startedBy: text("started_by").references(() => users.id, {
      onDelete: "set null",
    }),
    activatedBy: text("activated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    activatedAt: integer("activated_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "launches_status_check",
      sql`${t.status} IN ('draft','simulated','queued','running','verifying','paused_verified','verified_with_errors','activating','active','scheduled','failed','discarded')`,
    ),
    check(
      "launches_phase_check",
      sql`${t.phase} IN ('preflight','campaign','adset','items','verify','activate')`,
    ),
    check(
      "launches_source_check",
      sql`${t.source} IN ('manual','chat','pilot','top_ads')`,
    ),
    check("launches_mode_check", sql`${t.mode} IN ('new_cbo','existing_cbo')`),
    check("launches_draft_check", sql`json_valid(${t.draft})`),
    check("launches_plan_check", sql`json_valid(${t.plan})`),
    check("launches_checks_check", sql`json_valid(${t.checks})`),
    check("launches_checks_ok_check", sql`${t.checksOk} IN (0,1)`),
    index("launches_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("launches_ws_status_created_idx").on(
      t.workspaceId,
      t.status,
      t.createdAt,
    ),
    index("launches_ws_campaign_idx").on(t.workspaceId, t.metaCampaignId),
  ],
);

export const launchItems = sqliteTable(
  "launch_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    launchId: text("launch_id")
      .notNull()
      .references(() => launches.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    source: text("source").notNull(),
    creativeId: text("creative_id").references(() => creatives.id, {
      onDelete: "set null",
    }),
    cloneSourceAdId: text("clone_source_ad_id"),
    cloneStoryId: text("clone_story_id"),
    copyId: text("copy_id").references(() => productCopies.id, {
      onDelete: "set null",
    }),
    adName: text("ad_name").notNull(),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    metaVideoId: text("meta_video_id"),
    metaImageHash: text("meta_image_hash"),
    metaCreativeId: text("meta_creative_id"),
    metaAdId: text("meta_ad_id"),
    checks: text("checks"),
    warnings: text("warnings"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "launch_items_source_check",
      sql`${t.source} IN ('upload','drive','clone')`,
    ),
    check(
      "launch_items_status_check",
      sql`${t.status} IN ('pending','processing_media','creating_creative','creating_ad','done','failed')`,
    ),
    check("launch_items_checks_check", sql`json_valid(${t.checks})`),
    check("launch_items_warnings_check", sql`json_valid(${t.warnings})`),
    uniqueIndex("launch_items_launch_position_unique").on(
      t.launchId,
      t.position,
    ),
    index("launch_items_launch_updated_idx").on(t.launchId, t.updatedAt),
    index("launch_items_launch_status_idx").on(t.launchId, t.status),
    index("launch_items_ws_ad_idx").on(t.workspaceId, t.metaAdId),
  ],
);
