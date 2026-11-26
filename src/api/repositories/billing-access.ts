import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { subscriptions } from "../../db/schema/billing";
import { workspaces } from "../../db/schema/workspaces";
import {
  AUTHORIZATION_GRACE_MS,
  type BillingState,
  FREE_PLAN_ID,
  RENEWAL_SLACK_MS,
} from "../../shared/billing";

// drizzle drops the table prefix in single-table selects, which would bind
// the outer id to the subquery table; qualify the outer reference by hand.
const outerWorkspaceId = sql.raw('"workspaces"."id"');

const firstAuthorizedAtSql = sql<
  number | null
>`(SELECT min(${subscriptions.authorizedAt}) FROM ${subscriptions} WHERE ${subscriptions.workspaceId} = ${outerWorkspaceId})`;

const maxPaidUntilSql = sql<
  number | null
>`(SELECT max(${subscriptions.paidUntil}) FROM ${subscriptions} WHERE ${subscriptions.workspaceId} = ${outerWorkspaceId})`;

export const billingStateColumns = {
  planId: workspaces.planId,
  trialEndsAt: workspaces.trialEndsAt,
  firstAuthorizedAt: firstAuthorizedAtSql,
  paidUntil: maxPaidUntilSql,
};

export const toBillingState = (row: {
  planId: string;
  trialEndsAt: number | null;
  firstAuthorizedAt: number | null;
  paidUntil: number | null;
}): BillingState => ({
  planId: row.planId,
  trialEndsAt: row.trialEndsAt,
  firstAuthorizedAt: row.firstAuthorizedAt,
  paidUntil: row.paidUntil,
});

export const paidUntilCovers = (paidUntil: SQLWrapper, at: number): SQL =>
  sql`(coalesce(${paidUntil}, 0) + ${RENEWAL_SLACK_MS} > ${at})`;

export const authorizationGraceActive = (at: number): SQL =>
  sql`(${maxPaidUntilSql} IS NULL AND coalesce(${firstAuthorizedAtSql}, 0) + ${AUTHORIZATION_GRACE_MS} > ${at})`;

export const billingAllowed = (at: number): SQL =>
  sql`(${workspaces.planId} = ${FREE_PLAN_ID} OR coalesce(${workspaces.trialEndsAt}, 0) > ${at} OR ${authorizationGraceActive(at)} OR ${paidUntilCovers(maxPaidUntilSql, at)})`;
