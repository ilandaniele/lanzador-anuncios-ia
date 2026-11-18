import { WORKSPACE_PURGE_DELAY_MS } from "../../../shared/constants";
import type { Env } from "../../env";
import { HOUR_MS } from "../../lib/time";
import {
  deletePurgeableWorkspace,
  selectPurgeableWorkspaceIds,
} from "../../repositories/workspace-purge";
import { enqueueJob } from "../jobs";

const MAX_WORKSPACES_PER_RUN = 40;

export async function enqueueWorkspacePurges(
  env: Pick<Env, "DB" | "JOB_WF">,
  at: number,
): Promise<void> {
  const workspaceIds = await selectPurgeableWorkspaceIds(
    env.DB,
    at - WORKSPACE_PURGE_DELAY_MS,
    MAX_WORKSPACES_PER_RUN,
  );
  const hour = Math.floor(at / HOUR_MS);
  await Promise.all(
    workspaceIds.map((workspaceId) =>
      enqueueJob(env, {
        kind: "purge_workspace",
        key: `${workspaceId}-${hour}`,
        workspaceId,
      }),
    ),
  );
}

export const purgeWorkspace = (
  db: D1Database,
  workspaceId: string,
  at: number,
) => deletePurgeableWorkspace(db, workspaceId, at - WORKSPACE_PURGE_DELAY_MS);
