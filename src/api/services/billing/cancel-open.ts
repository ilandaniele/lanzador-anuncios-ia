import type { Env } from "../../env";
import {
  cancelPreapproval,
  getPreapproval,
} from "../../integrations/mercadopago/client";
import { now } from "../../lib/time";
import type { Scope } from "../../repositories/scope";
import {
  markCancelled,
  type selectOpenSubscriptions,
} from "../../repositories/subscriptions";
import { manualAuditEntry } from "../audit-entry";

type OpenSubscription = Awaited<
  ReturnType<typeof selectOpenSubscriptions>
>[number];

const cancelAtProvider = async (
  env: Env,
  { providerSubscriptionId }: Pick<OpenSubscription, "providerSubscriptionId">,
) => {
  if (providerSubscriptionId === null) return;
  try {
    await cancelPreapproval(env, providerSubscriptionId);
  } catch (error) {
    const current = await getPreapproval(env, providerSubscriptionId).catch(
      () => null,
    );
    if (current?.status !== "cancelled") throw error;
  }
};

export async function cancelOpenSubscriptions(
  env: Env,
  scope: Scope,
  requestId: string,
  open: Pick<OpenSubscription, "id" | "providerSubscriptionId" | "planId">[],
): Promise<void> {
  if (open.length === 0) return;
  const outcomes = await Promise.allSettled(
    open.map((subscription) => cancelAtProvider(env, subscription)),
  );
  const cancelled = open.filter(
    (_, index) => outcomes[index]!.status === "fulfilled",
  );
  if (cancelled.length > 0) {
    await markCancelled(
      env.DB,
      scope,
      cancelled.map(({ id }) => id),
      now(),
      manualAuditEntry(scope, requestId, {
        action: "billing.subscription.cancel",
        objectType: "subscription",
        detail: { planIds: cancelled.map(({ planId }) => planId) },
      }),
    );
  }
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  if (failure) throw failure.reason;
}
