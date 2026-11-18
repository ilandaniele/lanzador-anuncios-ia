import {
  readLaunchCounters,
  selectPendingItems,
} from "../../api/repositories/launch-run";
import {
  createLaunchItemInstance,
  launchItemEvent,
} from "../../api/services/launch/item-instance";
import {
  createLaunchInstance,
  launchInstanceId,
  type LaunchParams,
} from "../../api/services/launch/launch-instance";
import type { LaunchContext } from "./context";

const BATCH_SIZE = 5;
const BATCH_PAUSE = "20 seconds";
const ITEM_TIMEOUT = "2 hours";

async function runBatch(
  context: LaunchContext,
  params: LaunchParams,
  adsetId: string,
  batch: number,
  itemIds: string[],
) {
  const { env, step, budget } = context;
  const { launchId, workspaceId, userId, attempt } = params;
  const parentInstanceId = launchInstanceId(params);
  budget.charge(itemIds.length);
  await step.do(`start batch ${batch}`, () =>
    Promise.all(
      itemIds.map((itemId) =>
        createLaunchItemInstance(env, {
          launchId,
          workspaceId,
          userId,
          attempt,
          itemId,
          adsetId,
          parentInstanceId,
        }),
      ),
    ),
  );
  for (const itemId of itemIds) {
    await step.waitForEvent(`item ${itemId}`, {
      type: launchItemEvent(itemId),
      timeout: ITEM_TIMEOUT,
    });
  }
}

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
    await runBatch(
      context,
      params,
      adsetId,
      batch,
      items.map(({ id }) => id),
    );
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
