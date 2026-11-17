import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { launches } from "./launches";
import { metaAssets } from "./meta";
import { workspaces } from "./workspaces";

const RULE_TYPES_SQL = sql.raw(
  "'pause_no_sales','pause_low_roas','scale_winner','duplicate_winner'",
);

export const insightsCache = sqliteTable(
  "insights_cache",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adAccountAssetId: text("ad_account_asset_id")
      .notNull()
      .references(() => metaAssets.id, { onDelete: "cascade" }),
    level: text("level").notNull(),
    rangeKey: text("range_key").notNull(),
    dateFrom: text("date_from").notNull(),
    dateTo: text("date_to").notNull(),
    payload: text("payload").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    fetchedAt: integer("fetched_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    refreshingUntil: integer("refreshing_until"),
    lastError: text("last_error"),
  },
  (t) => [
    check(
      "insights_cache_level_check",
      sql`${t.level} IN ('account','campaign','adset','ad','health','issues')`,
    ),
    check(
      "insights_cache_payload_check",
      sql`json_valid(${t.payload}) AND json_array_length(${t.payload}) <= 1000`,
    ),
    uniqueIndex("insights_cache_ws_account_level_range_unique").on(
      t.workspaceId,
      t.adAccountAssetId,
      t.level,
      t.rangeKey,
    ),
    index("insights_cache_expires_idx").on(t.expiresAt),
  ],
);

export const pilotRules = sqliteTable(
  "pilot_rules",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    enabled: integer("enabled").notNull(),
    params: text("params").notNull(),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "pilot_rules_rule_type_check",
      sql`${t.ruleType} IN (${RULE_TYPES_SQL})`,
    ),
    check("pilot_rules_enabled_check", sql`${t.enabled} IN (0,1)`),
    check("pilot_rules_params_check", sql`json_valid(${t.params})`),
    uniqueIndex("pilot_rules_ws_type_unique").on(t.workspaceId, t.ruleType),
  ],
);

export const pilotRuns = sqliteTable(
  "pilot_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    triggeredBy: text("triggered_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("running"),
    proposalsCreated: integer("proposals_created").notNull().default(0),
    error: text("error"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    check("pilot_runs_trigger_check", sql`${t.trigger} IN ('cron','manual')`),
    check(
      "pilot_runs_status_check",
      sql`${t.status} IN ('running','done','failed')`,
    ),
    index("pilot_runs_ws_started_idx").on(t.workspaceId, t.startedAt),
  ],
);

export const pilotProposals = sqliteTable(
  "pilot_proposals",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => pilotRuns.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    action: text("action").notNull(),
    adAccountMetaId: text("ad_account_meta_id").notNull(),
    objectLevel: text("object_level").notNull(),
    objectMetaId: text("object_meta_id").notNull(),
    objectName: text("object_name").notNull(),
    evidence: text("evidence").notNull(),
    currentBudgetMinor: integer("current_budget_minor"),
    proposedBudgetMinor: integer("proposed_budget_minor"),
    percent: integer("percent"),
    explanation: text("explanation"),
    status: text("status").notNull().default("pending"),
    dedupeKey: text("dedupe_key").notNull(),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: integer("decided_at"),
    resultMessage: text("result_message"),
    launchId: text("launch_id").references(() => launches.id, {
      onDelete: "set null",
    }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "pilot_proposals_rule_type_check",
      sql`${t.ruleType} IN (${RULE_TYPES_SQL})`,
    ),
    check(
      "pilot_proposals_action_check",
      sql`${t.action} IN ('pause','scale','duplicate')`,
    ),
    check(
      "pilot_proposals_object_level_check",
      sql`${t.objectLevel} IN ('campaign','adset','ad')`,
    ),
    check("pilot_proposals_evidence_check", sql`json_valid(${t.evidence})`),
    check("pilot_proposals_percent_check", sql`${t.percent} BETWEEN 1 AND 50`),
    check(
      "pilot_proposals_status_check",
      sql`${t.status} IN ('pending','executing','executed','dismissed','failed','expired')`,
    ),
    uniqueIndex("pilot_proposals_pending_unique")
      .on(t.workspaceId, t.dedupeKey)
      .where(sql`${t.status} = 'pending'`),
    index("pilot_proposals_ws_status_created_idx").on(
      t.workspaceId,
      t.status,
      t.createdAt,
    ),
    index("pilot_proposals_expires_idx").on(t.status, t.expiresAt),
  ],
);

export const protectedCampaigns = sqliteTable(
  "protected_campaigns",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignMetaId: text("campaign_meta_id").notNull(),
    adAccountMetaId: text("ad_account_meta_id").notNull(),
    protectedBy: text("protected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.campaignMetaId] })],
);
