import type { PaidPlanId } from "../../../shared/billing";
import type { Env } from "../../env";
import { createPreapproval } from "../../integrations/mercadopago/client";
import { AppError, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import type { Scope } from "../../repositories/scope";
import { isUniqueViolation } from "../../repositories/db-errors";
import {
  attachProviderSubscription,
  deleteSubscription,
  findPaidPlan,
  insertPendingSubscription,
  type PendingSubscriptionInsert,
  selectOpenSubscriptions,
} from "../../repositories/subscriptions";
import type { SessionUser } from "../../types";
import { manualAuditEntry } from "../audit-entry";
import { cancelOpenSubscriptions } from "./cancel-open";

type BillingSecrets = Pick<Env, "MP_ACCESS_TOKEN" | "MP_WEBHOOK_SECRET">;

export const isBillingConfigured = <Configurable extends BillingSecrets>(
  env: Configurable,
): env is Configurable & Record<keyof BillingSecrets, string> =>
  Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET);

export async function subscribeToPlan(
  env: Env,
  scope: Scope,
  user: SessionUser,
  planId: PaidPlanId,
  requestId: string,
): Promise<{ initPoint: string }> {
  if (!isBillingConfigured(env)) throw new AppError(503, "BILLING_UNAVAILABLE");
  const open = await selectOpenSubscriptions(env.DB, scope);
  if (open.some(({ status }) => status !== "pending")) {
    throw conflict("SUBSCRIPTION_ACTIVE");
  }
  const plan = await findPaidPlan(env.DB, planId);
  if (!plan || plan.currency !== "ARS") throw notFound();

  await cancelOpenSubscriptions(env, scope, requestId, open);
  const subscriptionId = newId();
  await reserveSubscription(env.DB, {
    id: subscriptionId,
    workspaceId: scope.workspaceId,
    planId: plan.id,
    amountMinor: plan.priceMonthlyMinor,
    currency: plan.currency,
    createdBy: user.id,
    at: now(),
  });

  const preapproval = await createPreapproval(env, {
    reason: `Lanzador ${plan.name}`,
    amountMinor: plan.priceMonthlyMinor,
    currency: plan.currency,
    backUrl: `${env.APP_ORIGIN}/w/${scope.workspaceId}/ajustes/facturacion`,
    payerEmail: user.email,
    externalReference: subscriptionId,
  }).catch(async (error: unknown) => {
    await deleteSubscription(env.DB, scope, subscriptionId);
    throw error;
  });
  await attachProviderSubscription(
    env.DB,
    scope,
    subscriptionId,
    preapproval.id,
    manualAuditEntry(scope, requestId, {
      action: "billing.subscription.create",
      objectType: "subscription",
      detail: { planId: plan.id },
    }),
  );
  return { initPoint: preapproval.initPoint };
}

async function reserveSubscription(
  db: D1Database,
  row: PendingSubscriptionInsert,
) {
  try {
    await insertPendingSubscription(db, row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("SUBSCRIPTION_ACTIVE");
    throw error;
  }
}
