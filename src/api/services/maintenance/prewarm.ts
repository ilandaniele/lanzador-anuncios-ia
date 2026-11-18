import type { Env } from "../../env";
import { HOUR_MS } from "../../lib/time";
import { selectRecentlyActiveWorkspaceIds } from "../../repositories/maintenance";
import { enqueueJob } from "../jobs";

const ACTIVE_WINDOW_MS = 2 * HOUR_MS;
const MAX_WORKSPACES_PER_RUN = 40;

export async function enqueueInsightsPrewarm(
  env: Pick<Env, "DB" | "JOB_WF">,
  at: number,
): Promise<void> {
  const workspaceIds = await selectRecentlyActiveWorkspaceIds(
    env.DB,
    at - ACTIVE_WINDOW_MS,
    MAX_WORKSPACES_PER_RUN,
  );
  const hour = Math.floor(at / HOUR_MS);
  await Promise.all(
    workspaceIds.map((workspaceId) =>
      enqueueJob(env, {
        kind: "insights_refresh",
        key: `${workspaceId}-${hour}`,
        workspaceId,
      }),
    ),
  );
}
