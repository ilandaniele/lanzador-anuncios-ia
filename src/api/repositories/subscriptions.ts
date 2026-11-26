import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { plans } from "../../db/schema/auth";
import { subscriptions } from "../../db/schema/billing";
import { workspaces } from "../../db/schema/workspaces";
import {
  FREE_PLAN_ID,
  PAID_PLAN_IDS,
  type PaidPlanId,
  type SubscriptionStatus,
} from "../../shared/billing";
import { auditStatement, type AuditEntry } from "./audit";
import {
  authorizationGraceActive,
  billingStateColumns,
  paidUntilCovers,
} from "./billing-access";
import { inWorkspace, type Scope } from "./scope";

const OPEN_STATUSES = ["pending", "authorized", "paused"] as const;

const paidPlanColumns = {
  id: sql<PaidPlanId>`${plans.id}`,
  name: plans.name,
  priceMonthlyMinor: plans.priceMonthlyMinor,
  currency: plans.currency,
  maxMembers: plans.maxMembers,
  maxAdAccounts: plans.maxAdAccounts,
};

const activePaidPlans = and(
  inArray(plans.id, [...PAID_PLAN_IDS]),
  eq(plans.isActive, 1),
);

export type PendingSubscriptionInsert = {
  id: string;
  workspaceId: string;
  planId: PaidPlanId;
  amountMinor: number;
  currency: string;
  createdBy: string;
  at: number;
};

export type SubscriptionChange = {
  id: string;
  workspaceId: string;
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  paidUntil: number | null;
  at: number;
};

export async function selectBillingOverview(db: D1Database, scope: Scope) {
  const orm = drizzle(db);
  const [[workspace], [subscription], paidPlans] = await orm.batch([
    orm
      .select({ planName: plans.name, ...billingStateColumns })
      .from(workspaces)
      .innerJoin(plans, eq(plans.id, workspaces.planId))
      .where(eq(workspaces.id, scope.workspaceId))
      .limit(1),
    orm
      .select({
        planId: sql<PaidPlanId>`${subscriptions.planId}`,
        status: sql<SubscriptionStatus>`${subscriptions.status}`,
        paidUntil: subscriptions.paidUntil,
      })
      .from(subscriptions)
      .where(inWorkspace(subscriptions, scope))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
    orm
      .select(paidPlanColumns)
      .from(plans)
      .where(activePaidPlans)
      .orderBy(plans.priceMonthlyMinor),
  ]);
  return {
    workspace: workspace ?? null,
    subscription: subscription ?? null,
    paidPlans,
  };
}

export async function findPaidPlan(db: D1Database, planId: PaidPlanId) {
  const [row] = await drizzle(db)
    .select(paidPlanColumns)
    .from(plans)
    .where(and(activePaidPlans, eq(plans.id, planId)))
    .limit(1);
  return row ?? null;
}

export const selectOpenSubscriptions = (db: D1Database, scope: Scope) =>
  drizzle(db)
    .select({
      id: subscriptions.id,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      planId: sql<PaidPlanId>`${subscriptions.planId}`,
      status: sql<SubscriptionStatus>`${subscriptions.status}`,
    })
    .from(subscriptions)
    .where(
      and(
        inWorkspace(subscriptions, scope),
        inArray(subscriptions.status, [...OPEN_STATUSES]),
      ),
    );

export async function findSubscriptionById(db: D1Database, id: string) {
  const [row] = await drizzle(db)
    .select({
      id: subscriptions.id,
      workspaceId: subscriptions.workspaceId,
      planId: sql<PaidPlanId>`${subscriptions.planId}`,
      status: sql<SubscriptionStatus>`${subscriptions.status}`,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      amountMinor: subscriptions.amountMinor,
      currency: subscriptions.currency,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);
  return row ?? null;
}

export async function insertPendingSubscription(
  db: D1Database,
  { at, ...row }: PendingSubscriptionInsert,
) {
  await drizzle(db)
    .insert(subscriptions)
    .values({ ...row, status: "pending", createdAt: at, updatedAt: at });
}

export async function attachProviderSubscription(
  db: D1Database,
  scope: Scope,
  id: string,
  providerSubscriptionId: string,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(subscriptions)
      .set({ providerSubscriptionId })
      .where(
        and(
          inWorkspace(subscriptions, scope),
          eq(subscriptions.id, id),
          isNull(subscriptions.providerSubscriptionId),
        ),
      ),
    auditStatement(db, audit),
  ]);
}

export async function deleteSubscription(
  db: D1Database,
  scope: Scope,
  id: string,
) {
  await drizzle(db)
    .delete(subscriptions)
    .where(and(inWorkspace(subscriptions, scope), eq(subscriptions.id, id)));
}

const grantingPlanSql = (workspaceId: string, at: number) =>
  sql`(SELECT ${subscriptions.planId} FROM ${subscriptions} WHERE ${subscriptions.workspaceId} = ${workspaceId} AND (${paidUntilCovers(subscriptions.paidUntil, at)} OR (${subscriptions.status} = 'authorized' AND ${authorizationGraceActive(at)})) ORDER BY ${paidUntilCovers(subscriptions.paidUntil, at)} DESC, ${subscriptions.paidUntil} DESC, ${subscriptions.createdAt} DESC LIMIT 1)`;

export async function applySubscriptionUpdate(
  db: D1Database,
  change: SubscriptionChange,
): Promise<boolean> {
  const orm = drizzle(db);
  const paidUntilOrKept = sql`coalesce(${change.paidUntil}, ${subscriptions.paidUntil})`;
  const grantingPlan = grantingPlanSql(change.workspaceId, change.at);
  const [changedRows] = await orm.batch([
    orm
      .update(subscriptions)
      .set({
        status: change.status,
        paidUntil: paidUntilOrKept,
        providerSubscriptionId: sql`coalesce(${subscriptions.providerSubscriptionId}, ${change.providerSubscriptionId})`,
        authorizedAt:
          change.status === "authorized"
            ? sql`coalesce(${subscriptions.authorizedAt}, ${change.at})`
            : undefined,
        updatedAt: change.at,
      })
      .where(
        and(
          eq(subscriptions.id, change.id),
          eq(subscriptions.workspaceId, change.workspaceId),
          change.status === "cancelled"
            ? undefined
            : ne(subscriptions.status, "cancelled"),
          sql`(${subscriptions.status} != ${change.status} OR ${subscriptions.paidUntil} IS NOT ${paidUntilOrKept} OR ${subscriptions.providerSubscriptionId} IS NULL)`,
        ),
      )
      .returning({ id: subscriptions.id }),
    orm
      .update(workspaces)
      .set({ planId: grantingPlan, updatedAt: change.at })
      .where(
        and(
          eq(workspaces.id, change.workspaceId),
          ne(workspaces.planId, FREE_PLAN_ID),
          sql`${grantingPlan} IS NOT NULL`,
          sql`${workspaces.planId} IS NOT ${grantingPlan}`,
        ),
      ),
  ]);
  return changedRows.length > 0;
}

export async function markCancelled(
  db: D1Database,
  scope: Scope,
  ids: string[],
  at: number,
  audit: AuditEntry,
) {
  const orm = drizzle(db);
  await orm.batch([
    orm
      .update(subscriptions)
      .set({ status: "cancelled", updatedAt: at })
      .where(
        and(inWorkspace(subscriptions, scope), inArray(subscriptions.id, ids)),
      ),
    auditStatement(db, audit),
  ]);
}
