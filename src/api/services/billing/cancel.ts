import type { Env } from "../../env";
import { AppError, notFound } from "../../lib/errors";
import type { Scope } from "../../repositories/scope";
import { selectOpenSubscriptions } from "../../repositories/subscriptions";
import { cancelOpenSubscriptions } from "./cancel-open";

export async function cancelSubscriptions(
  env: Env,
  scope: Scope,
  requestId: string,
): Promise<void> {
  if (!env.MP_ACCESS_TOKEN) throw new AppError(503, "BILLING_UNAVAILABLE");
  const open = await selectOpenSubscriptions(env.DB, scope);
  if (open.length === 0) throw notFound();
  await cancelOpenSubscriptions(env, scope, requestId, open);
}
