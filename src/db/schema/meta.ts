import { sql } from "drizzle-orm";
import {
  blob,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

export const metaConnections = sqliteTable(
  "meta_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    metaBusinessId: text("meta_business_id").notNull(),
    businessName: text("business_name"),
    metaUserId: text("meta_user_id").notNull(),
    tokenType: text("token_type").notNull().default("system_user"),
    tokenCiphertext: blob("token_ciphertext", { mode: "buffer" }).notNull(),
    tokenIv: blob("token_iv", { mode: "buffer" }).notNull(),
    tokenKeyVersion: integer("token_key_version").notNull(),
    tokenExpiresAt: integer("token_expires_at"),
    scopes: text("scopes").notNull().default("[]"),
    status: text("status").notNull().default("active"),
    lastErrorCode: integer("last_error_code"),
    lastErrorAt: integer("last_error_at"),
    connectedBy: text("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "meta_connections_token_type_check",
      sql`${t.tokenType} IN ('system_user','user')`,
    ),
    check("meta_connections_scopes_check", sql`json_valid(${t.scopes})`),
    check(
      "meta_connections_status_check",
      sql`${t.status} IN ('active','reconnect_required')`,
    ),
    uniqueIndex("meta_connections_ws_business_unique").on(
      t.workspaceId,
      t.metaBusinessId,
    ),
    index("meta_connections_user_idx").on(t.metaUserId),
    index("meta_connections_key_idx").on(t.tokenKeyVersion),
  ],
);

export const metaAssets = sqliteTable(
  "meta_assets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => metaConnections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    metaId: text("meta_id").notNull(),
    name: text("name").notNull(),
    parentMetaId: text("parent_meta_id"),
    currency: text("currency"),
    timezoneName: text("timezone_name"),
    accountStatus: integer("account_status"),
    disableReason: integer("disable_reason"),
    fundingOk: integer("funding_ok"),
    spendCapPct: integer("spend_cap_pct"),
    healthCheckedAt: integer("health_checked_at"),
    enabled: integer("enabled").notNull().default(0),
    missingSince: integer("missing_since"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "meta_assets_kind_check",
      sql`${t.kind} IN ('ad_account','page','instagram','pixel')`,
    ),
    check("meta_assets_funding_ok_check", sql`${t.fundingOk} IN (0,1)`),
    check("meta_assets_enabled_check", sql`${t.enabled} IN (0,1)`),
    uniqueIndex("meta_assets_ws_kind_meta_unique").on(
      t.workspaceId,
      t.kind,
      t.metaId,
    ),
    index("meta_assets_ws_kind_enabled_idx").on(
      t.workspaceId,
      t.kind,
      t.enabled,
    ),
    index("meta_assets_connection_idx").on(t.connectionId),
  ],
);

export const googleConnections = sqliteTable(
  "google_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    googleEmail: text("google_email").notNull(),
    refreshTokenCiphertext: blob("refresh_token_ciphertext", {
      mode: "buffer",
    }).notNull(),
    refreshTokenIv: blob("refresh_token_iv", { mode: "buffer" }).notNull(),
    tokenKeyVersion: integer("token_key_version").notNull(),
    scopes: text("scopes").notNull().default("[]"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("google_connections_scopes_check", sql`json_valid(${t.scopes})`),
    check(
      "google_connections_status_check",
      sql`${t.status} IN ('active','reconnect_required')`,
    ),
    uniqueIndex("google_connections_ws_user_unique").on(
      t.workspaceId,
      t.userId,
    ),
    index("google_connections_key_idx").on(t.tokenKeyVersion),
  ],
);
