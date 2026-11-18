import { AI_TAGGING_ESTIMATED_NEURONS } from "../../../shared/constants";
import type { Env } from "../../env";
import { throwFirstRejection } from "../../lib/settled";
import { HOUR_MS, utcPeriods } from "../../lib/time";
import {
  moveAiStatus,
  selectPendingTagsWithBudget,
} from "../../repositories/pending-tags";
import { enqueueJob } from "../jobs";

const RETAG_LIMITS = {
  neuronsPerTag: AI_TAGGING_ESTIMATED_NEURONS,
  perWorkspace: 5,
  total: 50,
};

export async function requeuePendingTags(
  env: Pick<Env, "DB" | "JOB_WF" | "WORKERS_AI_DAILY_NEURON_CAP">,
  at: number,
): Promise<void> {
  const pending = await selectPendingTagsWithBudget(
    env.DB,
    utcPeriods(at),
    env.WORKERS_AI_DAILY_NEURON_CAP,
    RETAG_LIMITS,
  );
  await moveAiStatus(
    env.DB,
    pending.map(({ id }) => id),
    { from: "pending", to: "queued" },
    at,
  );
  const hour = Math.floor(at / HOUR_MS);
  const results = await Promise.allSettled(
    pending.map(({ id, workspaceId }) =>
      enqueueJob(env, {
        kind: "tag_creative",
        key: `${id}-${hour}`,
        workspaceId,
        payload: { creativeId: id },
      }),
    ),
  );
  const notQueued = pending
    .filter((_, index) => results[index]!.status === "rejected")
    .map(({ id }) => id);
  await moveAiStatus(env.DB, notQueued, { from: "queued", to: "pending" }, at);
  throwFirstRejection(results);
}
