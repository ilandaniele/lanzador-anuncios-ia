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
import { workspaces } from "./workspaces";

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    providerSubscriptionId: text("provider_subscription_id"),
    status: text("status").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    paidUntil: integer("paid_until"),
    authorizedAt: integer("authorized_at"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "subscriptions_status_check",
      sql`${t.status} IN ('pending','authorized','paused','cancelled')`,
    ),
    check("subscriptions_plan_check", sql`${t.planId} IN ('starter','pro')`),
    uniqueIndex("subscriptions_provider_id_unique").on(
      t.providerSubscriptionId,
    ),
    uniqueIndex("subscriptions_open_workspace_unique")
      .on(t.workspaceId)
      .where(sql`${t.status} IN ('pending','authorized','paused')`),
    index("subscriptions_ws_status_idx").on(t.workspaceId, t.status),
  ],
);
