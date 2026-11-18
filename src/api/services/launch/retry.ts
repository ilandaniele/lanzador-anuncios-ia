import {
  isLaunchInFlight,
  RETRYABLE_LAUNCH_STATUSES,
} from "../../../shared/launch-status";
import type { Env } from "../../env";
import { conflict, notFound } from "../../lib/errors";
import {
  findLaunchForRetry,
  requeueFailedItems,
} from "../../repositories/launch-retry";
import type { Scope } from "../../repositories/scope";
import {
  createLaunchInstance,
  firstSegmentParams,
  launchInstanceId,
} from "./launch-instance";

export async function retryFailedItems(env: Env, scope: Scope, id: string) {
  const launch = await findLaunchForRetry(env.DB, scope, id);
  if (!launch) throw notFound();
  if (isLaunchInFlight(launch.status)) throw conflict("LAUNCH_RUNNING");
  if (
    !RETRYABLE_LAUNCH_STATUSES.includes(launch.status) ||
    launch.itemsFailed === 0
  ) {
    throw conflict("NOTHING_TO_RETRY");
  }
  const params = firstSegmentParams(scope, id, launch.attempt + 1);
  const requeued = await requeueFailedItems(env.DB, scope, id, {
    fromAttempt: launch.attempt,
    workflowInstanceId: launchInstanceId(params),
  });
  if (!requeued) throw conflict("LAUNCH_RUNNING");
  await createLaunchInstance(env, params);
  return { status: "queued" as const };
}
