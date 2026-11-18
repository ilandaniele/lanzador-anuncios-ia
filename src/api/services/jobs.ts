import type { Env } from "../env";
import { sha256Hex } from "../lib/hash";
import { logEvent, scrub } from "../lib/logger";
import { insertErrorEvent } from "../repositories/error-events";

export const JOB_KINDS = [
  "activate_launch",
  "drive_import_file",
  "meta_video_status",
  "tag_creative",
  "insights_refresh",
  "pilot_run",
  "purge_workspace",
  "meta_disconnect_cleanup",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export type JobPayload = Record<string, string | number | boolean | null>;

export interface JobParams {
  kind: JobKind;
  key: string;
  workspaceId: string | null;
  payload?: JobPayload;
}

export const jobInstanceId = ({ kind, key }: Pick<JobParams, "kind" | "key">) =>
  `${kind}-${key}`;

function jobBinding(env: Pick<Env, "JOB_WF">): Workflow<JobParams> {
  if (!env.JOB_WF) throw new Error("JOB_WF binding is not configured");
  return env.JOB_WF as Workflow<JobParams>;
}

export async function enqueueJob(
  env: Pick<Env, "JOB_WF">,
  job: JobParams,
): Promise<string> {
  const binding = jobBinding(env);
  const id = jobInstanceId(job);
  try {
    await binding.create({ id, params: job });
  } catch (error) {
    await binding.get(id).catch(() => {
      throw error;
    });
  }
  return id;
}

export async function recordJobFailure(
  db: D1Database,
  job: JobParams,
  error: unknown,
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const event = {
    route: jobInstanceId(job),
    code: "JOB_FAILED",
    message: scrub(err.message),
  };

  try {
    logEvent("error", "job_failed", { ...event, stack: err.stack });
    await insertErrorEvent(db, {
      ...event,
      source: "workflow",
      stackHash: err.stack ? await sha256Hex(err.stack) : null,
      workspaceId: job.workspaceId,
    });
  } catch (recordError) {
    logEvent("error", "error_event_insert_failed", {
      route: event.route,
      message: String(recordError),
    });
  }
}
