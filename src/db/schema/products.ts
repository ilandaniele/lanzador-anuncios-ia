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
import { aiUsage } from "./ops";
import { workspaces } from "./workspaces";

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    landingUrl: text("landing_url").notNull(),
    primaryText: text("primary_text").notNull(),
    headline: text("headline").notNull(),
    description: text("description"),
    cta: text("cta").notNull().default("SHOP_NOW"),
    utm: text("utm"),
    priceMinor: integer("price_minor"),
    costMinor: integer("cost_minor"),
    currency: text("currency").notNull().default("USD"),
    archived: integer("archived").notNull().default(0),
    landingStatus: text("landing_status").notNull().default("unchecked"),
    landingHttpStatus: integer("landing_http_status"),
    landingError: text("landing_error"),
    landingCheckedAt: integer("landing_checked_at"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("products_landing_url_check", sql`${t.landingUrl} LIKE 'https://%'`),
    check(
      "products_cta_check",
      sql`${t.cta} IN ('SHOP_NOW','LEARN_MORE','ORDER_NOW','BUY_NOW','GET_OFFER','SIGN_UP')`,
    ),
    check("products_price_minor_check", sql`${t.priceMinor} > 0`),
    check(
      "products_cost_minor_check",
      sql`${t.costMinor} >= 0 AND ${t.costMinor} < ${t.priceMinor}`,
    ),
    check("products_archived_check", sql`${t.archived} IN (0,1)`),
    check(
      "products_landing_status_check",
      sql`${t.landingStatus} IN ('unchecked','ok','soft_ok','error')`,
    ),
    uniqueIndex("products_ws_name_unique").on(t.workspaceId, t.nameNormalized),
    index("products_ws_archived_updated_idx").on(
      t.workspaceId,
      t.archived,
      t.updatedAt,
    ),
  ],
);

export const productCopies = sqliteTable(
  "product_copies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    angle: text("angle").notNull(),
    customAngle: text("custom_angle"),
    primaryText: text("primary_text").notNull(),
    headline: text("headline").notNull(),
    description: text("description"),
    source: text("source").notNull(),
    edited: integer("edited").notNull().default(0),
    status: text("status").notNull().default("suggested"),
    favorite: integer("favorite").notNull().default(0),
    policyRisk: text("policy_risk").notNull().default("none"),
    policyNote: text("policy_note"),
    overLimit: integer("over_limit").notNull().default(0),
    aiUsageId: text("ai_usage_id").references(() => aiUsage.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "product_copies_angle_check",
      sql`${t.angle} IN ('dolor','beneficio','prueba_social','oferta','urgencia','libre','manual')`,
    ),
    check("product_copies_source_check", sql`${t.source} IN ('ai','manual')`),
    check("product_copies_edited_check", sql`${t.edited} IN (0,1)`),
    check(
      "product_copies_status_check",
      sql`${t.status} IN ('suggested','saved','discarded')`,
    ),
    check("product_copies_favorite_check", sql`${t.favorite} IN (0,1)`),
    check(
      "product_copies_policy_risk_check",
      sql`${t.policyRisk} IN ('none','low','high')`,
    ),
    check("product_copies_over_limit_check", sql`${t.overLimit} IN (0,1)`),
    index("product_copies_product_status_idx").on(
      t.workspaceId,
      t.productId,
      t.status,
      t.createdAt,
    ),
  ],
);
