import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../api/env";
import { failLaunch } from "../api/repositories/launch-run";
import type { LaunchParams } from "../api/services/launch/launch-instance";
import { launchScope } from "./launch/context";
import { launchFailure } from "./launch/failure";
import { runLaunch } from "./launch/run";

export class LaunchWorkflow extends WorkflowEntrypoint<Env, LaunchParams> {
  async run(event: WorkflowEvent<LaunchParams>, step: WorkflowStep) {
    const params = event.payload;
    try {
      await runLaunch(this.env, step, params);
    } catch (error) {
      await step.do("fail launch", () =>
        failLaunch(
          this.env.DB,
          launchScope(params),
          params.launchId,
          launchFailure(error),
        ),
      );
      throw error;
    }
  }
}
