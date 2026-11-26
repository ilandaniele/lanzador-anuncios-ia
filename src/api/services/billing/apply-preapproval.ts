import type { Env } from "../../env";
import {
  cancelPreapproval,
  getPreapproval,
} from "../../integrations/mercadopago/client";
import { logEvent } from "../../lib/logger";
import { now } from "../../lib/time";
import { writeAudit } from "../../repositories/audit";
import {
  applySubscriptionUpdate,
  findSubscriptionById,
} from "../../repositories/subscriptions";

export async function applyPreapproval(
  env: Env,
  preapprovalId: string,
  requestId: string,
) {
  const preapproval = await getPreapproval(env, preapprovalId);
  const row = await findSubscriptionById(env.DB, preapproval.externalReference);
  if (!row) {
    logEvent("warn", "billing.webhook_unknown", { requestId });
    return;
  }
  const matches =
    preapproval.amountMinor === row.amountMinor &&
    preapproval.currency === row.currency &&
    (row.providerSubscriptionId ?? preapproval.id) === preapproval.id;
  if (!matches) {
    logEvent("warn", "billing.webhook_mismatch", { requestId });
    return;
  }

  const reopened =
    row.status === "cancelled" && preapproval.status !== "cancelled";
  if (reopened) {
    logEvent("warn", "billing.webhook_reopened_cancelled", { requestId });
    await cancelPreapproval(env, preapproval.id).catch(() => undefined);
  }
  const status = reopened ? "cancelled" : preapproval.status;

  const changed = await applySubscriptionUpdate(env.DB, {
    id: row.id,
    workspaceId: row.workspaceId,
    providerSubscriptionId: preapproval.id,
    status,
    paidUntil: preapproval.paidUntil,
    at: now(),
  });
  if (changed) {
    await writeAudit(env.DB, {
      workspaceId: row.workspaceId,
      actorUserId: null,
      actorType: "system",
      origin: "system",
      action: "billing.subscription.update",
      objectType: "subscription",
      detail: { planId: row.planId, status },
      requestId,
    });
  }
}
