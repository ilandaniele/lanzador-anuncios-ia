import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../api/env";
import type { LaunchItemParams } from "../api/services/launch/item-instance";
import { runLaunchItem } from "./launch/item";

export class LaunchItemWorkflow extends WorkflowEntrypoint<
  Env,
  LaunchItemParams
> {
  async run(event: WorkflowEvent<LaunchItemParams>, step: WorkflowStep) {
    await runLaunchItem(this.env, step, event.payload);
  }
}
