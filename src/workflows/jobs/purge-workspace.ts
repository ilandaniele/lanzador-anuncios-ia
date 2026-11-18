import { NonRetryableError } from "cloudflare:workflows";
import { now } from "../../api/lib/time";
import { purgeWorkspace } from "../../api/services/maintenance/purge";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

export const purgeWorkspaceJob: JobHandler = async ({
  env,
  step,
  workspaceId,
}) => {
  if (!workspaceId) {
    throw new NonRetryableError("Invalid purge_workspace job");
  }
  await step.do("purge workspace", JOB_STEP_CONFIG, () =>
    purgeWorkspace(env.DB, workspaceId, now()),
  );
};
