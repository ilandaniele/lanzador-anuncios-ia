import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    maxMembers: integer("max_members").notNull().default(10),
    maxAdAccounts: integer("max_ad_accounts").notNull().default(10),
    maxCreativesPerLaunch: integer("max_creatives_per_launch")
      .notNull()
      .default(30),
    aiDailyNeurons: integer("ai_daily_neurons").notNull().default(2000),
    aiMonthlyNeurons: integer("ai_monthly_neurons").notNull().default(30000),
    priceMonthlyMinor: integer("price_monthly_minor").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("plans_is_active_check", sql`${t.isActive} IN (0,1)`)],
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name"),
    isSuperadmin: integer("is_superadmin").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    lastLoginAt: integer("last_login_at"),
    metaTesterFacebookId: text("meta_tester_facebook_id"),
  },
  (t) => [
    check("users_is_superadmin_check", sql`${t.isSuperadmin} IN (0,1)`),
    check("users_status_check", sql`${t.status} IN ('active','disabled')`),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    previousTokenHash: text("previous_token_hash"),
    rotatedAt: integer("rotated_at").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
  },
  (t) => [
    index("sessions_prev_hash_idx").on(t.previousTokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const magicLinks = sqliteTable(
  "magic_links",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    invalidatedAt: integer("invalidated_at"),
    ipHash: text("ip_hash"),
  },
  (t) => [
    index("magic_links_email_created_idx").on(t.email, t.createdAt),
    index("magic_links_expires_idx").on(t.expiresAt),
  ],
);

export const betaInvites = sqliteTable(
  "beta_invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    note: text("note"),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    usedAt: integer("used_at"),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("beta_invites_created_idx").on(t.createdAt)],
);
