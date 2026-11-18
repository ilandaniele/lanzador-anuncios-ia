import type { WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import type { Env } from "../../api/env";
import type { JobPayload } from "../../api/services/jobs";

export const JOB_STEP_CONFIG = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
} satisfies WorkflowStepConfig;

export interface JobContext {
  env: Env;
  step: WorkflowStep;
  key: string;
  workspaceId: string | null;
  payload: JobPayload;
}

export type JobHandler = (context: JobContext) => Promise<void>;
