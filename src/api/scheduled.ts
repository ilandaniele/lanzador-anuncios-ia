import type { Env } from "./env";
import { logEvent, scrub } from "./lib/logger";
import { insertErrorEvent } from "./repositories/error-events";
import { runCleanup } from "./services/maintenance/cleanup";
import { enqueuePilotRuns } from "./services/maintenance/pilot";
import { enqueueInsightsPrewarm } from "./services/maintenance/prewarm";

async function recordCronFailure(
  db: D1Database,
  task: string,
  error: unknown,
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const event = {
    route: `cron:${task}`,
    code: "CRON_FAILED",
    message: scrub(err.message),
  };
  try {
    logEvent("error", "cron_failed", { ...event, stack: err.stack });
    await insertErrorEvent(db, { ...event, source: "cron" });
  } catch (recordError) {
    logEvent("error", "error_event_insert_failed", {
      route: event.route,
      message: String(recordError),
    });
  }
}

export async function scheduled(
  controller: ScheduledController,
  env: Env,
): Promise<void> {
  const at = controller.scheduledTime;
  const tasks = {
    cleanup: () => runCleanup(env.DB, at),
    prewarm: () => enqueueInsightsPrewarm(env, at),
    pilot: () => enqueuePilotRuns(env, at),
  };
  const names = Object.keys(tasks) as (keyof typeof tasks)[];
  const results = await Promise.allSettled(names.map((name) => tasks[name]()));
  await Promise.all(
    results.map((result, index) =>
      result.status === "rejected"
        ? recordCronFailure(env.DB, names[index]!, result.reason)
        : undefined,
    ),
  );
}
