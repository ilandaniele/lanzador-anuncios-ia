import type {
  LaunchActivateRequest,
  LaunchStatus,
} from "../../../shared/schemas/launch";
import type { Env } from "../../env";
import { conflict, notFound, unprocessable } from "../../lib/errors";
import { now } from "../../lib/time";
import {
  claimActivation,
  findLaunchForActivate,
} from "../../repositories/launch-activate";
import type { Scope } from "../../repositories/scope";
import { enqueueJob } from "../jobs";

const ACTIVATABLE_STATUSES: readonly LaunchStatus[] = [
  "paused_verified",
  "verified_with_errors",
];

export async function activateLaunch(
  env: Env,
  scope: Scope,
  id: string,
  { startAt }: LaunchActivateRequest,
) {
  const launch = await findLaunchForActivate(env.DB, scope, id);
  if (!launch) throw notFound();
  if (!ACTIVATABLE_STATUSES.includes(launch.status)) {
    throw conflict("NOT_PAUSED");
  }
  if (launch.checksOk !== 1) throw conflict("CHECKS_NOT_GREEN");
  const at = now();
  if (startAt && Date.parse(startAt) <= at) {
    throw unprocessable("START_IN_PAST");
  }
  const claimed = await claimActivation(env.DB, scope, id, {
    fromStatus: launch.status,
    at,
  });
  if (!claimed) throw conflict("NOT_PAUSED");
  await enqueueJob(env, {
    kind: "activate_launch",
    key: `${id}-${at}`,
    workspaceId: scope.workspaceId,
    payload: {
      launchId: id,
      userId: scope.userId,
      fromStatus: launch.status,
      startAt: startAt ?? null,
    },
  });
  return { status: "activating" as const };
}
