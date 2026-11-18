import type {
  LaunchDraft,
  LaunchStartRequest,
} from "../../../shared/schemas/launch";
import type { Env } from "../../env";
import { AppError, conflict, notFound } from "../../lib/errors";
import {
  findLaunchForStart,
  type NewLaunchItem,
  queueLaunch,
} from "../../repositories/launch-run";
import type { Scope } from "../../repositories/scope";
import {
  createLaunchInstance,
  firstSegmentParams,
  launchInstanceId,
} from "./launch-instance";
import { computeLaunchPlan, parseCompleteDraft } from "./simulate";

const toLaunchItem = ({
  source,
  creativeId,
  cloneAdId,
  cloneStoryId,
  copyId,
  adName,
}: LaunchDraft["items"][number]): NewLaunchItem => ({
  source,
  creativeId,
  cloneSourceAdId: cloneAdId,
  cloneStoryId,
  copyId,
  adName,
});

export async function startLaunch(
  env: Env,
  scope: Scope,
  id: string,
  { planHash }: LaunchStartRequest,
) {
  const launch = await findLaunchForStart(env.DB, scope, id);
  if (!launch) throw notFound();
  if (launch.status !== "simulated") throw conflict("NOT_SIMULATED");
  if (launch.planHash !== planHash) throw conflict("PLAN_CHANGED");
  const plan = await computeLaunchPlan(env, scope, launch);
  if (plan.blockers.length > 0) {
    const fields = Object.fromEntries(
      plan.blockers.map(({ code, text }) => [code, text]),
    );
    throw new AppError(422, "BLOCKERS", { fields });
  }
  if (plan.planHash !== planHash) throw conflict("PLAN_CHANGED");
  const params = firstSegmentParams(scope, id, launch.attempt + 1);
  const queued = await queueLaunch(env.DB, scope, id, {
    planHash,
    draftUpdatedAt: launch.updatedAt,
    attempt: params.attempt,
    workflowInstanceId: launchInstanceId(params),
    items: parseCompleteDraft(launch.draft).items.map(toLaunchItem),
  });
  if (!queued) throw conflict("PLAN_CHANGED");
  await createLaunchInstance(env, params);
  return { status: "queued" as const };
}
