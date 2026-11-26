import type { Env } from "../../env";
import { HOUR_MS } from "../../lib/time";
import { selectPilotEligibleWorkspaceIds } from "../../repositories/maintenance";
import { enqueueJob } from "../jobs";

const PILOT_HOURS_UTC = [0, 6, 12, 18];
const MAX_WORKSPACES_PER_RUN = 40;

export async function enqueuePilotRuns(
  env: Pick<Env, "DB" | "JOB_WF">,
  at: number,
): Promise<void> {
  if (!PILOT_HOURS_UTC.includes(new Date(at).getUTCHours())) return;
  const workspaceIds = await selectPilotEligibleWorkspaceIds(
    env.DB,
    at,
    MAX_WORKSPACES_PER_RUN,
  );
  const hour = Math.floor(at / HOUR_MS);
  await Promise.all(
    workspaceIds.map((workspaceId) =>
      enqueueJob(env, {
        kind: "pilot_run",
        key: `${workspaceId}-${hour}`,
        workspaceId,
      }),
    ),
  );
}
