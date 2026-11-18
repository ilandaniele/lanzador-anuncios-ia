import type { Env } from "../../env";
import { createInstanceOnce, type LaunchParams } from "./launch-instance";

export interface LaunchItemParams extends Omit<LaunchParams, "segment"> {
  itemId: string;
  adsetId: string;
  parentInstanceId: string;
}

export const launchItemInstanceId = ({
  itemId,
  attempt,
}: Pick<LaunchItemParams, "itemId" | "attempt">) => `item-${itemId}-${attempt}`;

export const launchItemEvent = (itemId: string) => `item-${itemId}`;

export const createLaunchItemInstance = (
  env: Pick<Env, "LAUNCH_ITEM_WF">,
  params: LaunchItemParams,
): Promise<string> =>
  createInstanceOnce(
    env.LAUNCH_ITEM_WF as Workflow<LaunchItemParams>,
    launchItemInstanceId(params),
    params,
  );

export async function notifyLaunch(
  env: Pick<Env, "LAUNCH_WF">,
  { parentInstanceId, itemId }: LaunchItemParams,
) {
  const parent = await env.LAUNCH_WF.get(parentInstanceId);
  await parent.sendEvent({ type: launchItemEvent(itemId), payload: null });
}
