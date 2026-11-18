import { NonRetryableError } from "cloudflare:workflows";
import { AppError } from "../../api/lib/errors";
import type { Scope } from "../../api/repositories/scope";
import { runPilot } from "../../api/services/pilot/run";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const JOB_USER_ID = "job:pilot_run";

const jobScope = (workspaceId: string): Scope => ({
  workspaceId,
  userId: JOB_USER_ID,
  role: "viewer",
});

const isRunInProgress = (error: unknown) =>
  error instanceof AppError && error.code === "RUN_IN_PROGRESS";

export const pilotRunJob: JobHandler = async ({ env, step, workspaceId }) => {
  if (!workspaceId) throw new NonRetryableError("Invalid pilot_run job");
  const scope = jobScope(workspaceId);
  await step.do("run pilot", JOB_STEP_CONFIG, async () => {
    await runPilot(env, scope, "cron").catch((error: unknown) => {
      if (!isRunInProgress(error)) throw error;
    });
  });
};
