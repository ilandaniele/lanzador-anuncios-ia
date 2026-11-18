import {
  readLaunchCounters,
  selectPendingItems,
} from "../../api/repositories/launch-run";
import {
  createLaunchInstance,
  type LaunchParams,
} from "../../api/services/launch/launch-instance";
import type { LaunchContext } from "./context";
import { createLaunchItem } from "./item";

const BATCH_SIZE = 5;
const BATCH_PAUSE = "20 seconds";

export async function createLaunchItems(
  context: LaunchContext,
  params: LaunchParams,
  adsetId: string,
): Promise<boolean> {
  const { env, step, scope, launchId, budget } = context;
  for (let batch = 1; ; batch++) {
    const items = await step.do(`load batch ${batch}`, () =>
      selectPendingItems(env.DB, scope, launchId, BATCH_SIZE),
    );
    if (items.length === 0) return true;
    for (const item of items) await createLaunchItem(context, item, adsetId);
    await step.do(`read counters ${batch}`, () =>
      readLaunchCounters(env.DB, scope, launchId),
    );
    if (items.length < BATCH_SIZE) return true;
    if (budget.needsContinuation()) {
      await step.do("continue in new instance", () =>
        createLaunchInstance(env, { ...params, segment: params.segment + 1 }),
      );
      return false;
    }
    await step.sleep(`pause ${batch}`, BATCH_PAUSE);
  }
}
