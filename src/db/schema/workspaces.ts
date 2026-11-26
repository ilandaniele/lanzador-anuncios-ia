import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { plans, users } from "./auth";
import { launches } from "./launches";

const DEFAULT_LAUNCH_DEFAULTS = JSON.stringify({
  objective: "OUTCOME_SALES",
  bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  optimizationGoal: "OFFSITE_CONVERSIONS",
  billingEvent: "IMPRESSIONS",
  attributionSpec: [
    { event_type: "CLICK_THROUGH", window_days: 7 },
    { event_type: "VIEW_THROUGH", window_days: 1 },
  ],
  customEventType: "PURCHASE",
  defaultBudgetMinor: 3000,
  targeting: { age_min: 18, geo_locations: { countries: ["AR"] } },
});

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    planId: text("plan_id")
      .notNull()
      .default("beta")
      .references(() => plans.id, { onDelete: "restrict" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    disabledReason: text("disabled_reason"),
    aiDailyNeuronsOverride: integer("ai_daily_neurons_override"),
    aiMonthlyNeuronsOverride: integer("ai_monthly_neurons_override"),
    trialEndsAt: integer("trial_ends_at"),
    lastActivityAt: integer("last_activity_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    check(
      "workspaces_status_check",
      sql`${t.status} IN ('active','disabled','deleting')`,
    ),
    index("workspaces_status_created_idx").on(t.status, t.createdAt),
    index("workspaces_owner_idx").on(t.ownerUserId),
    index("workspaces_activity_idx").on(t.status, t.lastActivityAt),
  ],
);

export const workspaceSettings = sqliteTable(
  "workspace_settings",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    maxCampaignBudgetMinor: integer("max_campaign_budget_minor")
      .notNull()
      .default(30000),
    budgetCurrency: text("budget_currency").notNull().default("USD"),
    maxScalePercent: integer("max_scale_percent").notNull().default(50),
    advantageCreativeEnabled: integer("advantage_creative_enabled")
      .notNull()
      .default(0),
    timezone: text("timezone")
      .notNull()
      .default("America/Argentina/Buenos_Aires"),
    defaultCountries: text("default_countries").notNull().default('["AR"]'),
    campaignNameTemplate: text("campaign_name_template")
      .notNull()
      .default("CBO {fecha}"),
    adsetNameTemplate: text("adset_name_template")
      .notNull()
      .default("CONJ {n}"),
    adNameTemplate: text("ad_name_template")
      .notNull()
      .default("{hook}-{formato}-{angulo}-{n}"),
    launchDefaults: text("launch_defaults")
      .notNull()
      .default(DEFAULT_LAUNCH_DEFAULTS),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "workspace_settings_max_campaign_budget_check",
      sql`${t.maxCampaignBudgetMinor} > 0`,
    ),
    check(
      "workspace_settings_max_scale_percent_check",
      sql`${t.maxScalePercent} BETWEEN 1 AND 50`,
    ),
    check(
      "workspace_settings_advantage_creative_check",
      sql`${t.advantageCreativeEnabled} IN (0,1)`,
    ),
    check(
      "workspace_settings_default_countries_check",
      sql`json_valid(${t.defaultCountries})`,
    ),
    check(
      "workspace_settings_launch_defaults_check",
      sql`json_valid(${t.launchDefaults})`,
    ),
  ],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "memberships_role_check",
      sql`${t.role} IN ('owner','admin','editor','viewer')`,
    ),
    uniqueIndex("memberships_workspace_user_unique").on(
      t.workspaceId,
      t.userId,
    ),
    index("memberships_user_idx").on(t.userId),
    uniqueIndex("memberships_one_owner")
      .on(t.workspaceId)
      .where(sql`${t.role} = 'owner'`),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    acceptedBy: text("accepted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: integer("revoked_at"),
  },
  (t) => [
    check(
      "invitations_role_check",
      sql`${t.role} IN ('admin','editor','viewer')`,
    ),
    uniqueIndex("invitations_pending_unique")
      .on(t.workspaceId, t.email)
      .where(sql`${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
    index("invitations_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("invitations_email_idx").on(t.email),
  ],
);

export const oauthStates = sqliteTable(
  "oauth_states",
  {
    id: text("id").primaryKey(),
    stateHash: text("state_hash").notNull().unique(),
    provider: text("provider").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    launchId: text("launch_id").references(() => launches.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (t) => [
    check(
      "oauth_states_provider_check",
      sql`${t.provider} IN ('meta','google')`,
    ),
    index("oauth_states_expires_idx").on(t.expiresAt),
  ],
);
