import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../api/env";
import { type JobParams, recordJobFailure } from "../api/services/jobs";
import { JOB_HANDLERS } from "./jobs";

export class JobWorkflow extends WorkflowEntrypoint<Env, JobParams> {
  async run(event: WorkflowEvent<JobParams>, step: WorkflowStep) {
    const job = event.payload;
    try {
      await this.dispatch(job, step);
    } catch (error) {
      await step.do("record failure", () =>
        recordJobFailure(this.env.DB, job, error),
      );
      throw error;
    }
  }

  private async dispatch(job: JobParams, step: WorkflowStep) {
    const handler = JOB_HANDLERS[job.kind];
    if (!handler) throw new NonRetryableError(`No handler for ${job.kind}`);
    await handler({
      env: this.env,
      step,
      key: job.key,
      workspaceId: job.workspaceId,
      payload: job.payload ?? {},
    });
  }
}
