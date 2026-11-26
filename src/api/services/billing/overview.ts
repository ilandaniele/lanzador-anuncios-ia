import { FREE_PLAN_ID, isBillingBlocked } from "../../../shared/billing";
import type { BillingOverview } from "../../../shared/schemas/billing";
import { notFound } from "../../lib/errors";
import { now, toIsoOrNull } from "../../lib/time";
import { toBillingState } from "../../repositories/billing-access";
import type { Scope } from "../../repositories/scope";
import { selectBillingOverview } from "../../repositories/subscriptions";

export async function getBillingOverview(
  db: D1Database,
  scope: Scope,
): Promise<BillingOverview> {
  const { workspace, subscription, paidPlans } = await selectBillingOverview(
    db,
    scope,
  );
  if (!workspace) throw notFound();
  return {
    planId: workspace.planId,
    planName: workspace.planName,
    isFree: workspace.planId === FREE_PLAN_ID,
    blocked: isBillingBlocked(toBillingState(workspace), now()),
    trialEndsAt: toIsoOrNull(workspace.trialEndsAt),
    subscription: subscription && {
      planId: subscription.planId,
      status: subscription.status,
      paidUntil: toIsoOrNull(subscription.paidUntil),
    },
    plans: paidPlans,
  };
}
